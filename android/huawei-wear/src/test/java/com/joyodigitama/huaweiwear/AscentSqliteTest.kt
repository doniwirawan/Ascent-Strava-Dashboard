package com.joyodigitama.huaweiwear

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.SQLiteMode

/**
 * Ascent's ExpoSqliteConnection (Android's SQLite instead of expo-sqlite's) under JoyoFit's own
 * database code: the migrations, the sync's upserts, SleepStore's reads, and a transaction run
 * from a worker thread while another thread writes.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@SQLiteMode(SQLiteMode.Mode.NATIVE)   // legacy mode's SQLite (3.8) predates UPSERT (3.24+; Android 11+)
class AscentSqliteTest {
    private val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()

    @Test fun migrationsRunAndSleepRoundTrips() {
        val store = SyncStore(ctx)
        val db = store.db()
        assertTrue("schema applied", db.version > 0)
        db.beginTransaction()
        try {
            val seg = db.compileStatement(WatchSql.UPSERT_SLEEP_SEGMENT)
            listOf(Triple(1000L, 4600L, "deep"), Triple(4600L, 8200L, "rem")).forEach { (a, b, stage) ->
                seg.clearBindings(); seg.bindLong(1, a); seg.bindLong(2, b); seg.bindLong(3, 7); seg.bindString(4, stage); seg.bindString(5, "AA:BB")
                seg.executeInsert()
            }
            // the same key again updates instead of adding a row
            seg.clearBindings(); seg.bindLong(1, 1000L); seg.bindLong(2, 5000L); seg.bindLong(3, 7); seg.bindString(4, "light"); seg.bindString(5, "AA:BB")
            assertEquals(1, seg.executeUpdateDelete())
            seg.close()
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        val rows = SleepStore.loadRaw(db, 0)
        assertEquals(2, rows.size)
        assertEquals(5000L, rows[0].end)
        assertEquals("light", rows[0].stage)
    }

    // WearDatabase gives a transaction to the thread that began it (others wait), so it is
    // begun and ended on one worker thread here, while a second thread writes meanwhile.
    @Test fun transactionOnWorkerThreadRollsBackAndKeepsOthersOut() = runBlocking {
        val db = SyncStore(ctx).db()
        val count = { addr: String -> db.rawQuery("SELECT COUNT(*) FROM device WHERE address = ?", arrayOf(addr)).use { it.moveToFirst(); it.getInt(0) } }
        withContext(Dispatchers.IO) {
            db.beginTransaction()
            try { db.execSQL("INSERT INTO device (address, name) VALUES (?, ?)", arrayOf("CC:DD", "Watch Fit 4")); db.setTransactionSuccessful() }
            finally { db.endTransaction() }
        }
        assertEquals("committed from a worker thread", 1, count("CC:DD"))

        val other = withContext(Dispatchers.IO) {
            db.beginTransaction()
            val writer = Thread { db.execSQL("INSERT INTO device (address, name) VALUES (?, ?)", arrayOf("EE:FF", "other thread")) }.apply { start() }
            try {
                db.execSQL("INSERT INTO device (address, name) VALUES (?, ?)", arrayOf("11:22", "rolled back"))
                writer.join(300)
                assertTrue("the other thread waits for the transaction", writer.isAlive)
            } finally { db.endTransaction() }                // not successful: rolls back
            writer.apply { join(5000) }
        }
        assertTrue(!other.isAlive)
        assertEquals("rolled back", 0, count("11:22"))
        assertEquals("the other thread's row is not part of the rollback", 1, count("EE:FF"))
    }

    @Test fun typedBindingsCompareAsNumbers() {
        val db = SyncStore(ctx).db()
        db.execSQL("INSERT OR REPLACE INTO step_samples (timestamp, steps, calories, distance) VALUES (?, ?, ?, ?)", arrayOf(100L, 50L, 1L, 30L))
        db.execSQL("INSERT OR REPLACE INTO step_samples (timestamp, steps, calories, distance) VALUES (?, ?, ?, ?)", arrayOf(90000L, 70L, 1L, 30L))
        // a string bound against a column still compares as a number (column affinity)
        val n = db.rawQuery("SELECT COUNT(*) FROM step_samples WHERE timestamp >= ?", arrayOf("1000")).use { it.moveToFirst(); it.getInt(0) }
        assertEquals(1, n)
    }
}
