package com.joyodigitama.huaweiwear

import android.database.Cursor
import android.database.sqlite.SQLiteCursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteProgram
import android.database.sqlite.SQLiteQuery
import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors

/**
 * Ascent's replacement for JoyoFit's ExpoSqliteConnection (expo-sqlite's SQLite library, which
 * Ascent doesn't ship), with the same API over Android's own SQLite. Ascent has no JS side, so
 * this is the only connection to `joyofit.db` in the process.
 *
 * Android's SQLite ties a transaction to the thread that began it, but WearDatabase begins and
 * commits from coroutines that may change thread. So every call runs on one database thread.
 */
class ExpoSqliteConnection {

    private lateinit var db: SQLiteDatabase
    private var changes = 0

    private fun <T> run(block: () -> T): T = try {
        if (Thread.currentThread() === dbThread) block() else worker.submit(Callable { block() }).get()
    } catch (e: ExecutionException) {
        throw e.cause ?: e
    }

    fun open(path: String) = run {
        db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.CREATE_IF_NECESSARY)
    }

    fun exec(sql: String) = run {
        val s = sql.trim().trimEnd(';')
        val head = s.take(24).uppercase()
        when {
            // one connection, no pool: WAL buys nothing here and Android wants its own API for it
            head.startsWith("PRAGMA JOURNAL_MODE") -> Unit
            returnsRows(s) -> query(s)
            else -> db.execSQL(s)
        }
        Unit
    }

    fun prepare(sql: String) = Statement(this, sql)

    fun changes(): Int = run { changes }

    fun lastInsertRowId(): Long = run { query("SELECT last_insert_rowid()").first()[0] as Long }

    fun close() = run { if (::db.isInitialized) db.close() }

    /** A prepared statement: the SQL and its bindings, run on the first [step]. */
    class Statement internal constructor(private val owner: ExpoSqliteConnection, private val sql: String) {
        private val args = HashMap<Int, Any?>()
        private var rows: List<List<Any?>>? = null
        private var pos = -1
        private var width = 0

        fun bind(index: Int, value: Any?) { args[index] = value }
        fun clearBindings() = args.clear()
        fun reset() { rows = null; pos = -1 }

        fun step(): Boolean = owner.run {
            if (rows == null) {
                if (owner.returnsRows(sql)) {
                    rows = owner.query(sql, args)
                } else {
                    owner.write(sql, args); rows = emptyList()
                }
                width = rows!!.firstOrNull()?.size ?: width
            }
            pos++
            pos < rows!!.size
        }

        fun columnCount(): Int = rows?.getOrNull(pos)?.size ?: width
        fun row(): List<Any?> = rows!![pos]
        fun close() = reset()
        fun release() = reset()
    }

    private fun returnsRows(sql: String): Boolean {
        val h = sql.trimStart().take(10).uppercase()
        return h.startsWith("SELECT") || h.startsWith("WITH") || h.startsWith("PRAGMA") || h.startsWith("VALUES") ||
            h.startsWith("EXPLAIN") || Regex("\\bRETURNING\\b", RegexOption.IGNORE_CASE).containsMatchIn(sql)
    }

    private fun bindAll(p: SQLiteProgram, args: Map<Int, Any?>) = args.forEach { (i, v) ->
        when (v) {
            null -> p.bindNull(i)
            is Long -> p.bindLong(i, v)
            is Int -> p.bindLong(i, v.toLong())
            is Short -> p.bindLong(i, v.toLong())
            is Byte -> p.bindLong(i, v.toLong())
            is Boolean -> p.bindLong(i, if (v) 1 else 0)
            is Double -> p.bindDouble(i, v)
            is Float -> p.bindDouble(i, v.toDouble())
            is ByteArray -> p.bindBlob(i, v)
            else -> p.bindString(i, v.toString())
        }
    }

    private fun write(sql: String, args: Map<Int, Any?>) {
        db.compileStatement(sql).use { st -> bindAll(st, args); changes = st.executeUpdateDelete() }
    }

    /** Runs a query with typed bindings (rawQuery would bind every value as text). */
    private fun query(sql: String, args: Map<Int, Any?> = emptyMap()): List<List<Any?>> {
        val factory = SQLiteDatabase.CursorFactory { _, driver, table, q: SQLiteQuery -> bindAll(q, args); SQLiteCursor(driver, table, q) }
        return db.rawQueryWithFactory(factory, sql, null, null).use { c ->
            val out = ArrayList<List<Any?>>()
            while (c.moveToNext()) out += (0 until c.columnCount).map { i ->
                when (c.getType(i)) {
                    Cursor.FIELD_TYPE_NULL -> null
                    Cursor.FIELD_TYPE_INTEGER -> c.getLong(i)
                    Cursor.FIELD_TYPE_FLOAT -> c.getDouble(i)
                    Cursor.FIELD_TYPE_BLOB -> c.getBlob(i)
                    else -> c.getString(i)
                }
            }
            out
        }
    }

    companion object {
        const val SQLITE_OK = 0
        const val SQLITE_ROW = 100
        const val SQLITE_DONE = 101

        @Volatile private var dbThread: Thread? = null
        private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "joyofit-db").also { dbThread = it } }
    }
}
