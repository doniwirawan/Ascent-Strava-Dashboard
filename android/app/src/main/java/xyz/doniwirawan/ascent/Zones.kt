package xyz.doniwirawan.ascent

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Training zones, the same bands as the website: power = Coggan's 7 zones as a
 * share of FTP (js/fitness.js POWER_ZONES), heart rate = Friel's 5 zones as a
 * share of threshold HR ≈ 89% of your highest recorded HR (js/training.js).
 * Also time-in-zone and per-km splits from a ride's streams.
 */
object Zones {
    class Zone(val name: String, val hi: Double, val color: Int)

    val POWER = listOf(
        Zone("Z1 Recovery", 0.55, 0xFF94A3B8.toInt()), Zone("Z2 Endurance", 0.75, 0xFF3B82F6.toInt()),
        Zone("Z3 Tempo", 0.90, 0xFF22C55E.toInt()), Zone("Z4 Threshold", 1.05, 0xFFEAB308.toInt()),
        Zone("Z5 VO₂max", 1.20, 0xFFF97316.toInt()), Zone("Z6 Anaerobic", 1.50, 0xFFEF4444.toInt()),
        Zone("Z7 Neuromuscular", Double.POSITIVE_INFINITY, 0xFFA855F7.toInt()),
    )
    val HEART = listOf(
        Zone("Z1 Recovery", 0.80, 0xFF94A3B8.toInt()), Zone("Z2 Endurance", 0.89, 0xFF3B82F6.toInt()),
        Zone("Z3 Tempo", 0.93, 0xFF22C55E.toInt()), Zone("Z4 Threshold", 0.99, 0xFFEAB308.toInt()),
        Zone("Z5 VO₂max", Double.POSITIVE_INFINITY, 0xFFEF4444.toInt()),
    )

    /** FTP: Strava's, else 0.95 × the best NP of a power-meter ride of 20 min or more. 0 if neither. */
    fun ftp(ctx: Context): Double {
        Api.cached(ctx, "me")?.optDouble("ftp", 0.0)?.takeIf { it > 0 }?.let { return it }
        val acts = Api.cached(ctx, "activities?limit=300")?.optJSONArray("activities") ?: return 0.0
        var best = 0.0
        for (i in 0 until acts.length()) {
            val a = acts.getJSONObject(i)
            if (a.optBoolean("device_watts") && a.optLong("moving_time") >= 1200) best = maxOf(best, a.optDouble("weighted_average_watts", a.optDouble("average_watts", 0.0)))
        }
        return Math.round(best * 0.95).toDouble()
    }

    /** Threshold HR ≈ 89% of the highest HR in your activities. 0 if none. */
    fun lthr(ctx: Context): Double {
        val acts = Api.cached(ctx, "activities?limit=300")?.optJSONArray("activities") ?: return 0.0
        var max = 0.0
        for (i in 0 until acts.length()) max = maxOf(max, acts.getJSONObject(i).optDouble("max_heartrate", 0.0))
        return Math.round(max * 0.89).toDouble()
    }

    /** Range text for zone i of `zones` against `base`, e.g. "152–165". */
    fun range(zones: List<Zone>, i: Int, base: Double): String {
        val lo = if (i == 0) 0 else Math.round(zones[i - 1].hi * base) + 1
        return if (zones[i].hi.isInfinite()) "$lo+" else if (i == 0) "< ${Math.round(zones[0].hi * base)}" else "$lo–${Math.round(zones[i].hi * base)}"
    }

    /** Seconds spent in each zone, from a value stream and its time stream. */
    fun timeIn(zones: List<Zone>, base: Double, values: JSONArray, time: JSONArray?): DoubleArray {
        val out = DoubleArray(zones.size)
        for (i in 0 until values.length()) {
            if (values.isNull(i)) continue
            val dt = if (time != null && i > 0) (time.optDouble(i) - time.optDouble(i - 1)).coerceIn(0.0, 10.0) else 1.0
            val f = values.optDouble(i) / base
            out[zones.indexOfFirst { f < it.hi }.takeIf { it >= 0 } ?: zones.size - 1] += dt
        }
        return out
    }

