package xyz.doniwirawan.ascent

import android.widget.LinearLayout
import org.json.JSONObject
import java.util.Locale

/**
 * More → Segments: starred segments with your effort history, KOMs, and the
 * website's Segment Intelligence (js/segment-intel.js) — which starred
 * segments you are closest to a PR on, improving on, or stuck on.
 */
object Segments {
    class Metrics(val pr: Double, val recentBest: Double, val gap: Double, val improvePct: Double, val prob: Int, val count: Int)

    /** Standard normal CDF (Abramowitz–Stegun 26.2.17). */
    private fun cdf(z: Double): Double {
        val t = 1 / (1 + 0.2316419 * Math.abs(z)); val d = 0.3989423 * Math.exp(-z * z / 2)
        val p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
        return if (z > 0) 1 - p else p
    }

    /** Efforts (seconds, date) → PR, recent best, gap, improvement and next-PR chance, website _segMetrics. */
    internal fun metrics(efforts: List<Pair<Double, String>>): Metrics? {
        val all = efforts.filter { it.first > 0 }.sortedBy { it.second }
        if (all.size < 4) return null
        val med = all.map { it.first }.sorted()[all.size / 2]
        val s = all.filter { it.first >= med * 0.5 && it.first <= med * 2.2 }      // drop stopped runs and GPS shortcuts
        if (s.size < 4) return null
        val times = s.map { it.first }; val pr = times.minOrNull()!!
        val k = maxOf(3, s.size / 3)
        val recent = times.takeLast(k); val older = times.take(k)
        val rm = recent.average(); val om = older.average()
        val improve = if (om > 0) (om - rm) / om * 100 else 0.0
        val sd = maxOf(Math.sqrt(recent.map { (it - rm) * (it - rm) }.average()), pr * 0.004)
        var prob = cdf((pr - rm) / sd)
        if (improve > 1) prob += minOf(0.12, improve / 100)
        prob = prob.coerceIn(0.02, 0.8)
        return Metrics(pr, recent.minOrNull()!!, maxOf(0.0, recent.minOrNull()!! - pr), Math.round(improve * 10) / 10.0, Math.round(prob * 100).toInt(), s.size)
    }

    private fun time(s: Double) = Math.round(s).let { if (it >= 3600) String.format(Locale.US, "%d:%02d:%02d", it / 3600, it / 60 % 60, it % 60) else String.format(Locale.US, "%d:%02d", it / 60, it % 60) }
    private fun gapText(g: Double) = Math.round(g).let { if (it < 60) "${it}s" else String.format(Locale.US, "%dm%02ds", it / 60, it % 60) }
    private fun segLine(s: JSONObject) = String.format(Locale.US, "%.2f km · %.1f%%", s.optDouble("distance") / 1000, s.optDouble("average_grade")) +
        (s.optInt("climb_category").takeIf { it > 0 }?.let { " · cat ${5 - it}".replace("cat 0", "HC") } ?: "")

    private var open: Long = 0
    private var intel: Map<Long, Metrics>? = null
    private var running = false

