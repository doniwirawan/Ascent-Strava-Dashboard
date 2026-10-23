package xyz.doniwirawan.ascent

import android.content.Context
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale

/**
 * Climbing power: FTP without a power meter (js/climb-ftp.js). Uphill, power
 * is mostly lifting weight, which the altitude stream measures; each steady
 * 8-minute climb becomes a (heart rate, watts) point and a Theil–Sen line
 * through them is read at threshold HR (FTP) and at max HR.
 */
object ClimbPower {
    private const val WIN = 480; private const val MIN_GRADE = 0.03; private const val MAX_RIDES = 40; private const val MIN_GAIN = 250.0; private const val MIN_POINTS = 8
    private const val LTHR = 0.89; private const val KIT = 1.5; private const val BIKE = 10.0
    private const val CRR = 0.005; private const val CDA = 0.40; private const val RHO = 1.15; private const val ETA = 0.97; private const val G = 9.81

    /** Power (W) to hold speed v (m/s) while rising at vz (m/s) with total mass m. */
    internal fun power(m: Double, v: Double, vz: Double) = (m * G * vz + CRR * m * G * v + 0.5 * RHO * CDA * v * v * v) / ETA

    class Point(val v: Double, val vz: Double, val hr: Double, val grade: Double) { fun w(m: Double) = power(m, v, vz) }

    /** Non-overlapping steady 8-min windows: ≥3%, moving ≥95%, HR ≥90% of samples, no altimeter jumps, website cpPointsFromStreams. */
    internal fun points(t: DoubleArray, h: DoubleArray, d: DoubleArray, moving: BooleanArray?, hr: DoubleArray): List<Point> {
        val n = t.size
        if (n < 10 || h.size != n || d.size != n || hr.size != n) return emptyList()
        val mov = IntArray(n + 1); val bad = IntArray(n + 1); val hs = DoubleArray(n + 1); val hn = IntArray(n + 1)
        for (i in 0 until n) {
            mov[i + 1] = mov[i] + if (moving == null || moving[i]) 1 else 0
            val dt = if (i > 0) maxOf(1.0, t[i] - t[i - 1]) else 1.0
            bad[i + 1] = bad[i] + if (i > 0 && Math.abs(h[i] - h[i - 1]) / dt > 3) 1 else 0
            val x = if (hr[i] > 40) hr[i] else 0.0
            hs[i + 1] = hs[i] + x; hn[i + 1] = hn[i] + if (x > 0) 1 else 0
        }
        val out = ArrayList<Point>()
        var i = 0; var j = 0
        while (i < n) {
            if (j < i) j = i
            while (j < n - 1 && t[j] - t[i] < WIN) j++
            val dt = t[j] - t[i]; val k = j - i + 1
            val dz = h[j] - h[i]; val dd = d[j] - d[i]
            val ok = dt >= WIN && dt <= WIN * 1.1 && (mov[j + 1] - mov[i]).toDouble() / k >= 0.95 && bad[j + 1] - bad[i] == 0 &&
                (hn[j + 1] - hn[i]).toDouble() / k >= 0.9 && dd > 0 && dz / dd >= MIN_GRADE
            val v = dd / dt; val vz = dz / dt
            if (ok && v in 1.2..12.0 && vz * 3600 <= 1600) { out += Point(v, vz, (hs[j + 1] - hs[i]) / (hn[j + 1] - hn[i]), dz / dd * 100); i = j }
            i++
        }
        return out
    }

    class Fit(val a: Double, val b: Double, val n: Int, val hrLo: Double, val hrHi: Double) { fun at(hr: Double) = a + b * hr }

    /** Theil–Sen line watts = a + b·hr (median of pairwise slopes), website cpFit. */
    internal fun fit(pts: List<Pair<Double, Double>>): Fit? {   // (hr, watts)
        if (pts.size < MIN_POINTS) return null
        val sl = ArrayList<Double>()
        for (i in pts.indices) for (k in i + 1 until pts.size) if (Math.abs(pts[k].first - pts[i].first) >= 3) sl += (pts[k].second - pts[i].second) / (pts[k].first - pts[i].first)
        if (sl.size < 10) return null
        fun med(l: List<Double>) = l.sorted()[l.size / 2]
        val b = med(sl)
        if (b <= 0) return null
        return Fit(med(pts.map { it.second - b * it.first }), b, pts.size, pts.minOf { it.first }, pts.maxOf { it.first })
    }

    private fun dir(ctx: Context) = File(ctx.filesDir, "climbp").apply { mkdirs() }
    private fun saved(ctx: Context, id: Long) = File(dir(ctx), "$id.json").takeIf { it.exists() }?.let { f ->
        runCatching { JSONArray(f.readText()).let { a -> (0 until a.length()).map { a.getJSONObject(it).let { o -> Point(o.getDouble("v"), o.getDouble("vz"), o.getDouble("hr"), o.getDouble("g")) } } } }.getOrNull()
    }