    /** A zone breakdown: coloured bar, name, range, time and share per zone. */
    fun view(ctx: Context, zones: List<Zone>, base: Double, unit: String, secs: DoubleArray): LinearLayout {
        val c = Ui.card(ctx)
        val total = secs.sum().takeIf { it > 0 } ?: 1.0
        val peak = (secs.maxOrNull() ?: 1.0).coerceAtLeast(1.0)
        zones.forEachIndexed { i, z ->
            val row = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL; setPadding(0, Ui.dp(ctx, 5), 0, Ui.dp(ctx, 5)) }
            val top = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            top.addView(Ui.text(ctx, z.name, 12f, Ui.TEXT, true))
            top.addView(Ui.text(ctx, "  " + range(zones, i, base) + " " + unit, 11f, Ui.MUTED), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
            top.addView(Ui.text(ctx, Ui.hm(secs[i].toLong()) + String.format(Locale.US, "  %d%%", Math.round(secs[i] / total * 100)), 12f, Ui.TEXT, true))
            row.addView(top)
            val bar = LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                background = GradientDrawable().apply { setColor(Ui.LINE); cornerRadius = Ui.dp(ctx, 3).toFloat() }
            }
            val frac = (secs[i] / peak).toFloat()
            bar.addView(View(ctx).apply { background = GradientDrawable().apply { setColor(z.color); cornerRadius = Ui.dp(ctx, 3).toFloat() } },
                LinearLayout.LayoutParams(0, Ui.dp(ctx, 6), frac.coerceAtLeast(0.001f)))
            bar.addView(View(ctx), LinearLayout.LayoutParams(0, Ui.dp(ctx, 6), (1 - frac).coerceAtLeast(0.001f)))
            row.addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, Ui.dp(ctx, 6)).apply { topMargin = Ui.dp(ctx, 4) })
            c.addView(row)
        }
        return c
    }

    /** Per-km rows: time, speed, climbing, average HR and power. */
    fun splits(ctx: Context, st: JSONObject): LinearLayout? {
        val dist = st.optJSONObject("distance")?.optJSONArray("data") ?: return null
        val time = st.optJSONObject("time")?.optJSONArray("data") ?: return null
        val alt = st.optJSONObject("altitude")?.optJSONArray("data")
        val hr = st.optJSONObject("heartrate")?.optJSONArray("data")
        val w = st.optJSONObject("watts")?.optJSONArray("data")
        val c = Ui.card(ctx)
        var start = 0; var km = 1; var climb = 0.0
        var fastest = Double.MAX_VALUE
        val rows = ArrayList<Array<String>>()
        for (i in 1 until dist.length()) {
            if (alt != null) climb += (alt.optDouble(i) - alt.optDouble(i - 1)).coerceAtLeast(0.0)
            val last = i == dist.length() - 1
            if (dist.optDouble(i) >= km * 1000 || last) {
                val secs = time.optDouble(i) - time.optDouble(start)
                val meters = dist.optDouble(i) - dist.optDouble(start)
                if (meters < 200 && last) break
                fun avg(a: JSONArray?) = if (a == null) Double.NaN else (start..i).map { a.optDouble(it, Double.NaN) }.filter { !it.isNaN() }.average()
                val kmh = meters / secs * 3.6
                if (!last) fastest = minOf(fastest, secs)
                val extra = listOfNotNull(
                    avg(hr).takeIf { !it.isNaN() }?.let { "HR ${Math.round(it)}" },
                    avg(w).takeIf { !it.isNaN() }?.let { "${Math.round(it)} W" },
                    "+${Math.round(climb)} m",
                ).joinToString(" · ")
                rows += arrayOf(if (last && meters < 1000) String.format(Locale.US, "Last %.1f km", meters / 1000) else "Km $km",
                    String.format(Locale.US, "%d:%02d · %.1f km/h", (secs / 60).toInt(), (secs % 60).toInt(), kmh), extra, secs.toString())
                start = i; km++; climb = 0.0
            }
        }
        if (rows.isEmpty()) return null
        rows.forEachIndexed { i, r ->
            if (i > 0) c.addView(Ui.divider(ctx))
            c.addView(Ui.row(ctx, r[0], r[1], r[2]).apply {
                if (r[3].toDouble() == fastest) (getChildAt(1) as android.widget.TextView).setTextColor(Ui.ORANGE)   // fastest full km
            })
        }
        return c
    }
}
