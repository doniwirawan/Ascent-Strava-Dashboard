package xyz.doniwirawan.ascent

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * More → GPS check: the website's "Abnormal speed data" (js/gps-fix.js).
 * Activities whose top speed is over 65 km/h are GPS glitches; normalizing one
 * reads its speed stream, interpolates the spikes away and keeps the corrected
 * top speed on this phone, which then replaces Strava's everywhere in the app.
 */
object GpsCheck {
    const val CEILING = 65 / 3.6                                     // m/s, the website's MAX_SPEED_CEILING
    private var fixes: JSONObject? = null                            // activity id → {raw, fixed} in m/s

    private fun file(ctx: Context) = File(ctx.filesDir, "maxfix.json")
    fun load(ctx: Context) { if (fixes == null) fixes = runCatching { JSONObject(file(ctx).readText()) }.getOrElse { JSONObject() } }
    private fun save(ctx: Context) = file(ctx).writeText(fixes.toString())

    /** Puts a saved correction onto an activity (called on every activity the app reads). */
    fun apply(a: JSONObject) {
        val f = fixes?.optJSONObject(a.optString("id")) ?: return
        if (!a.has("_raw_max")) a.put("_raw_max", f.optDouble("raw"))
        a.put("max_speed", f.optDouble("fixed"))
    }
    private fun raw(a: JSONObject) = a.optDouble("_raw_max", a.optDouble("max_speed", 0.0))

    private fun median(v: List<Double>) = v.sorted().let { s -> if (s.isEmpty()) 0.0 else if (s.size % 2 == 1) s[s.size / 2] else (s[s.size / 2 - 1] + s[s.size / 2]) / 2 }

    /** Spikes replaced by the mean of their nearest good neighbours, website fixSpeedSpikes with a ceiling. */
    internal fun fixSpikes(speeds: DoubleArray, ceiling: Double = CEILING): Pair<DoubleArray, Int> {
        val out = speeds.copyOf()
        val good = speeds.filter { it > 0 && it.isFinite() }
        if (good.size < 2) return out to 0
        val med = median(good)
        fun bad(v: Double) = !(v > 0) || !v.isFinite() || v > ceiling
        var fixed = 0
        for (i in speeds.indices) {
            if (!bad(speeds[i])) continue
            var l = i - 1; while (l >= 0 && bad(speeds[l])) l--
            var r = i + 1; while (r < speeds.size && bad(speeds[r])) r++
            val lv = if (l >= 0) out[l] else null; val rv = if (r < speeds.size) speeds[r] else null
            out[i] = if (lv != null && rv != null) (lv + rv) / 2 else lv ?: rv ?: med
            fixed++
        }
        return out to fixed
    }

    /** Fetches the speed stream and saves the corrected top speed; false if the ride has no usable stream. */
    private fun normalize(ctx: Context, a: JSONObject): Boolean {
        val r = Api.get(ctx, "activities/${a.optLong("id")}?streams=velocity_smooth")
        val d = r.optJSONObject("streams")?.optJSONObject("velocity_smooth")?.optJSONArray("data") ?: return false
        val max = fixSpikes(DoubleArray(d.length()) { d.optDouble(it, Double.NaN) }).first.filter { !it.isNaN() }.maxOrNull() ?: return false
        if (max <= 0) return false
        fixes!!.put(a.optString("id"), JSONObject().put("raw", raw(a)).put("fixed", max))
        save(ctx)
        return true
    }

    private var busy = false
    private var note = ""

    fun page(a: AppActivity): Unit = a.load(listOf("activities?limit=500")) { r ->
        load(a)
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities"))
        val bad = acts.filter { raw(it) > CEILING }.sortedByDescending { raw(it) }
        val col = a.page()
        More.back(a, col, "GPS check")
        if (note.isNotEmpty()) col.addView(Ui.text(a, note, 12f, Ui.GREEN, true))
        if (bad.isEmpty()) { col.addView(Ui.text(a, "No activities with abnormal speed.", 13f, Ui.MUTED)); return@load }
        fun run(list: List<JSONObject>) {
            if (busy) return
            busy = true; note = "Normalizing ${list.size}…"; a.show("more:gps")
            Thread {
                var done = 0; var failed = 0
                list.forEach { x -> if (runCatching { normalize(a, x) }.getOrDefault(false)) done++ else failed++ }
                busy = false
                note = "Normalized $done." + if (failed > 0) " $failed had no usable speed stream (or Strava's limit was hit)." else ""
                a.ui.post { a.show("more:gps") }
            }.start()
        }
        col.addView(Ui.text(a, "${bad.size} activities with a top speed above 65 km/h — a GPS glitch. Normalizing reads each ride's speed stream, removes the spikes and keeps the real top speed on this phone (records and charts use it).", 12f, Ui.MUTED))
        val todo = bad.filter { fixes?.has(it.optString("id")) != true }
        if (todo.isNotEmpty() && !busy) col.addView(a.button("Normalize all ${todo.size}") { run(todo) })
        col.addView(Ui.card(a).apply {
            bad.forEachIndexed { i, x ->
                if (i > 0) addView(Ui.divider(a))
                val f = fixes?.optJSONObject(x.optString("id"))
                addView(Ui.row(a, x.optString("name"), Ui.kmh(raw(x)) + (f?.let { " → " + Ui.kmh(it.optDouble("fixed")) } ?: ""),
                    Ui.date(x.optString("start_date_local")) + if (f != null) " · normalized" else " · tap to normalize").apply {
                    setOnClickListener { if (f == null) run(listOf(x)) else a.openRide(x) }
                })
            }
        })
        col.addView(Ui.text(a, "Adding a note to the Strava description, and the GPX repair tool, are on the web dashboard's GPS Fix page.", 11f, Ui.MUTED))
    }
}
