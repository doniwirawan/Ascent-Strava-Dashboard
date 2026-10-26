package xyz.doniwirawan.ascent

import android.content.Context
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale

/**
 * The power curve (js/power-curve.js), Morton's CP / W′ fit and W′ balance
 * (js/sauce.js, from Sauce for Strava, MIT). Each power-meter ride's watts
 * stream is fetched once and its bests kept on the phone.
 */
object PowerCurve {
    val WINDOWS = intArrayOf(5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600)
    private val SHOW = intArrayOf(5, 30, 60, 300, 1200, 3600)
    private val FIT = intArrayOf(120, 300, 600, 1200, 1800, 3600)
    private fun label(w: Int) = if (w < 60) "${w}s" else "${w / 60}min"

    /** 1 Hz power from first to last sample. Smart recording logs a sample every few seconds, so each
     *  value holds until the next sample (as Strava counts it); a gap over 30 s is a stop → 0 W. */
    internal fun grid(watts: DoubleArray, t: DoubleArray): DoubleArray {
        val t0 = t.first().toInt()
        val g = DoubleArray(maxOf(t.last().toInt() - t0 + 1, 0))
        for (i in watts.indices) {
            if (watts[i].isNaN()) continue
            val s = t[i].toInt() - t0
            val e = if (i + 1 < t.size && t[i + 1] - t[i] <= 30) t[i + 1].toInt() - t0 else s + 1
            for (k in maxOf(s, 0) until minOf(e, g.size)) g[k] = watts[i]
        }
        return g
    }
    internal fun times(watts: DoubleArray, time: DoubleArray?) = if (time != null && time.size == watts.size) time else DoubleArray(watts.size) { it.toDouble() }

    /** Best average power per window on that 1 Hz grid, website _pcBestFromStreams. */
    internal fun bests(watts: DoubleArray, time: DoubleArray?): Map<Int, Double> {
        if (watts.isEmpty()) return emptyMap()
        val grid = grid(watts, times(watts, time))
        val out = HashMap<Int, Double>()
        for (w in WINDOWS) {
            if (grid.size < w) continue
            var sum = 0.0; for (i in 0 until w) sum += grid[i]
            var mx = sum
            for (i in w until grid.size) { sum += grid[i] - grid[i - w]; if (sum > mx) mx = sum }
            out[w] = Math.round(mx / w).toDouble()
        }
        return out
    }

    /** The ride's strongest minute as (first sample, last sample, W), for the purple stretch on the map. */
    internal fun bestMinute(watts: DoubleArray, time: DoubleArray?): Triple<Int, Int, Int>? {
        if (watts.isEmpty()) return null
        val t = times(watts, time); val g = grid(watts, t)
        var sum = 0.0; var end = -1; var mx = 0.0
        for (k in g.indices) { sum += g[k]; if (k >= 60) sum -= g[k - 60]; if (k >= 59 && sum > mx) { mx = sum; end = k } }
        if (end < 0) return null
        var from = 0; var to = 0
        for (i in t.indices) { val s = t[i] - t[0]; if (s <= end - 59) from = i; if (s <= end) to = i }
        return Triple(from, minOf(maxOf(to, from + 1), t.size - 1), Math.round(mx / 60).toInt())
    }

    class Fit(val cp: Double, val wPrime: Double)

    /** Morton 3-parameter fit P = CP + W′/(t − k), least squares over k, website spFitMorton. */
    internal fun morton(mmp: List<Pair<Int, Double>>): Fit? {
        if (mmp.size < 3) return null
        var best: Triple<Double, Double, Double>? = null
        val minT = mmp.minOf { it.first }
        var k = 0
        while (k <= minT * 0.9) {
            var sx = 0.0; var sy = 0.0; var sxx = 0.0; var sxy = 0.0; val n = mmp.size
            mmp.forEach { (t, p) -> val x = 1.0 / (t - k); sx += x; sy += p; sxx += x * x; sxy += x * p }
            val den = n * sxx - sx * sx
            if (Math.abs(den) >= 1e-12) {
                val wp = (n * sxy - sx * sy) / den; val cp = (sy - wp * sx) / n
                val err = mmp.sumOf { (t, p) -> (cp + wp / (t - k) - p).let { it * it } }
                if (best == null || err < best.third) best = Triple(cp, wp, err)
            }
            k++
        }
        return best?.takeIf { it.first > 0 && it.second > 0 }?.let { Fit(it.first, it.second) }
    }

    /** W′ balance through a ride (joules), Skiba differential, website spWPrimeBal. */
    internal fun wBal(watts: DoubleArray, cp: Double, wPrime: Double): DoubleArray {
        var bal = wPrime
        return DoubleArray(watts.size) { i -> val p = watts[i].takeIf { !it.isNaN() } ?: 0.0; bal += if (p < cp) (cp - p) * (wPrime - bal) / wPrime else cp - p; bal }
    }

    // Coggan power-profile rank (Sauce rankConstants), male
    private val HIGH = doubleArrayOf(2.82, 2500.0, 1.4, 3.6, 6.08); private val LOW = doubleArrayOf(2.0, 3000.0, 1.3, 1.0, 1.74)
    private val LEVELS = listOf(7 / 8.0 to "World Class", 6 / 8.0 to "Pro", 5 / 8.0 to "Cat 1", 4 / 8.0 to "Cat 2", 3 / 8.0 to "Cat 3", 2 / 8.0 to "Cat 4", 1 / 8.0 to "Cat 5", 0.0 to "Recreational")
    private fun scale(d: Int, c: DoubleArray): Double {
        val slope = Math.log10(c[1] / d * c[2] + c[3]); val enduro = if (d > 3600) 1 / (Math.log(d / 3600.0) * 0.1 + 1) else 1.0
        return (Math.pow(slope, c[0]) + c[4]) * enduro
    }
    internal fun rank(d: Int, watts: Double, kg: Double): String? {
        if (watts <= 0 || kg <= 0) return null
        val hi = scale(d, HIGH); val lo = scale(d, LOW); val level = (watts / kg - lo) / (hi - lo)
        return (LEVELS.firstOrNull { level >= it.first } ?: LEVELS.last()).second
    }