    private fun pool(acts: List<JSONObject>) = acts.filter { Screens.isRide(it) && it.optBoolean("has_heartrate") && !it.optBoolean("trainer") && it.optString("sport_type") != "VirtualRide" && it.optDouble("total_elevation_gain") >= MIN_GAIN }
        .sortedByDescending { it.optDouble("total_elevation_gain") }.take(MAX_RIDES)

    private var running = false
    private var progress = ""

    fun card(a: AppActivity, col: LinearLayout, acts: List<JSONObject>, kg: Double) {
        val p = pool(acts)
        if (p.isEmpty() || kg <= 0) return
        val mass = kg + BIKE + KIT
        val scanned = p.mapNotNull { x -> saved(a, x.optLong("id"))?.let { x to it } }
        val pts = scanned.flatMap { (x, l) -> l.map { Triple(x, it, it.w(mass)) } }
        val f = fit(pts.map { it.second.hr to it.third })
        val hrMax = acts.maxOfOrNull { it.optDouble("max_heartrate", 0.0) } ?: 0.0
        val todo = p.filter { saved(a, it.optLong("id")) == null }
        col.addView(Ui.heading(a, "Climbing power · FTP without a power meter"))
        col.addView(Ui.card(a).apply {
            if (f != null && hrMax > 0) {
                addView(Ui.row(a, "FTP", "${Math.round(f.at(hrMax * LTHR))} W", "at threshold HR ≈ ${Math.round(hrMax * LTHR)} bpm (89% of your ${Math.round(hrMax)} max)"))
                addView(Ui.row(a, "At max HR", "${Math.round(f.at(hrMax))} W", "≈ power at VO₂max"))
                addView(Ui.row(a, "Line", String.format(Locale.US, "+%.1f W", f.b), "per extra bpm, from ${f.n} climbs (${Math.round(f.hrLo)}–${Math.round(f.hrHi)} bpm)"))
            } else if (scanned.isNotEmpty()) addView(Ui.text(a, "Only ${pts.size} steady climbs with heart rate so far — need $MIN_POINTS for a reliable line.", 12f, Ui.MUTED))
            else addView(Ui.text(a, "Your climbs give a real power number: going uphill, power is mostly lifting your weight, which the altitude data measures. Paired with heart rate, even easy climbs reveal your threshold.", 12f, Ui.MUTED))
            pts.maxByOrNull { it.third }?.let { (x, pt, w) -> addView(Ui.row(a, "Hardest climb", "${Math.round(w)} W", x.optString("name") + String.format(Locale.US, " · 8 min · %.1f%% · VAM %d m/h · %d bpm", pt.grade, Math.round(pt.vz * 3600), Math.round(pt.hr))).apply { setOnClickListener { a.openRide(x) } }) }
            addView(Ui.text(a, if (running) "Scanning climbs… $progress" else String.format(Locale.US, "Watts from the altitude of your %d hilliest rides at %.1f kg total (you + a %d kg bike + kit) — not Strava's estimated watts.", scanned.size, mass, BIKE.toInt()), 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
            if (todo.isNotEmpty() && !running) addView(a.button(if (scanned.isEmpty()) "Scan my climbs" else "Scan ${todo.size} more rides") {
                running = true; a.show("power")
                Thread {
                    var i = 0
                    for (x in todo) {
                        progress = "${++i} / ${todo.size}"
                        val r = runCatching { Api.get(a, "activities/${x.optLong("id")}?streams=time,altitude,distance,moving,heartrate") }.getOrNull() ?: break
                        val st = r.optJSONObject("streams")
                        fun arr(k: String) = st?.optJSONObject(k)?.optJSONArray("data")?.let { d -> DoubleArray(d.length()) { d.optDouble(it, Double.NaN) } }
                        val mv = st?.optJSONObject("moving")?.optJSONArray("data")?.let { d -> BooleanArray(d.length()) { d.optBoolean(it) } }
                        val list = arr("time")?.let { t -> arr("altitude")?.let { h -> arr("distance")?.let { d -> arr("heartrate")?.let { hr -> points(t, h, d, mv, hr) } } } }.orEmpty()
                        File(dir(a), "${x.optLong("id")}.json").writeText(JSONArray(list.map { JSONObject().put("v", it.v).put("vz", it.vz).put("hr", it.hr).put("g", it.grade) }).toString())
                        if (i % 5 == 0) a.ui.post { a.show("power") }
                    }
                    running = false
                    a.ui.post { a.show("power") }
                }.start()
            })
        })
    }
}
