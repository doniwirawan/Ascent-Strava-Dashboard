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

    @Test fun streakCountsConsecutiveDays() {
        assertEquals(3, More.longestStreak(setOf("2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06")))
        assertEquals(0, More.longestStreak(emptySet()))
    }

    @Test fun calendarPage() {
        val now = java.time.LocalDate.now()
        val d1 = now.withDayOfMonth(1).toString(); val d2 = now.withDayOfMonth(2).toString()
        val acts = org.json.JSONArray(listOf(act(1, "Ride", 40.0, 90, d1), act(2, "Run", 10.0, 60, d1), act(3, "Ride", 30.0, 70, d2)))
        (Api::class.java.getDeclaredMethod("cacheFile", android.content.Context::class.java, String::class.java)
            .apply { isAccessible = true }.invoke(Api, app, "activities?limit=500") as java.io.File).apply { parentFile!!.mkdirs() }.writeText(JSONObject().put("activities", acts).toString())
        More.calendar(app)
        val t = texts(app.findViewById(android.R.id.content))
        assertTrue(t.toString(), "Calendar" in t && "MONTH BY MONTH" in t)
        assertTrue("3 activities on 2 days, streak 2", t.any { it.startsWith("3 activities · 2 active days · 80.0 km") } && "2 days" in t)
        assertTrue("every day of the month is drawn", "${now.lengthOfMonth()}" in t)
    }

    @Test fun zoneEstimates() {
        // highest HR 200: an average of 130 (65%) is Z2, 175 (87.5%) is Z4
        val acts = listOf(act(1, "Ride", 30.0, 60, "2026-10-01", 130.0, ",\"max_heartrate\":200"), act(2, "Run", 10.0, 30, "2026-10-02", 175.0, ",\"max_heartrate\":190"))
        assertEquals(listOf(0.0, 3600.0, 0.0, 1800.0, 0.0), Screens.hrZoneTotals(acts).toList())
        // 22 km/h is Brisk (20–25), 30 km/h the top band (30+)
        assertEquals(listOf(0.0, 0.0, 3600.0, 0.0, 3600.0), Screens.speedZoneTotals(listOf(act(3, "Ride", 22.0, 60, "2026-10-01"), act(4, "Ride", 30.0, 60, "2026-10-02"))).toList())
        // 8 days apart: two separate weeks; 3 days apart: one
        assertEquals(50.0, Screens.biggestWeek(listOf(act(5, "Ride", 20.0, 60, "2026-10-01"), act(6, "Ride", 30.0, 60, "2026-10-04"), act(7, "Ride", 40.0, 60, "2026-10-12"))) / 1000, 0.01)
    }

    private fun cache(path: String, body: JSONObject) =
        (Api::class.java.getDeclaredMethod("cacheFile", android.content.Context::class.java, String::class.java)
            .apply { isAccessible = true }.invoke(Api, app, path) as java.io.File).apply { parentFile!!.mkdirs() }.writeText(body.toString())

    @Test fun homeDrawsExtras() {
        cache("stats", JSONObject().put("synced_at", "2026-10-01T00:00:00Z"))
        cache("activities?limit=300", JSONObject().put("activities", org.json.JSONArray(listOf(
            act(1, "Ride", 30.0, 60, "2026-10-01", 130.0, ",\"max_heartrate\":200"), act(2, "Run", 10.0, 50, "2026-10-02", 150.0), act(3, "Walk", 3.0, 40, "2026-10-03").put("start_date_local", "")))))
        Screens.home(app)
        val t = texts(app.findViewById(android.R.id.content))
        assertTrue(t.toString(), "BY SPORT" in t && "TIME IN HEART-RATE ZONES" in t && "TIME AT SPEED · RIDES" in t && "INSIGHTS" in t)
        assertTrue("Z2 1 h of 3 activities' moving", t.any { it.startsWith("1h 0m · ") })
    }

    @Test fun trainingMaths() {
        // an hour at FTP is 100 TSS; no power and no HR: 50 an hour
        val pw = act(1, "Ride", 30.0, 60, "2026-10-01", extra = ",\"device_watts\":true,\"weighted_average_watts\":200")
        assertEquals(100.0, Training.load(pw, 200.0, 0.0)!!.load, 0.01)
        assertEquals("time", Training.load(act(2, "Ride", 30.0, 60, "2026-10-01"), 0.0, 0.0)!!.basis)
        assertEquals(50.0, Training.load(act(2, "Ride", 30.0, 60, "2026-10-01"), 0.0, 0.0)!!.load, 0.01)
        // a 20:00 5K is VDOT ≈ 49.8, and the inverse gives 20:00 back
        val v = Training.vdot(5000.0, 20.0)
        assertEquals(49.8, v, 0.2)
        assertEquals(20.0, Training.raceMinutes(v, 5000.0), 0.01)
        // CTL after one 100-load day is 100 × (1 − e^(−1/42))
        val s = Training.series(listOf(pw), 200.0, 0.0, java.time.LocalDate.parse("2026-10-01"))!!
        assertEquals(100 * (1 - Math.exp(-1.0 / 42)), s.last.ctl, 1e-6)
        assertEquals("High fatigue", Training.band(-40.0, 0.0).first)
        assertTrue(Training.band(10.0, 9.0).third.contains("ramping fast"))
        // 3 rides this week and none the week before: 50% over 2 weeks
        val c = Training.consistency(listOf("2026-10-19", "2026-10-20", "2026-10-21", "2026-10-07").mapIndexed { i, d -> act(i.toLong(), "Ride", 20.0, 60, d) }, java.time.LocalDate.parse("2026-10-22"))!!
        assertEquals(listOf(1, 0, 3), c.weeks); assertEquals(1, c.hit); assertEquals(1, c.missed)
    }

    @Test fun trainingPage() {
        val acts = org.json.JSONArray((1..12).map { i -> act(i.toLong(), "Ride", 20.0 + i, 60 + i, java.time.LocalDate.now().minusDays(i * 3L).toString(), 120.0 + i, ",\"max_heartrate\":190") } +
            act(99, "Run", 5.0, 25, java.time.LocalDate.now().minusDays(2).toString()))
        cache("activities?limit=500", JSONObject().put("activities", acts))
        cache("me", JSONObject().put("ftp", 200).put("weight", 78))
        Training.page(app)
        val t = texts(app.findViewById(android.R.id.content))
        assertTrue(t.toString(), "Training" in t && "Recovery recommendation" in t && "PERFORMANCE MANAGEMENT CHART" in t)
        assertTrue("FTP 200 at 78 kg", "200 W" in t && "2.56 W/kg" in t)
        assertTrue("5K from a 25-min 5K", "25:00" in t)
        assertTrue(t.toString(), "PERSONAL RECORDS" in t && "RIDE QUALITY · LATEST RIDE" in t && t.any { it.startsWith("CONSISTENCY") })
    }

    @Test fun powerInsightsAndPage() {
        val now = java.time.LocalDate.now()
        fun pw(id: Long, back: Long, np: Int, hr: Double) = act(id, "Ride", 30.0, 60, now.minusDays(back).toString(), hr,
            ",\"device_watts\":true,\"average_watts\":${np - 10},\"weighted_average_watts\":$np,\"max_watts\":600,\"average_cadence\":${80 + id},\"kilojoules\":500")
        // NP 200 this month against 180 the month before: up 11%
        val list = listOf(pw(1, 2, 200, 140.0), pw(2, 9, 200, 140.0), pw(3, 33, 180, 140.0), pw(4, 40, 180, 140.0))
        val rows = list.map { Screens.Pw(it, it.optDouble("average_watts"), it.optDouble("weighted_average_watts"), 600.0, it.optDouble("weighted_average_watts") / 200, 60.0, it.optDouble("weighted_average_watts") / it.optDouble("average_watts"), 2.5) }
        val ins = Screens.powerInsights(rows)
        assertTrue(ins.toString(), ins.any { it.startsWith("Normalized power is up 11%") } && ins.any { it.contains("more watts per heartbeat") })
        cache("activities?limit=300", JSONObject().put("activities", org.json.JSONArray(list)))
        cache("me", JSONObject().put("ftp", 200).put("weight", 80))
        Screens.power(app)
        val t = texts(app.findViewById(android.R.id.content))
        assertTrue(t.toString(), "POWER INSIGHTS" in t && "WEEKLY POWER · LAST 16 WEEKS" in t && "RIDE INTENSITY MIX · BY INTENSITY FACTOR" in t && "CADENCE VS POWER · EACH DOT IS A RIDE" in t)
        assertTrue("best NP of a 1h+ ride", "200 W" in t)
    }

    /** 60 made-up nights: a ride every other day; the night after a ride is 8h, after a rest day 6h. */
    private fun sleepFixture(): Pair<JSONObject, List<JSONObject>> {
        val start = java.time.LocalDate.parse("2026-08-01")
        val rides = (0 until 60 step 2).map { i -> act(i.toLong(), "Ride", 30.0, 90, start.plusDays(i.toLong()).toString()) }
        val rows = org.json.JSONArray((1..60).map { i ->
            val trained = (i - 1) % 2 == 0
            org.json.JSONArray(listOf(start.plusDays(i.toLong()).toString(), if (trained) 480 else 360, if (trained) 100 else 70, 90, 250, 92, -0.5, 7.0))
        })
        return JSONObject().put("cols", org.json.JSONArray(listOf("date", "asleep", "deep", "rem", "light", "eff", "bed", "up"))).put("rows", rows) to rides
    }

    @Test fun sleepFindings() {
        val (s, rides) = sleepFixture()
        val cards = SleepInsights.findings(SleepInsights.nights(s), SleepInsights.trainingDays(rides))
        val t = cards.first { it.title.startsWith("Training buys you") }
        assertEquals("Training buys you 2h 0m more sleep", t.title)
        assertTrue(t.body, t.body.contains("Deep sleep goes up 30 minutes"))
    }

    @Test fun sleepTabDrawsInsights() {
        val (s, rides) = sleepFixture()
        cache("sleep", s); cache("activities?limit=500", JSONObject().put("activities", org.json.JSONArray(rides)))
        Screens.sleep(app)
        val t = texts(app.findViewById(android.R.id.content))
        assertTrue(t.toString(), "WHAT YOUR SLEEP SAYS" in t && "THE NIGHT AFTER" in t && "BY DAY OF THE WEEK" in t && "HOW YOUR NIGHTS SPREAD" in t)
        assertTrue("rest-day nights are 6h", t.indexOf("Rest day").let { it >= 0 && "6h 0m" in t.subList(it, it + 3) })
    }

    @Test fun gearCostAndComparison() {
        val road = JSONObject().put("id", "b1").put("name", "Camp SR3D").put("distance", 1_000_000.0)
        val gravel = JSONObject().put("id", "b2").put("name", "Mosso 735 GVL").put("distance", 500_000.0)
        // 30 km/h flat on the road bike, 20 km/h flat on the gravel bike
        val acts = (1..4).map { act(it.toLong(), "Ride", 30.0, 60, "2026-10-0$it", 140.0, ",\"gear_id\":\"b1\"").put("total_elevation_gain", 30) } +
            (5..8).map { act(it.toLong(), "Ride", 20.0, 60, "2026-10-0$it", 140.0, ",\"gear_id\":\"b2\"").put("total_elevation_gain", 30) }
        val a = Screens.bikeStats(road, acts)!!; val g = Screens.bikeStats(gravel, acts)!!
        assertEquals(4, a.n); assertEquals(30.0, a.flatSpeed!! * 3.6, 0.01)
        val facts = Screens.bikeFacts(a, g)
        assertTrue(facts.toString(), facts[0] == "Flat rides: 50.0% faster on the Camp SR3D (30.0 km/h vs 20.0 km/h).")
        cache("me", JSONObject().put("bikes", org.json.JSONArray(listOf(road, gravel))))
        cache("bikes", JSONObject().put("bikes", org.json.JSONArray(listOf(JSONObject().put("id", "camp").put("name", "Camp SR3D").put("spent", 10_000_000), JSONObject().put("id", "mosso").put("name", "Mosso").put("spent", 5_000_000))))
            .put("shared", org.json.JSONArray(listOf(JSONObject().put("paid", 1_500_000)))))
        cache("purchases", JSONObject().put("items", org.json.JSONArray()))
        cache("activities?limit=500", JSONObject().put("activities", org.json.JSONArray(acts)))
        Screens.money(app)
        val t = texts(app.findViewById(android.R.id.content))
        // 16.5 M over 1,500 km = Rp 11,000/km; the road bike: 10 M + 1 M of tools over 1,000 km
        assertTrue(t.toString(), "COST PER KM" in t && "BIKE COMPARISON" in t && "Rp 11.000/km" in t)
    }

    @Test fun milestones() {
        val b = Milestones.badge(6200.0, "km total", { "%,d".format(Math.round(it)) }, listOf(1000.0 to "1,000 km Club", 5000.0 to "5,000 km Club", 10000.0 to "10,000 km Club"))
        assertEquals("5,000 km Club", b.name); assertEquals(2, b.tier); assertEquals("10,000 km Club", b.next); assertEquals(62, b.pct)
        cache("activities?limit=500", JSONObject().put("activities", org.json.JSONArray(listOf(act(1, "Ride", 120.0, 300, "2026-10-01"), act(2, "Ride", 40.0, 90, "2026-10-02")))))
        cache("strava-stats", JSONObject().put("all_ride_totals", JSONObject().put("count", 120).put("distance", 6_200_000).put("moving_time", 900_000).put("elevation_gain", 50_000)))
        Milestones.page(app)
        val t = texts(app.findViewById(android.R.id.content))
        assertTrue(t.toString(), "Milestones" in t && "RECORDS" in t && "BADGES" in t && "★ 5,000 km Club" in t && "★ 5× Everest" in t && "★ Century Rider" in t)
    }

    @Test fun destinationsUseTheTurnaround() {
        // two made-up squares side by side; a ride from the west one out to the east one counts in the east
        fun sq(name: String, x0: Double) = JSONObject("{\"type\":\"Feature\",\"properties\":{\"name\":\"$name\"},\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[$x0,0],[${x0 + 1},0],[${x0 + 1},1],[$x0,1],[$x0,0]]]}}")
        val regs = Destinations.parse(JSONObject().put("features", org.json.JSONArray(listOf(sq("West", 0.0), sq("East", 1.0)))))
        assertEquals("East", Destinations.regencyOf(0.5, 1.5, regs)); assertEquals(null, Destinations.regencyOf(0.5, 5.0, regs))
        fun enc(v: Double): String { var n = Math.round(v * 1e5).toInt(); n = if (n < 0) (n shl 1).inv() else n shl 1; val sb = StringBuilder(); while (n >= 0x20) { sb.append(((0x20 or (n and 0x1f)) + 63).toChar()); n = n shr 5 }; sb.append((n + 63).toChar()); return sb.toString() }
        val line = enc(0.5) + enc(0.5) + enc(0.0) + enc(1.0)   // (0.5, 0.5) → (0.5, 1.5)
        val ride = act(1, "Ride", 40.0, 90, "2026-10-01").put("map", JSONObject().put("summary_polyline", line))
        val d = Destinations.destination(ride)!!
        assertEquals(1.5, d[1], 1e-4); assertEquals("East", Destinations.regencyOf(d[0], d[1], regs))
        // the website's real boundaries (public data in the repo): two town centres
        val bali = Destinations.parse(JSONObject(java.io.File("../../data/bali-regencies.json").readText()))
        assertEquals(9, bali.size)
        assertTrue(Destinations.regencyOf(-8.6705, 115.2126, bali)!!.contains("Denpasar"))
        assertTrue(Destinations.regencyOf(-8.5410, 115.3253, bali)!!.contains("Gianyar"))
    }

    @Test fun huaweiOnly() {
        assertEquals("2026-09-07T21:48:15", Screens.huaweiLocal("2026-09-07T13:48:15+00:00", "+0800"))
        assertEquals("2026-09-07T08:48:15", Screens.huaweiLocal("2026-09-07T13:48:15+00:00", "-05:00"))
        cache("activities?limit=300", JSONObject().put("activities", org.json.JSONArray(listOf(act(1, "Ride", 20.0, 60, "2026-10-01")))))
        cache("huawei", JSONObject().put("workouts", org.json.JSONArray(listOf(
            JSONObject().put("sport", "Mountain climbing").put("start_time", "2026-10-02T00:30:00+00:00").put("tz", "+0800").put("duration_s", 5400).put("climb_m", 700).put("strava_id", JSONObject.NULL),
            JSONObject().put("sport", "Outdoor walk").put("start_time", "2026-10-03T00:30:00+00:00").put("tz", "+0800").put("duration_s", 600).put("strava_id", "123")))))
        Screens.rides(app)
        val t = texts(app.findViewById(android.R.id.content))
        assertTrue(t.toString(), "ONLY ON HUAWEI · 1" in t && "Mountain climbing" in t && "Outdoor walk" !in t)
    }

    @Test fun dataTable() {
        val (sl, _) = sleepFixture()
        val nights = SleepInsights.nights(sl)
        val acts = listOf(act(1, "Ride", 40.0, 90, "2026-08-02"), act(2, "Ride", 60.0, 150, "2026-08-04"), act(3, "Run", 5.0, 30, "2026-08-04"))
        val rows = DataPage.rows(acts, nights)
        assertEquals(3 + 58, rows.size)   // 60 nights, 2 of them on activity days
        assertEquals(480.0, rows.first { it.a?.optLong("id") == 1L }.s!!.asleep, 0.0)
        val dist = DataPage.cols(200.0, 78.0).first { it.key == "dist" }
        val sorted = DataPage.sort(rows, dist, true)
        assertEquals(listOf(2L, 1L, 3L), sorted.take(3).map { it.a!!.optLong("id") })
        assertTrue("rest days (no distance) sort last", sorted.drop(3).all { it.a == null })
        assertEquals(listOf(3L, 1L, 2L), DataPage.sort(rows, dist, false).take(3).map { it.a!!.optLong("id") })
        cache("sleep", sl); cache("activities?limit=500", JSONObject().put("activities", org.json.JSONArray(acts))); cache("me", JSONObject().put("ftp", 200))
        DataPage.page(app)
        val t = texts(app.findViewById(android.R.id.content))
        assertTrue(t.toString(), "Data" in t && "61 rows · sorted by date" in t && "Rest day" in t)
    }

    @Test fun rideAnalyses() {
        val hr = DoubleArray(100) { if (it < 50) 140.0 else 150.0 }; val w = DoubleArray(100) { 200.0 }
        val d = RideAnalysis.decoupling(hr, w, true)!!
        assertEquals((200 / 140.0 - 200 / 150.0) / (200 / 140.0) * 100, d.pct, 1e-9)
        assertEquals(Ui.ORANGE.let { 0xFFFB923C.toInt() }, RideAnalysis.band(d.pct).first)
        // 100 samples at 10 m/s: half climbing 5%, half flat with cadence; 600 s moving, 700 s elapsed
        val spd = DoubleArray(101) { 10.0 }; val dist = DoubleArray(101) { it * 10.0 }
        val alt = DoubleArray(101) { if (it <= 50) it * 0.5 else 25.0 }; val cad = DoubleArray(101) { 85.0 }
        val t = RideAnalysis.timeLost(JSONObject().put("moving_time", 600).put("elapsed_time", 700).put("distance", 6000).put("average_speed", 10), spd, alt, dist, cad)!!
        assertEquals(300.0, t.climb, 1e-9); assertEquals(300.0, t.flat, 1e-9); assertEquals(100.0, t.stopped, 1e-9)
        // riding due north into an 18 km/h wind from the north
        val north = (0..10).map { doubleArrayOf(-8.6 + it * 0.01, 115.2) }
        val wnd = RideAnalysis.wind(north, 18.0, 0.0)!!
        assertEquals(100, wnd.headPct); assertEquals(-18.0, wnd.netKmh, 0.01)
        assertEquals(100, RideAnalysis.wind(north, 18.0, 180.0)!!.tailPct)
    }

    @Test fun gpsCheck() {
        val (out, n) = GpsCheck.fixSpikes(doubleArrayOf(10.0, 25.0, 12.0, Double.NaN, 14.0))
        assertEquals(2, n); assertEquals(11.0, out[1], 1e-9); assertEquals(13.0, out[3], 1e-9)
        cache("activities?limit=500", JSONObject().put("activities", org.json.JSONArray(listOf(act(1, "Ride", 30.0, 60, "2026-10-01").put("max_speed", 30.0), act(2, "Ride", 30.0, 60, "2026-10-02")))))
        GpsCheck.page(app)
        val t = texts(app.findViewById(android.R.id.content))
        assertTrue(t.toString(), "GPS check" in t && "Ride 1" in t && "108.0 km/h" in t && "Ride 2" !in t)
        // a saved correction replaces the top speed wherever the activity is read
        java.io.File(app.filesDir, "maxfix.json").writeText("{\"1\":{\"raw\":30,\"fixed\":15}}")
        GpsCheck::class.java.getDeclaredField("fixes").apply { isAccessible = true }.set(GpsCheck, null)
        GpsCheck.load(app)
        val fixed = Screens.list(org.json.JSONArray(listOf(act(1, "Ride", 30.0, 60, "2026-10-01").put("max_speed", 30.0))))[0]
        assertEquals(15.0, fixed.optDouble("max_speed"), 0.0)
    }

    @Test fun otherSportsRankByTime() {
        val t = draw(listOf(act(1, "Badminton", 0.0, 90, "2026-10-01").put("average_speed", 0), act(2, "WeightTraining", 0.0, 45, "2026-10-02").put("average_speed", 0)), "other")
        assertTrue(t.toString(), "OTHER SPORTS" in t && "1h 30m" in t && "HOURS PER MONTH" in t)
    }
}
