package xyz.doniwirawan.ascent

import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.metadata.Metadata
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.ZoneOffset

/** HealthSync.fold: nights built like the export import, overlaps counted once. */
class HealthSyncTest {
    private val off = ZoneOffset.ofHours(8)
    private fun t(s: String) = Instant.parse(s)
    private fun stage(a: String, b: String, k: Int) = SleepSessionRecord.Stage(t(a), t(b), k)
    private val stages = listOf(
        stage("2026-10-21T14:10:00Z", "2026-10-21T15:40:00Z", SleepSessionRecord.STAGE_TYPE_LIGHT),
        stage("2026-10-21T15:40:00Z", "2026-10-21T17:10:00Z", SleepSessionRecord.STAGE_TYPE_DEEP),
        stage("2026-10-21T17:10:00Z", "2026-10-21T17:20:00Z", SleepSessionRecord.STAGE_TYPE_AWAKE),
        stage("2026-10-21T17:20:00Z", "2026-10-21T19:30:00Z", SleepSessionRecord.STAGE_TYPE_LIGHT),
        stage("2026-10-21T19:30:00Z", "2026-10-21T21:00:00Z", SleepSessionRecord.STAGE_TYPE_REM),
        stage("2026-10-21T21:00:00Z", "2026-10-21T22:05:00Z", SleepSessionRecord.STAGE_TYPE_LIGHT))
    private fun night(app: String) = SleepSessionRecord(t("2026-10-21T14:10:00Z"), off, t("2026-10-21T22:05:00Z"), off,
        stages = stages, metadata = Metadata(dataOrigin = DataOrigin(app)))
    private fun steps(app: String, n: Long) = StepsRecord(t("2026-10-22T02:00:00Z"), off, t("2026-10-22T03:00:00Z"), off, n,
        metadata = Metadata(dataOrigin = DataOrigin(app)))

    @Test fun oneNightLikeTheImport() {
        val o = HealthSync.fold(listOf(night("a")), emptyList()).getJSONObject(0)
        assertEquals("2026-10-22", o.getString("date"))          // dated by the morning you woke
        assertEquals(465, o.getInt("asleep")); assertEquals(90, o.getInt("deep")); assertEquals(285, o.getInt("light"))
        assertEquals(90, o.getInt("rem")); assertEquals(10, o.getInt("wake")); assertEquals(1, o.getInt("wakeups"))
        assertEquals(-1.83, o.getDouble("bed"), 0.001); assertEquals(6.08, o.getDouble("up"), 0.001)
        assertEquals(475, o.getInt("tib")); assertEquals(97.9, o.getDouble("eff"), 0.001)
    }

    @Test fun sameNightFromTwoAppsAndTwiceFromOneCountsOnce() {
        val arr = HealthSync.fold(listOf(night("nl.appyhapps.healthsync"), night("com.joyorogo.fit"), night("nl.appyhapps.healthsync")), emptyList())
        assertEquals(1, arr.length())
        assertEquals(465, arr.getJSONObject(0).getInt("asleep")); assertEquals(1, arr.getJSONObject(0).getInt("wakeups"))
    }

    @Test fun stepsTakeTheBiggestAppNotTheSum() {
        val o = HealthSync.fold(emptyList(), listOf(steps("phone", 6000), steps("healthsync", 9000), steps("healthsync", 1000))).getJSONObject(0)
        assertEquals(10000, o.getLong("steps"))                  // healthsync 9000 + 1000; the phone's 6000 not added
    }

    @Test fun daytimeShortSessionIsANap() {
        val nap = SleepSessionRecord(t("2026-10-22T05:30:00Z"), off, t("2026-10-22T06:10:00Z"), off)   // 13:30–14:10 local
        val o = HealthSync.fold(listOf(nap), emptyList()).getJSONObject(0)
        assertEquals(40, o.getInt("nap")); assertEquals(0, o.getInt("asleep")); assertEquals("13:30–14:10", o.getString("napt"))
    }
}
