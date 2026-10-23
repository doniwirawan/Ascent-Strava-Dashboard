package xyz.doniwirawan.ascent

import android.content.Context
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.util.Locale

/**
 * The website's per-ride stream analyses for the ride page: heart-rate
 * decoupling (js/hr-decoupling.js), time lost (js/time-lost.js) and wind
 * (js/wind-analysis.js, with Open-Meteo's historical wind at the start hour).
 */
object RideAnalysis {
    private fun arr(st: JSONObject, k: String): DoubleArray? = st.optJSONObject(k)?.optJSONArray("data")?.let { d -> DoubleArray(d.length()) { d.optDouble(it, Double.NaN) } }

    class Decoupling(val usePower: Boolean, val hr1: Double, val hr2: Double, val o1: Double, val o2: Double) { val pct get() = (o1 / hr1 - o2 / hr2) / (o1 / hr1) * 100 }

    /** Output (power, else speed) per heartbeat in the first half against the second, website _hrdCompute. */
    internal fun decoupling(hr: DoubleArray, out: DoubleArray, usePower: Boolean): Decoupling? {
        val n = minOf(hr.size, out.size)
        if (n < 8) return null
        fun avg(a: DoubleArray, s: Int, e: Int) = (s until e).map { a[it] }.filter { !it.isNaN() }.let { if (it.isEmpty()) 0.0 else it.average() }
        val mid = n / 2
        val d = Decoupling(usePower, avg(hr, 0, mid), avg(hr, mid, n), avg(out, 0, mid), avg(out, mid, n))
        return if (d.hr1 > 0 && d.hr2 > 0 && d.o1 > 0 && d.o2 > 0) d else null
    }

    internal fun band(dc: Double): Pair<Int, String> = when {
        dc < 0 -> 0xFF4DA8FF.toInt() to "Negative drift — you held or raised output as HR settled (negative split or long warm-up). Strong aerobic control."
        dc <= 5 -> Ui.GREEN to "Well-coupled (<5%). Strong aerobic endurance for this effort — HR stayed steady against your output."
        dc <= 10 -> 0xFFFB923C.toInt() to "Moderate drift (5–10%). Normal for a hard or long ride; watch fuelling and pacing on the back half."
        else -> Ui.RED to "High decoupling (>10%). Aerobic endurance, pacing, heat or fuelling limited the second half — a target to build."
    }

    class TimeLost(val climb: Double, val desc: Double, val flat: Double, val coast: Double, val stopped: Double, val movingAvg: Double, val overallAvg: Double)

    /** Moving time split by grade and pedalling, website _tlCompute. */
    internal fun timeLost(a: JSONObject, spd: DoubleArray, alt: DoubleArray?, dist: DoubleArray?, cad: DoubleArray?): TimeLost? {
        var climb = 0; var desc = 0; var flat = 0; var coast = 0; var move = 0
        for (i in 1 until spd.size) {
            val v = spd[i]
            if (v.isNaN() || v < 0.8) continue
            move++
            var grade = 0.0
            if (alt != null && dist != null && i < dist.size && i < alt.size) { val dx = dist[i] - dist[i - 1]; if (dx > 0.5) grade = (alt[i] - alt[i - 1]) / dx }
            when { grade > 0.02 -> climb++; grade < -0.02 -> desc++; cad != null && i < cad.size && cad[i] > 5 -> flat++; else -> coast++ }
        }
        if (move < 8) return null
        val mt = a.optDouble("moving_time", 0.0); val et = a.optDouble("elapsed_time", mt).takeIf { it > 0 } ?: mt
        fun f(c: Int) = c.toDouble() / move * mt
        return TimeLost(f(climb), f(desc), f(flat), f(coast), maxOf(0.0, et - mt), a.optDouble("average_speed", a.optDouble("distance") / maxOf(1.0, mt)), a.optDouble("distance") / maxOf(1.0, et))
    }

    class Wind(val headPct: Int, val tailPct: Int, val crossPct: Int, val netKmh: Double, val kmh: Double, val fromDeg: Double)

    private fun bearing(a: DoubleArray, b: DoubleArray): Double {
        val r = Math.PI / 180; val dLng = (b[1] - a[1]) * r
        val y = Math.sin(dLng) * Math.cos(b[0] * r); val x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos(dLng)
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360
    }

