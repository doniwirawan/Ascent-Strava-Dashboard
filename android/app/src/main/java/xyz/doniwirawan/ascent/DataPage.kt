package xyz.doniwirawan.ascent

import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import org.json.JSONObject
import java.util.Locale

/**
 * More → Data: the website's data table (js/data-table.js) as a sortable list.
 * One row per activity, carrying the sleep of the night before it (a night is
 * dated by the morning you woke); nights with no activity are rest-day rows.
 * Pick a column to sort by; pick it again to reverse. Blanks always sort last.
 */
object DataPage {
    class Row(val date: String, val a: JSONObject?, val s: SleepInsights.Night?)
    class Col(val key: String, val label: String, val value: (Row) -> Double?, val fmt: (Double) -> String = { String.format(Locale.US, "%,.0f", it) })

    private fun a(r: Row, k: String) = r.a?.optDouble(k, Double.NaN)?.takeIf { !it.isNaN() && it != 0.0 }
    private fun s(r: Row, k: String) = r.s?.get(k)
    private val hm = { m: Double -> "${(m / 60).toInt()}:" + String.format(Locale.US, "%02d", Math.round(m % 60)) }
    private val clock = { h: Double -> Math.round(((h % 24) + 24) % 24 * 60).let { String.format(Locale.US, "%02d:%02d", it / 60 % 24, it % 60) } }

    internal fun cols(ftp: Double, kg: Double): List<Col> {
        fun np(r: Row) = if (r.a?.optBoolean("device_watts") == true) a(r, "weighted_average_watts") else null
        return listOf(
            Col("date", "Date", { r -> java.time.LocalDate.parse(r.date).toEpochDay().toDouble() }, { java.time.LocalDate.ofEpochDay(it.toLong()).toString().let(Ui::date) }),
            Col("dist", "Distance", { a(it, "distance")?.div(1000) }, { String.format(Locale.US, "%.1f km", it) }),
            Col("time", "Moving time", { a(it, "moving_time") }, { Ui.hm(it.toLong()) }),
            Col("elev", "Elevation", { a(it, "total_elevation_gain") }, { String.format(Locale.US, "%,.0f m", it) }),
            Col("avg", "Avg speed", { a(it, "average_speed")?.times(3.6) }, { String.format(Locale.US, "%.1f km/h", it) }),
            Col("max", "Max speed", { a(it, "max_speed")?.times(3.6) }, { String.format(Locale.US, "%.1f km/h", it) }),
            Col("hr", "Avg HR", { a(it, "average_heartrate") }, { "${Math.round(it)} bpm" }),
            Col("hrmax", "Max HR", { a(it, "max_heartrate") }, { "${Math.round(it)} bpm" }),
            Col("w", "Avg power", { a(it, "average_watts") }, { "${Math.round(it)} W" }),
            Col("np", "Normalized power", { np(it) }, { "${Math.round(it)} W" }),
            Col("wkg", "W/kg", { r -> if (r.a?.optBoolean("device_watts") == true && kg > 0) a(r, "average_watts")?.div(kg) else null }, { String.format(Locale.US, "%.2f", it) }),
            Col("if", "Intensity factor", { r -> if (ftp > 0) np(r)?.div(ftp) else null }, { String.format(Locale.US, "%.2f", it) }),
            Col("tss", "TSS", { r -> if (ftp > 0) np(r)?.let { p -> (r.a!!.optDouble("moving_time") * p * (p / ftp)) / (ftp * 3600) * 100 } else null }),
            Col("kj", "Energy", { a(it, "kilojoules") }, { String.format(Locale.US, "%,.0f kJ", it) }),
            Col("effort", "Relative effort", { a(it, "suffer_score") }),
            Col("kudos", "Kudos", { a(it, "kudos_count") }),
            Col("prs", "PRs", { a(it, "pr_count") }),
            Col("s_asleep", "Sleep before", { s(it, "asleep")?.takeIf { v -> v > 0 } }, hm),
            Col("s_deep", "Deep", { s(it, "deep") }, hm),
            Col("s_rem", "REM", { s(it, "rem") }, hm),
            Col("s_nap", "Nap", { s(it, "nap")?.takeIf { v -> v > 0 } }, hm),
            Col("s_wakeups", "Wake-ups", { s(it, "wakeups") }),
            Col("s_bed", "Bedtime", { s(it, "bed") }, clock),
            Col("s_up", "Woke up", { s(it, "up") }, clock),
            Col("s_eff", "Sleep efficiency", { s(it, "eff") }, { String.format(Locale.US, "%.1f%%", it) }),
            Col("s_rhr", "Resting HR", { s(it, "rhr") }, { "${Math.round(it)} bpm" }),
            Col("s_hrv", "HRV", { s(it, "hrv") }, { "${Math.round(it)} ms" }),
            Col("s_stress", "Stress", { s(it, "stress") }),
            Col("s_steps", "Steps", { s(it, "steps") }),
            Col("s_spo2", "SpO₂", { s(it, "spo2") }, { String.format(Locale.US, "%.1f%%", it) }),
        )
    }