    private fun dir(ctx: Context) = File(ctx.filesDir, "pcurve2").apply { mkdirs() }
    /** A ride's saved bests, or null when it has not been read yet. */
    internal fun saved(ctx: Context, id: Long): Map<Int, Double>? = File(dir(ctx), "$id.json").takeIf { it.exists() }?.let { f ->
        runCatching { JSONObject(f.readText()).let { o -> o.keys().asSequence().associate { it.toInt() to o.getDouble(it) } } }.getOrNull()
    }

    class Curve(val best: Map<Int, Pair<Double, JSONObject>>, val count: Int) {
        val fit get() = morton(FIT.toList().mapNotNull { w -> best[w]?.let { w to it.first } })
    }
    internal fun curve(ctx: Context, rides: List<JSONObject>): Curve {
        val best = HashMap<Int, Pair<Double, JSONObject>>(); var n = 0
        rides.forEach { a -> saved(ctx, a.optLong("id"))?.let { b -> n++; b.forEach { (w, v) -> if ((best[w]?.first ?: -1.0) < v) best[w] = v to a } } }
        return Curve(best, n)
    }

    /** CP and W′ for W′ balance: the fitted ones, else CP = FTP and W′ = 20 kJ like the website. */
    fun cpModel(ctx: Context, ftp: Double): Fit? {
        val acts = Screens.list(Api.cached(ctx, "activities?limit=300")?.optJSONArray("activities")).filter { Screens.isRide(it) && it.optBoolean("device_watts") }
        return curve(ctx, acts).fit ?: if (ftp > 0) Fit(ftp, 20_000.0) else null
    }

    private var running = false
    private var progress = ""

    fun card(a: AppActivity, col: LinearLayout, rides: List<JSONObject>, kg: Double) {
        val c = curve(a, rides)
        val todo = rides.filter { saved(a, it.optLong("id")) == null }.take(80)
        col.addView(Ui.heading(a, "Power curve · best average power at each duration"))
        col.addView(Ui.card(a).apply {
            SHOW.forEach { w -> c.best[w]?.let { (v, x) -> addView(Ui.row(a, label(w), "${Math.round(v)} W", (if (kg > 0) String.format(Locale.US, "%.1f W/kg · ", v / kg) + (rank(w, v, kg) ?: "") + " · " else "") + x.optString("name")).apply { setOnClickListener { a.openRide(x) } }) } }
            c.fit?.let { f -> addView(Ui.divider(a)); addView(Ui.row(a, "Critical power (CP)", "${Math.round(f.cp)} W", String.format(Locale.US, "W′ %.1f kJ · Morton fit of your 2–60 min bests", f.wPrime / 1000))) }
            addView(Ui.text(a, if (running) "Reading rides… $progress" else "From ${c.count} of ${rides.size} power-meter rides." + if (todo.isNotEmpty()) " ${todo.size} not read yet." else "", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
            if (todo.isNotEmpty() && !running) addView(a.button(if (c.count == 0) "Compute power curve" else "Read ${todo.size} new rides") {
                running = true; a.show("power")
                Thread {
                    var i = 0
                    for (x in todo) {
                        progress = "${++i} / ${todo.size}"
                        val r = runCatching { Api.get(a, "activities/${x.optLong("id")}?streams=time,watts") }.getOrNull() ?: break   // stop on Strava's limit
                        val st = r.optJSONObject("streams")
                        fun arr(k: String) = st?.optJSONObject(k)?.optJSONArray("data")?.let { d -> DoubleArray(d.length()) { d.optDouble(it, Double.NaN) } }
                        val b = arr("watts")?.let { bests(it, arr("time")) }.orEmpty()
                        File(dir(a), "${x.optLong("id")}.json").writeText(JSONObject(b.mapKeys { it.key.toString() }).toString())
                        if (i % 5 == 0) a.ui.post { a.show("power") }
                    }
                    running = false
                    a.ui.post { a.show("power") }
                }.start()
            })
        })
    }

    /** W′ balance chart for a ride page with a watts stream. */
    fun wBalView(ctx: android.app.Activity, col: LinearLayout, watts: JSONArray, time: JSONArray?, ftp: Double) {
        val m = cpModel(ctx, ftp) ?: return
        val w = DoubleArray(watts.length()) { watts.optDouble(it, Double.NaN) }
        if (w.isEmpty()) return
        val bal = wBal(grid(w, times(w, time?.let { t -> DoubleArray(t.length()) { t.optDouble(it) } })), m.cp, m.wPrime)   // per second, not per sample
        val step = maxOf(1, bal.size / 400)
        col.addView(Ui.heading(ctx, String.format(Locale.US, "W′ balance · CP %d W, W′ %.1f kJ", Math.round(m.cp), m.wPrime / 1000)))
        col.addView(Ui.card(ctx).apply {
            addView(LineChart(ctx).apply { set(DoubleArray((bal.size + step - 1) / step) { bal[it * step] / 1000 }, Ui.PURPLE, " kJ") }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Ui.dp(ctx, 120)))
            val low = bal.minOrNull() ?: m.wPrime
            addView(Ui.text(ctx, String.format(Locale.US, "Lowest %.1f kJ (%d%% of your reserve used). Above CP the reserve drains; below it, it refills.", low / 1000, Math.round((1 - low / m.wPrime) * 100)), 11f, Ui.MUTED))
        })
    }
}