    /** Route bearings against the wind: head (within 45°), tail, cross, and the net along-travel part, website _windAnalyze. */
    internal fun wind(pts: List<DoubleArray>, kmh: Double, fromDeg: Double): Wind? {
        if (pts.size < 4) return null
        val ms = kmh / 3.6; val blowTo = (fromDeg + 180) % 360
        var head = 0.0; var tail = 0.0; var cross = 0.0; var total = 0.0; var comp = 0.0
        for (i in 1 until pts.size) {
            val a = pts[i - 1]; val b = pts[i]
            val d = Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(Math.toRadians(a[0])))
            if (d < 1e-9) continue
            val hd = bearing(a, b)
            var rel = Math.abs(hd - fromDeg) % 360; if (rel > 180) rel = 360 - rel
            when { rel < 45 -> head += d; rel > 135 -> tail += d; else -> cross += d }
            comp += ms * Math.cos(Math.toRadians(hd - blowTo)) * d; total += d
        }
        if (total <= 0) return null
        return Wind(Math.round(head / total * 100).toInt(), Math.round(tail / total * 100).toInt(), Math.round(cross / total * 100).toInt(), comp / total * 3.6, kmh, fromDeg)
    }

    /** Wind speed (km/h) and direction at the ride's start hour and place, from Open-Meteo; kept on the phone. */
    private fun weather(ctx: Context, a: JSONObject): Pair<Double, Double>? {
        val ll = a.optJSONArray("start_latlng")?.takeIf { it.length() == 2 } ?: return null
        val when_ = a.optString("start_date_local"); val date = when_.take(10); val hour = when_.drop(11).take(2).toIntOrNull() ?: 0
        val f = File(File(ctx.filesDir, "wind").apply { mkdirs() }, "${a.optLong("id")}.json")
        val j = if (f.exists()) JSONObject(f.readText()) else {
            val old = System.currentTimeMillis() - (Screens.parse(a.optString("start_date")).takeIf { it > 0 } ?: 0L) > 5 * 86_400_000L
            val url = (if (old) "https://archive-api.open-meteo.com/v1/archive" else "https://api.open-meteo.com/v1/forecast") +
                "?latitude=${ll.getDouble(0)}&longitude=${ll.getDouble(1)}&start_date=$date&end_date=$date&hourly=wind_speed_10m,wind_direction_10m&timezone=auto"
            JSONObject(URL(url).readText()).also { f.writeText(it.toString()) }
        }
        val h = j.optJSONObject("hourly") ?: return null
        val s = h.optJSONArray("wind_speed_10m") ?: return null; val d = h.optJSONArray("wind_direction_10m") ?: return null
        val i = minOf(hour, s.length() - 1)
        return s.optDouble(i).takeIf { !it.isNaN() }?.let { it to d.optDouble(i) }
    }

    private val DIRS = listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")

    /** Adds the three cards for a ride with [st] streams; wind fills in after its weather lookup. */
    fun draw(ctx: android.app.Activity, ui: android.os.Handler, io: java.util.concurrent.Executor, col: LinearLayout, a: JSONObject, st: JSONObject) {
        val hr = arr(st, "heartrate"); val watts = if (a.optBoolean("device_watts")) arr(st, "watts") else null; val spd = arr(st, "velocity_smooth")
        if (hr != null && a.optDouble("moving_time") >= 2400) (watts ?: spd)?.let { decoupling(hr, it, watts != null) }?.let { d ->
            val (c, t) = band(d.pct)
            col.addView(Ui.heading(ctx, "Heart-rate decoupling"))
            col.addView(Ui.card(ctx).apply {
                addView(Ui.text(ctx, String.format(Locale.US, "%.1f%%", d.pct), 28f, c, true))
                addView(Ui.text(ctx, t, 12f, Ui.TEXT))
                val u = if (d.usePower) " W" else " km/h"; val k = if (d.usePower) 1.0 else 3.6
                addView(Ui.row(ctx, "First half", String.format(Locale.US, "%.0f%s · %.0f bpm", d.o1 * k, u, d.hr1)))
                addView(Ui.row(ctx, "Second half", String.format(Locale.US, "%.0f%s · %.0f bpm", d.o2 * k, u, d.hr2)))
                addView(Ui.text(ctx, "Efficiency (output ÷ heart rate) in the first half against the second. If heart rate climbs while output holds, the second half has decoupled: aerobic fatigue, under-fuelling, heat or starting too hard. Lower is better.", 11f, Ui.MUTED))
            })
        }
        if (spd != null && a.optDouble("moving_time") >= 1200) timeLost(a, spd, arr(st, "altitude"), arr(st, "distance"), arr(st, "cadence"))?.let { t ->
            val rows = listOf(Triple("Climbing", t.climb, Ui.RED), Triple("Descending", t.desc, 0xFF4DA8FF.toInt()), Triple("Flat pedalling", t.flat, Ui.GREEN), Triple("Coasting", t.coast, 0xFFEAB308.toInt()), Triple("Stopped", t.stopped, Ui.MUTED))
            val total = rows.sumOf { it.second }.takeIf { it > 0 } ?: 1.0
            col.addView(Ui.heading(ctx, "Where the time went"))
            col.addView(Ui.card(ctx).apply {
                addView(Ui.row(ctx, "Moving average", Ui.kmh(t.movingAvg), Ui.kmh(t.overallAvg) + " overall · " + Math.round(t.stopped / maxOf(1.0, t.stopped + a.optDouble("moving_time")) * 100) + "% of the clock stopped"))
                rows.forEach { (l, v, c) -> addView(Ui.row(ctx, l, Ui.hm(v.toLong()) + " · ${Math.round(v / total * 100)}%").apply { ((getChildAt(0) as LinearLayout).getChildAt(0) as android.widget.TextView).setTextColor(c) }) }
                addView(Ui.text(ctx, "Most of the moving time went to " + rows.dropLast(1).maxByOrNull { it.second }!!.first.lowercase(Locale.ROOT) + ". Grade from altitude, pedalling from cadence.", 11f, Ui.MUTED))
            })
        }
        val ll = st.optJSONObject("latlng")?.optJSONArray("data")
        if (ll != null && ll.length() >= 4 && a.optDouble("moving_time") >= 1200) {
            val box = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
            col.addView(box)
            io.execute {
                val w = runCatching { weather(ctx, a) }.getOrNull() ?: return@execute
                val step = maxOf(1, ll.length() / 150)
                val pts = (0 until ll.length() step step).map { ll.getJSONArray(it).let { p -> doubleArrayOf(p.getDouble(0), p.getDouble(1)) } }
                val r = wind(pts, w.first, w.second) ?: return@execute
                ui.post {
                    box.addView(Ui.heading(ctx, "Wind"))
                    box.addView(Ui.card(ctx).apply {
                        addView(Ui.text(ctx, String.format(Locale.US, "Wind was %.0f km/h from the %s (%.0f°).", r.kmh, DIRS[Math.round(r.fromDeg / 45).toInt() % 8], r.fromDeg), 12f, Ui.MUTED))
                        listOf(Triple("Headwind", r.headPct, Ui.RED), Triple("Tailwind", r.tailPct, Ui.GREEN), Triple("Crosswind", r.crossPct, 0xFFEAB308.toInt())).forEach { (l, p, c) ->
                            addView(Ui.row(ctx, l, "$p% · " + Ui.km(a.optDouble("distance") * p / 100)).apply { ((getChildAt(0) as LinearLayout).getChildAt(0) as android.widget.TextView).setTextColor(c) })
                        }
                        addView(Ui.text(ctx, "Net wind along your direction: " + when {
                            r.netKmh >= 0.3 -> String.format(Locale.US, "≈ +%.1f km/h net tailwind — the wind helped your speed.", r.netKmh)
                            r.netKmh <= -0.3 -> String.format(Locale.US, "≈ %.1f km/h net headwind — you were stronger than the raw speed suggests.", r.netKmh)
                            else -> "roughly neutral — the wind mostly crossed your route."
                        } + " Wind from Open-Meteo at the ride's start hour.", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(ctx, 6), 0, 0) })
                    })
                }
            }
        }
    }
}