    fun page(a: AppActivity): Unit = a.load(listOf("segments", "koms")) { r ->
        val starred = Screens.list(r["segments"]?.optJSONArray("segments"))
        val koms = Screens.list(r["koms"]?.optJSONArray("koms"))
        val col = a.page()
        More.back(a, col, "Segments")
        if (starred.isEmpty() && koms.isEmpty()) { col.addView(Ui.text(a, "No starred segments yet — star some on Strava.", 13f, Ui.MUTED)); return@load }

        // Segment intelligence: effort history of up to 15 starred segments
        val cachedIntel = intel ?: starred.take(15).mapNotNull { s -> Api.cached(a, "segments/${s.optLong("id")}/efforts")?.let { s.optLong("id") to it } }
            .mapNotNull { (id, e) -> metrics(Screens.list(e.optJSONArray("efforts")).map { it.optDouble("elapsed_time") to it.optString("start_date_local") })?.let { id to it } }.toMap().takeIf { it.isNotEmpty() }
        val name = starred.associate { it.optLong("id") to it.optString("name") }
        col.addView(Ui.heading(a, "Segment intelligence"))
        col.addView(Ui.card(a).apply {
            val m = cachedIntel.orEmpty()
            if (m.isEmpty()) addView(Ui.text(a, "Analyse your starred segments' effort history — which you are closest to a PR on, which are improving, and which have stalled.", 12f, Ui.MUTED))
            fun group(title: String, items: List<Pair<Long, Metrics>>, value: (Metrics) -> String) {
                if (items.isEmpty()) return
                addView(Ui.text(a, title, 13f, Ui.ORANGE, true).apply { setPadding(0, Ui.dp(a, 8), 0, 2) })
                items.forEach { (id, x) -> addView(Ui.row(a, name[id] ?: "Segment", value(x)).apply { setOnClickListener { open = id; a.show("more:segments") } }) }
            }
            group("Closest to a PR", m.toList().filter { it.second.count >= 4 }.sortedWith(compareByDescending<Pair<Long, Metrics>> { it.second.prob }.thenBy { it.second.gap }).take(5)) {
                (if (it.gap <= 0) "at your PR" else "+${gapText(it.gap)} behind") + " · ${it.prob}% next time" }
            group("Improving fastest", m.toList().filter { it.second.improvePct > 2 }.sortedByDescending { it.second.improvePct }.take(5)) { "▲ ${it.improvePct}% faster" }
            group("Stagnating", m.toList().filter { Math.abs(it.second.improvePct) <= 2 && it.second.count >= 5 }.take(5)) { "${it.count} efforts · flat" }
            if (!running) addView(a.button(if (m.isEmpty()) "Analyse my segments" else "Recompute") {
                running = true; a.show("more:segments")
                Thread {
                    val out = HashMap<Long, Metrics>()
                    for (s in starred.take(15)) {
                        val e = runCatching { Api.get(a, "segments/${s.optLong("id")}/efforts") }.getOrNull() ?: break   // Strava's limit
                        metrics(Screens.list(e.optJSONArray("efforts")).map { it.optDouble("elapsed_time") to it.optString("start_date_local") })?.let { out[s.optLong("id")] = it }
                    }
                    intel = out; running = false
                    a.ui.post { a.show("more:segments") }
                }.start()
            }) else addView(Ui.text(a, "Analysing…", 12f, Ui.MUTED))
            addView(Ui.text(a, "Next-PR chance is a rough estimate from your recent efforts against your PR.", 11f, Ui.MUTED))
        })

        // the open segment's effort history
        starred.firstOrNull { it.optLong("id") == open }?.let { s ->
            col.addView(Ui.heading(a, s.optString("name")))
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, segLine(s), 12f, Ui.MUTED))
                val cached = Api.cached(a, "segments/$open/efforts")
                if (cached == null) {
                    addView(Ui.text(a, "Loading your efforts…", 12f, Ui.MUTED))
                    Thread { runCatching { Api.get(a, "segments/$open/efforts") }; a.ui.post { a.show("more:segments") } }.start()
                } else {
                    val e = Screens.list(cached.optJSONArray("efforts")).sortedBy { it.optString("start_date_local") }
                    if (e.isNotEmpty()) {
                        val best = e.minByOrNull { it.optDouble("elapsed_time") }!!
                        addView(Ui.row(a, "PR", time(best.optDouble("elapsed_time")), Ui.date(best.optString("start_date_local")) + " · ${e.size} efforts"))
                        addView(Screens.chart(a, BarChart(a).apply { color = Ui.BLUE; format = { time(it) }; set(e.takeLast(20).map { it.optDouble("elapsed_time") }.toDoubleArray(), e.takeLast(20).map { Ui.date(it.optString("start_date_local")).substringBefore(' ') }) }, 130))
                        addView(Ui.text(a, "Your last ${minOf(20, e.size)} efforts, oldest first — shorter is faster.", 11f, Ui.MUTED))
                    }
                }
            })
        }

        if (starred.isNotEmpty()) {
            col.addView(Ui.heading(a, "Starred · ${starred.size}"))
            col.addView(Ui.card(a).apply {
                starred.forEachIndexed { i, s ->
                    if (i > 0) addView(Ui.divider(a))
                    val pr = s.optJSONObject("athlete_pr_effort")?.optDouble("elapsed_time", 0.0)?.takeIf { it > 0 } ?: s.optDouble("pr_time", 0.0)
                    addView(Ui.row(a, s.optString("name"), if (pr > 0) time(pr) else "—", segLine(s) + (s.optString("city").takeIf { it.isNotEmpty() && it != "null" }?.let { " · $it" } ?: "")).apply {
                        setOnClickListener { open = if (open == s.optLong("id")) 0 else s.optLong("id"); a.show("more:segments") }
                    })
                }
            })
        }
        if (koms.isNotEmpty()) {
            col.addView(Ui.heading(a, "KOM / QOM / CR · ${koms.size}"))
            col.addView(Ui.card(a).apply {
                koms.forEachIndexed { i, k ->
                    if (i > 0) addView(Ui.divider(a))
                    val s = k.optJSONObject("segment") ?: k
                    addView(Ui.row(a, "👑 " + s.optString("name"), time(k.optDouble("elapsed_time")), segLine(s) + " · " + Ui.date(k.optString("start_date_local"))))
                }
            })
        }
    }
}
