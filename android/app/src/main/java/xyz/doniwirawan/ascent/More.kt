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
        "trends" to ("Trends" to "Weekly distance, year over year, year in review"),
    )

    fun show(a: AppActivity, id: String) = when (id) {
        "trends" -> trends(a)
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

    private fun back(a: AppActivity, col: LinearLayout, title: String) {
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
}
