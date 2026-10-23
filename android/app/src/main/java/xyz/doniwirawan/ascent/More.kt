package xyz.doniwirawan.ascent

import android.widget.LinearLayout
import org.json.JSONObject
import java.util.Locale

/**
 * The More tab: the website's other sections, one page each ("more:<id>").
 * Pages use the same API responses as the main tabs, so they open from the
 * saved copy like the rest of the app.
 */
object More {
    private val PAGES = listOf(
        "money" to ("Money" to "Spending, bikes, cost per km, bike comparison, bike care"),
        "trends" to ("Trends" to "Weekly distance, year over year, year in review"),
        "calendar" to ("Calendar" to "Every day of a month, and month by month"),
        "training" to ("Training" to "Load, form, recovery, consistency, FTP, run predictions, records"),
        "milestones" to ("Milestones" to "Records, Strava totals and badges"),
        "destinations" to ("Destinations" to "Where your rides turn around, by Bali regency"),
        "data" to ("Data" to "Every activity and night, sorted by anything"),
        "gps" to ("GPS check" to "Rides with impossible top speeds, normalized"),
        "segments" to ("Segments" to "Starred segments, KOMs, and where a PR is close"),
        "photos" to ("Photos" to "Every photo from your activities"),
        "chase" to ("Chase routes" to "Describe a ride; AI plans it on Bali's roads"),
        "help" to ("Help" to "What the metrics mean, and where your data comes from"),
    )

    fun show(a: AppActivity, id: String) = when (id) {
        "money" -> Screens.money(a)
        "trends" -> trends(a)
        "calendar" -> calendar(a)
        "training" -> Training.page(a)
        "milestones" -> Milestones.page(a)
        "destinations" -> Destinations.page(a)
        "data" -> DataPage.page(a)
        "gps" -> GpsCheck.page(a)
        "segments" -> Segments.page(a)
        "photos" -> Photos.page(a)
        "chase" -> Chase.page(a)
        "help" -> Help.page(a)
        else -> menu(a)
    }

    private fun menu(a: AppActivity) {
        val col = a.page()
        col.addView(Ui.heading(a, "More"))
        col.addView(Ui.card(a).apply {
            PAGES.forEachIndexed { i, (id, t) ->
                if (i > 0) addView(Ui.divider(a))
                addView(Ui.row(a, t.first, "›", t.second).apply { setOnClickListener { a.show("more:$id") } })
            }
        })
    }

    internal fun back(a: AppActivity, col: LinearLayout, title: String) {
        col.addView(Ui.text(a, "‹  More", 13f, Ui.ORANGE, true).apply {
            setPadding(0, Ui.dp(a, 4), 0, Ui.dp(a, 4)); setOnClickListener { a.show("more") }
        })
        col.addView(Ui.text(a, title, 20f, Ui.TEXT, true))
    }

    private fun day(x: JSONObject) = x.optString("start_date_local").ifEmpty { x.optString("start_date") }.take(10)
    private fun pct(cur: Double, was: Double) = if (was <= 0) "—" else Math.round((cur - was) / was * 100).let { (if (it >= 0) "▲ " else "▼ ") + Math.abs(it) + "%" }
    private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

    // ── Trends (website renderTrends + renderRewind) ────────────────────────
    private var rewindYear = 0

    fun trends(a: AppActivity): Unit = a.load(listOf("activities?limit=500")) { r ->
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities")).filter { day(it).length == 10 }
        val col = a.page()
        back(a, col, "Trends")
        if (acts.isEmpty()) { col.addView(Ui.text(a, "No activities yet.", 13f, Ui.MUTED)); return@load }
        weekly(a, col, acts)
        yearOverYear(a, col, acts)
        rewind(a, col, acts)
    }

    /** Distance per week (weeks start on Sunday, like the website), the last [n]. */
    internal fun weeks(acts: List<JSONObject>, n: Int = 20): List<Pair<String, Double>> {
        val km = HashMap<String, Double>()
        acts.forEach { x ->
            val d = java.time.LocalDate.parse(day(x))
            val sun = d.minusDays((d.dayOfWeek.value % 7).toLong()).toString()
            km[sun] = (km[sun] ?: 0.0) + x.optDouble("distance") / 1000
        }
        return km.toList().sortedBy { it.first }.takeLast(n)
    }