    /** Activities with the night before them, plus nights with no activity. */
    internal fun rows(acts: List<JSONObject>, nights: List<SleepInsights.Night>): List<Row> {
        val byDate = nights.associateBy { it.date }
        val out = acts.filter { it.optString("start_date_local").length >= 10 }.map { x -> x.optString("start_date_local").take(10).let { d -> Row(d, x, byDate[d]) } }.toMutableList()
        val actDays = out.map { it.date }.toSet()
        nights.filter { it.date !in actDays && (it["asleep"] ?: 0.0) > 0 }.forEach { out += Row(it.date, null, it) }
        return out
    }

    /** Sorted by [c]; blanks last whichever way it runs. */
    internal fun sort(rows: List<Row>, c: Col, desc: Boolean): List<Row> {
        val (have, blank) = rows.partition { c.value(it) != null }
        return (if (desc) have.sortedByDescending { c.value(it)!! } else have.sortedBy { c.value(it)!! }) + blank.sortedByDescending { it.date }
    }

    private var sortKey = "date"
    private var desc = true
    private var filter = "all"

    fun page(a: AppActivity): Unit = a.load(listOf("activities?limit=500", "sleep", "me")) { r ->
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities"))
        val nights = r["sleep"]?.let { SleepInsights.nights(it) }.orEmpty()
        val me = r["me"]
        val kg = me?.optDouble("weight", 0.0) ?: 0.0
        val ftp = me?.optDouble("ftp", 0.0)?.takeIf { it > 0 } ?: Math.round((acts.filter { it.optBoolean("device_watts") && it.optLong("moving_time") >= 1200 }.maxOfOrNull { it.optDouble("weighted_average_watts", 0.0) } ?: 0.0) * 0.95).toDouble()
        val cols = cols(ftp, kg)
        val col = a.page()
        More.back(a, col, "Data")
        fun chips(items: List<Pair<String, String>>, on: String, pick: (String) -> Unit) = HorizontalScrollView(a).apply {
            isHorizontalScrollBarEnabled = false
            addView(LinearLayout(a).apply {
                items.forEach { (k, l) -> addView(Ui.text(a, l + if (k == on && items.size > 4) (if (desc) " ↓" else " ↑") else "", 13f, if (k == on) Ui.ORANGE else Ui.MUTED, true).apply {
                    setPadding(0, Ui.dp(a, 8), Ui.dp(a, 16), Ui.dp(a, 8)); setOnClickListener { pick(k); a.show("more:data") } }) }
            })
        }
        col.addView(chips(listOf("all" to "All", "ride" to "Rides", "run" to "Runs", "rest" to "Rest days"), filter) { filter = it })
        col.addView(chips(cols.map { it.key to it.label }, sortKey) { if (it == sortKey) desc = !desc else { sortKey = it; desc = true } })
        val c = cols.first { it.key == sortKey }
        val shown = sort(rows(acts, nights).filter { row ->
            when (filter) { "ride" -> row.a != null && Screens.isRide(row.a); "run" -> row.a?.optString("type")?.contains("Run") == true; "rest" -> row.a == null; else -> true }
        }, c, desc)
        col.addView(Ui.text(a, "${shown.size} rows · sorted by ${c.label.lowercase(Locale.ROOT)}" + if (shown.size > 300) " · first 300" else "", 11f, Ui.MUTED))
        col.addView(Ui.card(a).apply {
            shown.take(300).forEachIndexed { i, row ->
                if (i > 0) addView(Ui.divider(a))
                val x = row.a
                val sub = Ui.date(row.date) + (if (x != null) " · " + Ui.km(x.optDouble("distance")) + " · " + Ui.hm(x.optLong("moving_time")) else "") +
                    (row.s?.get("asleep")?.takeIf { it > 0 }?.let { " · slept " + hm(it) } ?: "")
                addView(Ui.row(a, x?.optString("name") ?: "Rest day", c.value(row)?.let(c.fmt) ?: "—", sub).apply { x?.let { act -> setOnClickListener { a.openRide(act) } } })
            }
        })
    }
}
