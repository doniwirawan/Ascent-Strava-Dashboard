package xyz.doniwirawan.ascent

import com.joyodigitama.huaweiwear.AscentWatch
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** The watch's sleep pieces folded into nights (Watch.fold), Bali time (UTC+8). */
class WatchFoldTest {
    private val off = 8 * 3600L
    private fun t(iso: String) = Instant.parse(iso).epochSecond          // UTC
    private fun s(a: String, b: String, stage: String?, nap: Boolean = false) = AscentWatch.Sleep(t(a), t(b), stage, nap)

    @Test fun nightIsDatedByTheMorningAndCountsStages() {
        // 23:00–06:00 local = 15:00–22:00 UTC the day before
        val n = Watch.fold(listOf(
            s("2026-10-21T15:00:00Z", "2026-10-21T17:00:00Z", "light"),
            s("2026-10-21T17:00:00Z", "2026-10-21T18:30:00Z", "deep"),
            s("2026-10-21T18:30:00Z", "2026-10-21T18:40:00Z", "awake"),
            s("2026-10-21T18:40:00Z", "2026-10-21T20:00:00Z", "rem"),
            s("2026-10-21T20:00:00Z", "2026-10-21T22:00:00Z", "light"),
        ), emptyMap(), emptyMap(), off).getJSONObject(0)
        assertEquals("2026-10-22", n.getString("date"))
        assertEquals(90, n.getInt("deep"))
        assertEquals(80, n.getInt("rem"))
        assertEquals(240, n.getInt("light"))
        assertEquals(410, n.getInt("asleep"))
        assertEquals(1, n.getInt("wakeups"))
        assertEquals(-1.0, n.getDouble("bed"), 0.001)
        assertEquals(6.0, n.getDouble("up"), 0.001)
        assertEquals(420, n.getInt("tib"))
    }

    @Test fun overlappingPiecesCountOnce() {
        val n = Watch.fold(listOf(
            s("2026-10-21T15:00:00Z", "2026-10-21T19:00:00Z", null),   // TruSleep window, no stage
            s("2026-10-21T17:00:00Z", "2026-10-21T18:00:00Z", "deep"),
        ), emptyMap(), emptyMap(), off).getJSONObject(0)
        assertEquals(240, n.getInt("asleep"))
        assertEquals(60, n.getInt("deep"))
    }

    @Test fun napsAndDailyNumbers() {
        val out = Watch.fold(listOf(s("2026-10-22T06:00:00Z", "2026-10-22T06:30:00Z", "light", nap = true)),
            mapOf("2026-10-22" to 9000L), mapOf("2026-10-22" to 58), off)
        val n = out.getJSONObject(0)
        assertEquals(30, n.getInt("nap"))
        assertEquals(0, n.getInt("asleep"))
        assertEquals(9000, n.getLong("steps"))
        assertEquals(58, n.getInt("rhr"))
    }

    @Test fun everythingElseTheWatchLogged() {
        val daily = mapOf("2026-10-23" to mapOf("cal" to 512.0, "dist" to 4100.0, "hrmin" to 48.0, "hrmax" to 151.0, "spo2" to 97.4, "spo2min" to 92.0, "hrv" to 55.0, "hrvmin" to 41.0, "hrvmax" to 63.0))
        val o = Watch.fold(emptyList(), emptyMap(), emptyMap(), 8 * 3600L, daily).getJSONObject(0)
        assertEquals("2026-10-23", o.getString("date"))
        assertEquals(512, o.getInt("cal")); assertEquals(4100, o.getInt("dist")); assertEquals(97.4, o.getDouble("spo2"), 1e-9)
        assertEquals(55, o.getInt("hrv")); assertEquals(41, o.getInt("hrvmin")); assertEquals(151, o.getInt("hrmax"))
    }
}