    private fun weekly(a: AppActivity, col: LinearLayout, acts: List<JSONObject>) {
        val w = weeks(acts)
        val v = w.map { it.second }
        val cur = v.lastOrNull() ?: 0.0; val prev = v.getOrNull(v.size - 2) ?: 0.0
        col.addView(Ui.heading(a, "Weekly distance (km)"))
        col.addView(Ui.tiles(a, listOf(
            String.format(Locale.US, "%.0f km", v.average()) to "weekly average|distance",
            String.format(Locale.US, "%.0f km", v.maxOrNull() ?: 0.0) to "best week",
            String.format(Locale.US, "%.0f km", cur) to "latest week",
            pct(cur, prev) to "vs the week before",
        )))
        col.addView(Ui.card(a).apply {
            addView(Screens.chart(a, BarChart(a).apply {
                set(v.toDoubleArray(), w.map { Ui.date(it.first).substringBeforeLast(' ') })
                highlight = v.size - 1
            }, 150))
        })
    }

    private fun yearOverYear(a: AppActivity, col: LinearLayout, acts: List<JSONObject>) {
        val byYear = acts.groupBy { day(it).take(4).toInt() }.mapValues { (_, l) -> DoubleArray(12).also { m -> l.forEach { m[day(it).substring(5, 7).toInt() - 1] += it.optDouble("distance") / 1000 } } }
        val cy = byYear.keys.maxOrNull() ?: return
        val cur = byYear[cy]!!; val prev = byYear[cy - 1]
        val upTo = cur.indexOfLast { it > 0 }.coerceAtLeast(0)
        val best = cur.indices.maxByOrNull { cur[it] } ?: 0
        val curSum = cur.sum(); val prevSame = prev?.take(upTo + 1)?.sum() ?: 0.0
        col.addView(Ui.heading(a, "Year over year · $cy vs ${cy - 1}"))
        col.addView(Ui.tiles(a, listOf(
            String.format(Locale.US, "%,.0f km", curSum) to "$cy total|distance",
            "${MONTHS[best]} · ${Math.round(cur[best])} km" to "best month",
            String.format(Locale.US, "%,.0f km", prevSame) to "${cy - 1}, same months",
            pct(curSum, prevSame) to "change",
        )))
        col.addView(Ui.card(a).apply {
            addView(Screens.chart(a, BarChart(a).apply {
                behind = prev
                set(cur, MONTHS.map { it.take(1) })
                highlight = upTo
            }, 150))
            addView(Ui.text(a, "Bars: $cy. Grey behind: ${cy - 1}.", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
        })
    }

    private fun rewind(a: AppActivity, col: LinearLayout, acts: List<JSONObject>) {
        val years = acts.map { day(it).take(4).toInt() }.distinct().sortedDescending()
        if (rewindYear !in years) rewindYear = years.first()
        val yr = rewindYear
        col.addView(Ui.heading(a, "Year in review"))
        col.addView(android.widget.HorizontalScrollView(a).apply {
            isHorizontalScrollBarEnabled = false
            addView(LinearLayout(a).apply {
                years.forEach { y ->
                    addView(Ui.text(a, "$y", 13f, if (y == yr) Ui.ORANGE else Ui.MUTED, true).apply {
                        setPadding(0, Ui.dp(a, 6), Ui.dp(a, 18), Ui.dp(a, 6)); setOnClickListener { rewindYear = y; a.show("more:trends") }
                    })
                }
            })
        })
        val ya = acts.filter { day(it).startsWith("$yr") }
        val pa = acts.filter { day(it).startsWith("${yr - 1}") }
        fun sum(l: List<JSONObject>, k: String) = l.sumOf { it.optDouble(k, 0.0) }
        col.addView(Ui.card(a).apply {
            addView(Ui.row(a, "", "$yr", "vs ${yr - 1}"))
            listOf(
                Triple("Activities", ya.size.toDouble(), pa.size.toDouble()) to { v: Double -> Math.round(v).toString() },
                Triple("Distance", sum(ya, "distance"), sum(pa, "distance")) to { v: Double -> Ui.km(v) },
                Triple("Elevation", sum(ya, "total_elevation_gain"), sum(pa, "total_elevation_gain")) to { v: Double -> String.format(Locale.US, "%,d m", Math.round(v)) },
                Triple("Moving time", sum(ya, "moving_time"), sum(pa, "moving_time")) to { v: Double -> Ui.hm(v.toLong()) },
            ).forEach { (t, f) ->
                addView(Ui.divider(a))
                addView(Ui.row(a, t.first, f(t.second), if (pa.isEmpty()) "—" else f(t.third) + " · " + pct(t.second, t.third)))
            }
        })
        val top = ya.groupingBy { it.optString("type") }.eachCount().maxByOrNull { it.value }
        val longest = ya.maxByOrNull { it.optDouble("distance") }
        val hr = ya.map { it.optDouble("average_heartrate", 0.0) }.filter { it > 0 }
        val watts = ya.map { it.optDouble("average_watts", 0.0) }.filter { it > 0 }
        val time = sum(ya, "moving_time")
        val dow = IntArray(7).also { d -> ya.forEach { d[java.time.LocalDate.parse(day(it)).dayOfWeek.value % 7]++ } }
        val month = DoubleArray(12).also { m -> ya.forEach { m[day(it).substring(5, 7).toInt() - 1] += it.optDouble("distance") / 1000 } }
        col.addView(Ui.tiles(a, listOfNotNull(
            Ui.km(if (ya.isEmpty()) 0.0 else sum(ya, "distance") / ya.size) to "average distance|distance",
            (top?.key ?: "—") to "top sport · ${top?.value ?: 0}×",
            (longest?.let { Ui.km(it.optDouble("distance")) } ?: "—") to "longest|distance",
            (if (time > 0) Ui.kmh(sum(ya, "distance") / time) else "—") to "average speed|speed",
            Ui.kmh(ya.maxOfOrNull { it.optDouble("max_speed", 0.0) } ?: 0.0) to "max speed|speed",
            (if (hr.isEmpty()) "—" else "${Math.round(hr.average())} bpm") to "average HR|hr",
            "${ya.maxOfOrNull { it.optInt("max_heartrate") } ?: 0} bpm" to "max HR|hr",
            if (watts.isEmpty()) null else "${Math.round(watts.average())} W" to "average power|power",
            String.format(Locale.US, "%,d", Math.round(ya.sumOf { it.optDouble("kilojoules", it.optDouble("calories", 0.0)) })) to "kJ of work|energy",
            "${ya.map { day(it) }.distinct().size}" to "active days",
            "${ya.sumOf { it.optInt("kudos_count") }}" to "kudos",
            "${ya.sumOf { it.optInt("achievement_count") }}" to "achievements",
            "${ya.sumOf { it.optInt("pr_count") }}" to "PRs",
            listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")[dow.indices.maxByOrNull { dow[it] } ?: 0] to "busiest day",
            MONTHS[month.indices.maxByOrNull { month[it] } ?: 0] to "peak month",
        )))
        col.addView(Ui.heading(a, "$yr distance per month (km)"))
        col.addView(Ui.card(a).apply { addView(Screens.chart(a, BarChart(a).apply { set(month, MONTHS.map { it.take(1) }) }, 150)) })
    }

    // ── Calendar (website renderCalendar + calDayOpen + renderMonthly) ──────
    private var calMonth: java.time.YearMonth? = null
    private var calDay: String? = null
    private var monthlyYear = 0

    /** Longest run of consecutive active days among [days] (yyyy-MM-dd). */
    internal fun longestStreak(days: Set<String>): Int {
        var best = 0
        days.forEach { d ->
            if (java.time.LocalDate.parse(d).minusDays(1).toString() in days) return@forEach   // not the start of a run
            var n = 0; var x = java.time.LocalDate.parse(d)
            while (x.toString() in days) { n++; x = x.plusDays(1) }
            best = maxOf(best, n)
        }
        return best
    }

    fun calendar(a: AppActivity): Unit = a.load(listOf("activities?limit=500")) { r ->
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities")).filter { day(it).length == 10 }
        val col = a.page()
        back(a, col, "Calendar")
        if (acts.isEmpty()) { col.addView(Ui.text(a, "No activities yet.", 13f, Ui.MUTED)); return@load }
        val byDay = acts.groupBy { day(it) }
        val today = java.time.LocalDate.now()
        val year = byDay.filterKeys { it > today.minusDays(365).toString() }
        col.addView(Ui.heading(a, "Last 365 days"))
        col.addView(Ui.tiles(a, listOf(
            "${year.values.sumOf { it.size }}" to "activities|rides", "${year.size}" to "active days",
            "${longestStreak(year.keys)} days" to "longest streak", "${year.values.maxOfOrNull { it.size } ?: 0}" to "most in one day",
        )))

        val month = calMonth ?: java.time.YearMonth.from(today).also { calMonth = it }
        val nav = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = android.view.Gravity.CENTER_VERTICAL }
        fun arrow(t: String, by: Long) = Ui.text(a, t, 20f, Ui.ORANGE, true).apply {
            setPadding(Ui.dp(a, 14), Ui.dp(a, 4), Ui.dp(a, 14), Ui.dp(a, 4)); setOnClickListener { calMonth = month.plusMonths(by); calDay = null; a.show("more:calendar") }
        }
        nav.addView(arrow("‹", -1))
        nav.addView(Ui.text(a, MONTHS[month.monthValue - 1] + " ${month.year}", 15f, Ui.TEXT, true).apply { gravity = android.view.Gravity.CENTER }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        nav.addView(arrow("›", 1))
        col.addView(nav)
        val inMonth = byDay.filterKeys { it.startsWith(month.toString()) }
        col.addView(Ui.text(a, "${inMonth.values.sumOf { it.size }} activities · ${inMonth.size} active days · " + Ui.km(inMonth.values.flatten().sumOf { it.optDouble("distance") }), 11f, Ui.MUTED))
        col.addView(Ui.card(a).apply {
            fun line() = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL }.also { addView(it) }
            line().apply { listOf("S", "M", "T", "W", "T", "F", "S").forEach { addView(Ui.text(a, it, 11f, Ui.MUTED, true).apply { gravity = android.view.Gravity.CENTER }, LinearLayout.LayoutParams(0, Ui.dp(a, 22), 1f)) } }
            var row = line()
            val lead = month.atDay(1).dayOfWeek.value % 7
            fun blank() = row.addView(android.view.View(a), LinearLayout.LayoutParams(0, Ui.dp(a, 40), 1f).apply { setMargins(Ui.dp(a, 2), Ui.dp(a, 2), Ui.dp(a, 2), Ui.dp(a, 2)) })
            repeat(lead) { blank() }
            for (d in 1..month.lengthOfMonth()) {
                if ((lead + d - 1) % 7 == 0 && d > 1) row = line()
                val key = month.atDay(d).toString()
                val n = byDay[key]?.size ?: 0
                row.addView(Ui.text(a, "$d", 13f, if (n > 0) Ui.TEXT else Ui.MUTED, n > 0).apply {
                    gravity = android.view.Gravity.CENTER
                    // the website's legend: 1, 2, 3–4, 5+ activities a day
                    background = android.graphics.drawable.GradientDrawable().apply {
                        cornerRadius = Ui.dp(a, 6).toFloat()
                        setColor(if (n == 0) Ui.LINE else androidx.core.graphics.ColorUtils.setAlphaComponent(Ui.ORANGE, when (n) { 1 -> 90; 2 -> 150; 3, 4 -> 210; else -> 255 }))
                        if (key == calDay) setStroke(Ui.dp(a, 2), Ui.TEXT)
                    }
                    if (n > 0) setOnClickListener {
                        val list = byDay[key]!!
                        if (list.size == 1) a.openRide(list[0]) else { calDay = key; a.show("more:calendar") }
                    }
                }, LinearLayout.LayoutParams(0, Ui.dp(a, 40), 1f).apply { setMargins(Ui.dp(a, 2), Ui.dp(a, 2), Ui.dp(a, 2), Ui.dp(a, 2)) })
            }
            repeat((7 - (lead + month.lengthOfMonth()) % 7) % 7) { blank() }
        })
        calDay?.let { k -> byDay[k] }?.let { list ->
            col.addView(Ui.heading(a, Ui.date(calDay!!)))
            col.addView(Ui.card(a).apply {
                list.forEachIndexed { i, x ->
                    if (i > 0) addView(Ui.divider(a))
                    addView(Ui.row(a, x.optString("name"), Ui.km(x.optDouble("distance")),
                        x.optString("sport_type").ifEmpty { x.optString("type") }.replace(Regex("([a-z])([A-Z])"), "$1 $2") + " · " + Ui.hm(x.optLong("moving_time"))).apply { setOnClickListener { a.openRide(x) } })
                }
            })
        }
        monthByMonth(a, col, acts)
    }

    private fun monthByMonth(a: AppActivity, col: LinearLayout, acts: List<JSONObject>) {
        val years = acts.map { day(it).take(4).toInt() }.distinct().sortedDescending()
        if (monthlyYear !in years) monthlyYear = years.first()
        val yr = monthlyYear
        col.addView(Ui.heading(a, "Month by month"))
        col.addView(android.widget.HorizontalScrollView(a).apply {
            isHorizontalScrollBarEnabled = false
            addView(LinearLayout(a).apply {
                years.forEach { y ->
                    addView(Ui.text(a, "$y", 13f, if (y == yr) Ui.ORANGE else Ui.MUTED, true).apply {
                        setPadding(0, Ui.dp(a, 6), Ui.dp(a, 18), Ui.dp(a, 6)); setOnClickListener { monthlyYear = y; a.show("more:calendar") }
                    })
                }
            })
        })
        val byMonth = acts.filter { day(it).startsWith("$yr") }.groupBy { day(it).substring(5, 7).toInt() - 1 }
        var prev: Double? = null
        col.addView(Ui.card(a).apply {
            (0 until 12).forEach { m ->
                if (m > 0) addView(Ui.divider(a))
                val l = byMonth[m]
                if (l == null) { addView(Ui.row(a, MONTHS[m], "—")); return@forEach }
                val dist = l.sumOf { it.optDouble("distance") }
                val spd = l.map { it.optDouble("average_speed", 0.0) }.filter { it > 0 }
                val hr = l.map { it.optDouble("average_heartrate", 0.0) }.filter { it > 0 }
                val kj = l.sumOf { it.optDouble("kilojoules", it.optDouble("calories", 0.0)) }
                // change against the previous month that had activity, like the website
                val change = prev?.let { if (it > 0) " " + pct(dist, it) else "" }.orEmpty()
                addView(Ui.row(a, MONTHS[m] + " · ${l.size}", Ui.km(dist) + change,
                    String.format(Locale.US, "%,d m · %s", Math.round(l.sumOf { it.optDouble("total_elevation_gain") }), Ui.hm(l.sumOf { it.optLong("moving_time") })) +
                        (if (spd.isNotEmpty()) " · " + Ui.kmh(spd.average()) else "") + (if (hr.isNotEmpty()) " · ${Math.round(hr.average())} bpm" else "") +
                        (if (kj > 0) String.format(Locale.US, " · %,d kJ", Math.round(kj)) else "")))
                prev = dist
            }
            val all = byMonth.values.flatten()
            addView(Ui.divider(a))
            addView(Ui.row(a, "$yr · ${all.size}", Ui.km(all.sumOf { it.optDouble("distance") }),
                String.format(Locale.US, "%,d m · %s", Math.round(all.sumOf { it.optDouble("total_elevation_gain") }), Ui.hm(all.sumOf { it.optLong("moving_time") }))))
        })
        col.addView(Ui.text(a, "Each month: activities, distance with the change from the month before, climbing, moving time, average speed, heart rate and work.", 11f, Ui.MUTED))
    }
}
