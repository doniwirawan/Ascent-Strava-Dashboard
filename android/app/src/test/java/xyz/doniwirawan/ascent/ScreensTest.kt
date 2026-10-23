package xyz.doniwirawan.ascent

import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Website sections ported to the app, drawn from made-up activities (never real data: the repo is public). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ScreensTest {
    private val app = Robolectric.buildActivity(AppActivity::class.java).setup().get()

    private fun act(id: Long, type: String, km: Double, min: Int, date: String, hr: Double = 0.0, extra: String = "") = JSONObject(
        """{"id":$id,"name":"$type $id","type":"$type","sport_type":"$type","distance":${km * 1000},"moving_time":${min * 60},
           "average_speed":${km * 1000 / (min * 60)},"max_speed":${km * 1000 / (min * 60) * 1.8},"total_elevation_gain":${km * 5},
           "average_heartrate":$hr,"start_date":"${date}T06:00:00Z","start_date_local":"${date}T14:00:00Z"$extra}""")

    private fun texts(v: View): List<String> = when (v) {
        is TextView -> listOf(v.text.toString())
        is ViewGroup -> (0 until v.childCount).flatMap { texts(v.getChildAt(it)) }
        else -> emptyList()
    }

    private fun draw(list: List<JSONObject>, key: String) = LinearLayout(app).also { Screens.sportPage(app, it, list, key) }.let(::texts)

    @Test fun sportsAreSorted() {
        assertEquals(listOf("ride", "ride", "run", "run", "walk", "swim", "other"),
            listOf("GravelRide", "VirtualRide", "Run", "TrailRun", "Hike", "Swim", "Badminton").mapIndexed { i, t -> Screens.sportOf(act(i.toLong(), t, 1.0, 10, "2026-01-01")) })
    }

    @Test fun runningPage() {
        val t = draw(listOf(act(1, "Run", 5.0, 25, "2026-10-01", 150.0), act(2, "Run", 10.0, 60, "2026-10-05", 160.0)), "run")
        assertTrue(t.toString(), "RUNNING" in t)
        assertTrue("best pace 5:00 /km", "5:00 /km" in t)
        assertTrue("longest 10 km", "10.0 km" in t)
        assertTrue("2 runs, 15 km", "2" in t && "15.0 km" in t)
        assertTrue("avg HR 155", "155 bpm" in t)
        assertTrue("top 5 fastest first", t.indexOf("1. Run 1") in 0 until t.indexOf("2. Run 2"))
    }

    @Test fun ridingComparesFourWeeks() {
        val day = 86_400_000L; val now = System.currentTimeMillis()
        fun d(back: Int) = java.time.Instant.ofEpochMilli(now - back * day).toString().take(10)
        val t = draw(listOf(act(1, "Ride", 40.0, 90, d(3)), act(2, "Ride", 20.0, 60, d(10)), act(3, "Ride", 30.0, 70, d(40))), "ride")
        assertTrue(t.toString(), "CYCLING" in t)
        assertTrue("60 km now vs 30 before = +100%", t.any { it.startsWith("was 30.0 km") && "▲ 100%" in it })
        assertTrue("longest ride", "40.0 km" in t)
    }

    @Test fun weeksStartOnSunday() {
        // Sat 3 Oct 2026 is in the week of Sun 27 Sep; Sun 4 Oct starts the next
        val w = More.weeks(listOf(act(1, "Ride", 10.0, 30, "2026-10-03"), act(2, "Ride", 20.0, 60, "2026-10-04"), act(3, "Ride", 5.0, 20, "2026-10-05")))
        assertEquals(listOf("2026-09-27" to 10.0, "2026-10-04" to 25.0), w.map { it.first to Math.round(it.second).toDouble() })
    }

    @Test fun trendsPage() {
        val acts = org.json.JSONArray(listOf(act(1, "Ride", 40.0, 90, "2026-03-01", 140.0), act(2, "Run", 10.0, 60, "2026-03-08"), act(3, "Ride", 30.0, 70, "2025-03-02")))
        (Api::class.java.getDeclaredMethod("cacheFile", android.content.Context::class.java, String::class.java)
            .apply { isAccessible = true }.invoke(Api, app, "activities?limit=500") as java.io.File).apply { parentFile!!.mkdirs() }.writeText(JSONObject().put("activities", acts).toString())
        More.trends(app)
        val t = texts(app.findViewById(android.R.id.content))
        assertTrue(t.toString(), "Trends" in t && "YEAR IN REVIEW" in t)
        assertTrue("2026 total 50 km", "50 km" in t)
        assertTrue("same months of 2025: 30 km, +67%", "30 km" in t && "▲ 67%" in t)
        assertTrue("review: 2 activities vs 1", t.any { it.startsWith("1 · ▲ 100%") })
        assertTrue("top sport Ride", "Ride" in t)
    }

    @Test fun otherSportsRankByTime() {
        val t = draw(listOf(act(1, "Badminton", 0.0, 90, "2026-10-01").put("average_speed", 0), act(2, "WeightTraining", 0.0, 45, "2026-10-02").put("average_speed", 0)), "other")
        assertTrue(t.toString(), "OTHER SPORTS" in t && "1h 30m" in t && "HOURS PER MONTH" in t)
    }
}
