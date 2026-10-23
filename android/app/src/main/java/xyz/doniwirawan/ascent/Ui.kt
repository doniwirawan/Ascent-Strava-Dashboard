package xyz.doniwirawan.ascent

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import android.widget.TextView
import java.text.NumberFormat
import java.util.Locale

/**
 * The view builders, formatters and the three small charts the native screens
 * share. Everything is drawn in code so the app still needs no UI library.
 */
object Ui {
    val BG = Color.parseColor("#0C0C0C")
    val CARD = Color.parseColor("#16161C")
    val LINE = Color.parseColor("#24242C")
    val TEXT = Color.WHITE
    val MUTED = Color.parseColor("#8A8A96")
    val ORANGE = Color.parseColor("#FC4C02")
    val GREEN = Color.parseColor("#22C55E")
    val PURPLE = Color.parseColor("#A855F7")
    val BLUE = Color.parseColor("#3B82F6")
    val RED = Color.parseColor("#EF4444")

    fun dp(ctx: Context, v: Number) = (v.toFloat() * ctx.resources.displayMetrics.density).toInt()

    fun text(ctx: Context, s: CharSequence, sp: Float = 13f, color: Int = TEXT, bold: Boolean = false) = TextView(ctx).apply {
        text = s
        setTextColor(color)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    fun heading(ctx: Context, s: String) = text(ctx, s.uppercase(Locale.US), 11f, MUTED, true).apply {
        letterSpacing = 0.12f
        setPadding(0, dp(ctx, 18), 0, dp(ctx, 8))
    }

    fun card(ctx: Context): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        val p = dp(ctx, 14)
        setPadding(p, p, p, p)
        background = GradientDrawable().apply {
            setColor(CARD); cornerRadius = dp(ctx, 12).toFloat(); setStroke(dp(ctx, 1), LINE)
        }
        layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { bottomMargin = dp(ctx, 10) }
    }

    /** A grid of big numbers with small captions, `cols` per row. A caption may end
     *  in "|icon" (a TabIcon kind) to draw that icon above its number. */
    fun tiles(ctx: Context, items: List<Pair<String, String>>, cols: Int = 2): LinearLayout {
        val box = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        items.chunked(cols).forEach { row ->
            val line = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
            row.forEach { (value, labelIcon) ->
                val label = labelIcon.substringBefore('|')
                val icon = labelIcon.substringAfter('|', "")
                val c = card(ctx).apply {
                    // every tile the same height: icon or not, one- or two-line caption
                    gravity = Gravity.CENTER
                    minimumHeight = dp(ctx, 100)
                    if (icon.isNotEmpty()) addView(TabIcon(ctx, icon).apply { color = ORANGE },
                        LinearLayout.LayoutParams(dp(ctx, 20), dp(ctx, 20)).apply { bottomMargin = dp(ctx, 4) })
                    addView(text(ctx, value, 20f, TEXT, true).apply { gravity = Gravity.CENTER })
                    addView(text(ctx, label.uppercase(Locale.US), 10f, MUTED, true).apply { gravity = Gravity.CENTER; letterSpacing = 0.08f })
                }
                line.addView(c, LinearLayout.LayoutParams(0, MATCH_PARENT, 1f).apply {
                    marginEnd = dp(ctx, 5); marginStart = dp(ctx, 5); bottomMargin = dp(ctx, 10)
                })
            }
            repeat(cols - row.size) { line.addView(View(ctx), LinearLayout.LayoutParams(0, 1, 1f)) }
            box.addView(line, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { marginStart = -dp(ctx, 5); marginEnd = -dp(ctx, 5) })
        }
        return box
    }

    /** Label on the left, value on the right, hairline under it. */
    fun row(ctx: Context, label: CharSequence, value: CharSequence, sub: CharSequence? = null): LinearLayout =
        LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(ctx, 9), 0, dp(ctx, 9))
            val left = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
            left.addView(text(ctx, label, 13f))
            if (sub != null) left.addView(text(ctx, sub, 11f, MUTED))
            addView(left, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
            addView(text(ctx, value, 13f, TEXT, true).apply { gravity = Gravity.END; setPadding(dp(ctx, 10), 0, 0, 0) })
        }

    fun divider(ctx: Context) = View(ctx).apply {
        setBackgroundColor(LINE)
        layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, dp(ctx, 1))
    }

    // ── Formatting ──────────────────────────────────────────────────────────
    fun km(m: Double) = String.format(Locale.US, "%.1f km", m / 1000)
    fun hm(sec: Long) = if (sec >= 3600) "${sec / 3600}h ${(sec % 3600) / 60}m" else "${sec / 60}m"
    fun kmh(ms: Double) = String.format(Locale.US, "%.1f km/h", ms * 3.6)
    fun rp(v: Double): String = "Rp " + NumberFormat.getIntegerInstance(Locale("id", "ID")).format(Math.round(v))
    fun n0(v: Double) = Math.round(v).toString()

    /** "2026-10-22T05:54:00Z" → "22 Oct 2026" (Strava's local time carries a fake Z). */
    fun date(iso: String): String {
        if (iso.length < 10) return iso
        val m = arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
        return "${iso.substring(8, 10).trimStart('0')} ${m[iso.substring(5, 7).toInt() - 1]} ${iso.substring(0, 4)}"
    }

    /** Google's encoded polyline → [lat, lng] pairs. */
    fun decodePolyline(enc: String): List<DoubleArray> {
        val out = ArrayList<DoubleArray>()
        var i = 0; var lat = 0; var lng = 0
        while (i < enc.length) {
            for (k in 0..1) {
                var shift = 0; var result = 0; var b: Int
                do { b = enc[i++].code - 63; result = result or ((b and 0x1f) shl shift); shift += 5 } while (b >= 0x20 && i < enc.length)
                val d = if (result and 1 != 0) (result shr 1).inv() else result shr 1
                if (k == 0) lat += d else lng += d
            }
            out.add(doubleArrayOf(lat / 1e5, lng / 1e5))
        }
        return out
    }
}

/** Vertical bars with a label under each (every few when there are many). */
class BarChart(ctx: Context) : View(ctx) {
    var values = DoubleArray(0)
    var labels: List<String> = emptyList()
    var color = Ui.ORANGE
    var highlight = -1
    var format: (Double) -> String = { Ui.n0(it) }
    /** A second series drawn faintly behind the bars (e.g. last year), or null. */
    var behind: DoubleArray? = null
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)

    fun set(values: DoubleArray, labels: List<String>) { this.values = values; this.labels = labels; invalidate() }

    override fun onDraw(c: Canvas) {
        if (values.isEmpty()) return
        val d = resources.displayMetrics.density
        val bottom = height - 16 * d
        val top = 14 * d
        val max = maxOf(values.maxOrNull() ?: 0.0, behind?.maxOrNull() ?: 0.0).takeIf { it > 0 } ?: 1.0
        val slot = width.toFloat() / values.size
        val bw = slot * 0.62f
        val every = Math.max(1, Math.ceil(values.size / 8.0).toInt())
        p.textAlign = Paint.Align.CENTER
        behind?.forEachIndexed { i, v ->
            val x = slot * i + (slot - bw) / 2 - slot * 0.1f
            val h = ((v / max) * (bottom - top)).toFloat()
            p.color = Ui.LINE
            if (i < values.size) c.drawRoundRect(x, bottom - h, x + bw + slot * 0.2f, bottom, 3 * d, 3 * d, p)
        }
        values.forEachIndexed { i, v ->
            val x = slot * i + (slot - bw) / 2
            val h = ((v / max) * (bottom - top)).toFloat()
            p.color = if (i == highlight) Ui.PURPLE else color
            c.drawRoundRect(x, bottom - h, x + bw, bottom, 3 * d, 3 * d, p)
            if (values.size <= 12 && v > 0) {
                p.color = Ui.MUTED; p.textSize = 9 * d
                c.drawText(format(v), x + bw / 2, bottom - h - 3 * d, p)
            }
            if (i % every == 0 && i < labels.size) {
                p.color = Ui.MUTED; p.textSize = 9 * d
                c.drawText(labels[i], x + bw / 2, height - 3 * d, p)
            }
        }
    }
}

/** Points (x, y) with the axis ranges written in the corners: the website's scatter charts. */
class ScatterChart(ctx: Context) : View(ctx) {
    private var xs = DoubleArray(0); private var ys = DoubleArray(0); private var xu = ""; private var yu = ""
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    fun set(xs: DoubleArray, ys: DoubleArray, xUnit: String, yUnit: String) { this.xs = xs; this.ys = ys; xu = xUnit; yu = yUnit; invalidate() }

    override fun onDraw(c: Canvas) {
        if (xs.isEmpty()) return
        val d = resources.displayMetrics.density
        val left = 34 * d; val top = 6 * d; val bottom = height - 14 * d
        val x0 = xs.minOrNull()!!; val x1 = xs.maxOrNull()!!.let { if (it - x0 < 1e-6) x0 + 1 else it }
        val y0 = ys.minOrNull()!!; val y1 = ys.maxOrNull()!!.let { if (it - y0 < 1e-6) y0 + 1 else it }
        p.color = Ui.LINE; c.drawLine(left, bottom, width.toFloat(), bottom, p); c.drawLine(left, top, left, bottom, p)
        p.color = Ui.GREEN
        xs.indices.forEach { i -> c.drawCircle((left + (xs[i] - x0) / (x1 - x0) * (width - left - 6 * d)).toFloat(), (bottom - (ys[i] - y0) / (y1 - y0) * (bottom - top)).toFloat(), 3.5f * d, p) }
        p.color = Ui.MUTED; p.textSize = 9 * d
        p.textAlign = Paint.Align.RIGHT
        c.drawText("${Math.round(y1)} $yu", left - 3 * d, top + 8 * d, p); c.drawText("${Math.round(y0)}", left - 3 * d, bottom, p)
        p.textAlign = Paint.Align.LEFT; c.drawText("${Math.round(x0)} $xu", left, height - 2 * d, p)
        p.textAlign = Paint.Align.RIGHT; c.drawText("${Math.round(x1)} $xu", width.toFloat(), height - 2 * d, p)
    }
}

/** One series as a line, with its min and max written on the left. */
class LineChart(ctx: Context) : View(ctx) {
    var values = DoubleArray(0)
    var color = Ui.ORANGE
    var unit = ""
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)

    fun set(values: DoubleArray, color: Int, unit: String) { this.values = values; this.color = color; this.unit = unit; invalidate() }

    override fun onDraw(c: Canvas) {
        val v = values.filter { !it.isNaN() }
        if (v.size < 2) return
        val d = resources.displayMetrics.density
        val lo = v.minOrNull()!!; val hi = v.maxOrNull()!!.let { if (it - lo < 1e-6) lo + 1 else it }
        val left = 34 * d; val top = 6 * d; val bottom = height - 6 * d
        val path = Path()
        values.forEachIndexed { i, y ->
            if (y.isNaN()) return@forEachIndexed
            val x = left + (width - left) * i / (values.size - 1f)
            val yy = (bottom - (y - lo) / (hi - lo) * (bottom - top)).toFloat()
            if (path.isEmpty) path.moveTo(x, yy) else path.lineTo(x, yy)
        }
        p.style = Paint.Style.STROKE; p.strokeWidth = 1.6f * d; p.color = color
        c.drawPath(path, p)
        p.style = Paint.Style.FILL; p.color = Ui.MUTED; p.textSize = 9 * d; p.textAlign = Paint.Align.LEFT
        c.drawText(Ui.n0(hi) + unit, 0f, top + 8 * d, p)
        c.drawText(Ui.n0(lo) + unit, 0f, bottom, p)
    }
}

/** Line icons for the tab bar, drawn on a 24-unit grid (no icon library). */
class TabIcon(ctx: Context, private val kind: String) : View(ctx) {
    var color = Ui.MUTED
        set(v) { field = v; invalidate() }
    private val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
    }

    override fun onDraw(c: Canvas) {
        val s = Math.min(width, height) / 24f
        c.save()
        c.translate((width - 24 * s) / 2, (height - 24 * s) / 2)
        c.scale(s, s)
        p.color = color; p.strokeWidth = 2f; p.style = Paint.Style.STROKE
        val path = Path()
        when (kind) {
            "home" -> { path.moveTo(3f, 11f); path.lineTo(12f, 3.5f); path.lineTo(21f, 11f)
                path.moveTo(5.5f, 9.5f); path.lineTo(5.5f, 20f); path.lineTo(18.5f, 20f); path.lineTo(18.5f, 9.5f)
                path.moveTo(10f, 20f); path.lineTo(10f, 14f); path.lineTo(14f, 14f); path.lineTo(14f, 20f) }
            "rides" -> { c.drawCircle(5.5f, 16.5f, 3.8f, p); c.drawCircle(18.5f, 16.5f, 3.8f, p)
                path.moveTo(5.5f, 16.5f); path.lineTo(9.5f, 8.5f); path.lineTo(15.5f, 8.5f); path.lineTo(18.5f, 16.5f)
                path.moveTo(9.5f, 8.5f); path.lineTo(12.5f, 16.5f); path.lineTo(15.5f, 8.5f)
                path.moveTo(8f, 6f); path.lineTo(11f, 6f); path.moveTo(15.5f, 8.5f); path.lineTo(14.5f, 5.5f); path.lineTo(17f, 5.5f) }
            "power" -> { path.moveTo(13f, 2.5f); path.lineTo(4.5f, 13.5f); path.lineTo(11.5f, 13.5f)
                path.lineTo(10.5f, 21.5f); path.lineTo(19.5f, 10.5f); path.lineTo(12.5f, 10.5f); path.close() }
            "sleep" -> { path.moveTo(20.5f, 14.5f)
                path.arcTo(android.graphics.RectF(3f, 3f, 21f, 21f), 20f, 250f, false)
                path.quadTo(8.5f, 14f, 20.5f, 14.5f) }
            "money" -> { c.drawRoundRect(android.graphics.RectF(2.5f, 6f, 21.5f, 19f), 3f, 3f, p)
                path.moveTo(2.5f, 10f); path.lineTo(21.5f, 10f)
                c.drawCircle(16.5f, 14.5f, 1.2f, p.apply { style = Paint.Style.FILL }); p.style = Paint.Style.STROKE }
            "distance" -> { c.drawCircle(5f, 18f, 2.2f, p); c.drawCircle(19f, 6f, 2.2f, p)
                path.moveTo(7f, 18f); path.cubicTo(14f, 18f, 9f, 6f, 17f, 6f) }
            "time" -> { c.drawCircle(12f, 12f, 9f, p); path.moveTo(12f, 7f); path.lineTo(12f, 12f); path.lineTo(15.5f, 14f) }
            "climb" -> { path.moveTo(2.5f, 20f); path.lineTo(9f, 8f); path.lineTo(13f, 14f); path.lineTo(16f, 10f); path.lineTo(21.5f, 20f); path.close() }
            "speed" -> { path.addArc(android.graphics.RectF(3f, 5f, 21f, 23f), 180f, 180f); path.moveTo(12f, 14f); path.lineTo(16.5f, 9f) }
            "hr" -> { path.moveTo(12f, 20f); path.cubicTo(1f, 13f, 3f, 3.5f, 9f, 4.5f); path.cubicTo(10.5f, 4.8f, 11.5f, 6f, 12f, 7f)
                path.cubicTo(12.5f, 6f, 13.5f, 4.8f, 15f, 4.5f); path.cubicTo(21f, 3.5f, 23f, 13f, 12f, 20f) }
            "energy" -> { path.moveTo(12f, 21f); path.cubicTo(5f, 21f, 4f, 13f, 9f, 8.5f); path.cubicTo(9f, 11.5f, 11f, 12f, 11f, 12f)
                path.cubicTo(10f, 7f, 13f, 4f, 14f, 3f); path.cubicTo(15f, 8f, 20f, 10f, 19f, 15f); path.cubicTo(18.5f, 18.5f, 15.5f, 21f, 12f, 21f) }
            "cadence" -> { path.addArc(android.graphics.RectF(4f, 4f, 20f, 20f), -60f, 300f); path.moveTo(20f, 4.5f); path.lineTo(20f, 9.5f); path.lineTo(15f, 9.5f) }
            "effort" -> { path.moveTo(2f, 12f); path.lineTo(7f, 12f); path.lineTo(9.5f, 6f); path.lineTo(14f, 19f); path.lineTo(16.5f, 12f); path.lineTo(22f, 12f) }
            "more" -> listOf(6f, 12f, 18f).forEach { y -> path.moveTo(4f, y); path.lineTo(20f, y) }
            "update" -> { path.moveTo(12f, 3f); path.lineTo(12f, 15f); path.moveTo(7f, 10f); path.lineTo(12f, 15f); path.lineTo(17f, 10f)
                path.moveTo(4f, 19f); path.lineTo(20f, 19f) }
        }
        c.drawPath(path, p)
        c.restore()
    }
}

/** Fitness (CTL) as a line over form (TSB) bars around zero — the website's Training chart, simplified. */
class FitnessChart(ctx: Context) : View(ctx) {
    private var ctl = DoubleArray(0)
    private var tsb = DoubleArray(0)
    private var labels: List<String> = emptyList()
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)

    fun set(ctl: DoubleArray, tsb: DoubleArray, labels: List<String>) { this.ctl = ctl; this.tsb = tsb; this.labels = labels; invalidate() }

    override fun onDraw(c: Canvas) {
        if (ctl.size < 2) return
        val d = resources.displayMetrics.density
        val top = 8 * d; val bottom = height - 16 * d
        val hi = Math.max(ctl.maxOrNull() ?: 1.0, tsb.maxOrNull() ?: 0.0) * 1.1
        val lo = Math.min(0.0, tsb.minOrNull() ?: 0.0) * 1.1
        fun y(v: Double) = (bottom - (v - lo) / (hi - lo) * (bottom - top)).toFloat()
        val step = width.toFloat() / (ctl.size - 1)
        // form bars: green when fresh, red when fatigued
        val bw = Math.max(1f, step * 0.7f)
        tsb.forEachIndexed { i, v ->
            p.color = if (v >= 0) Color.argb(150, 34, 197, 94) else Color.argb(150, 239, 68, 68)
            val x = i * step
            c.drawRect(x - bw / 2, Math.min(y(v), y(0.0)), x + bw / 2, Math.max(y(v), y(0.0)), p)
        }
        p.color = Ui.LINE; p.strokeWidth = d
        c.drawLine(0f, y(0.0), width.toFloat(), y(0.0), p)
        val path = Path()
        ctl.forEachIndexed { i, v -> if (i == 0) path.moveTo(0f, y(v)) else path.lineTo(i * step, y(v)) }
        p.style = Paint.Style.STROKE; p.strokeWidth = 2.2f * d; p.color = Ui.ORANGE
        c.drawPath(path, p)
        p.style = Paint.Style.FILL; p.textSize = 9 * d; p.color = Ui.MUTED
        listOf(0, labels.size / 2, labels.size - 1).forEach { i ->
            if (i < labels.size) {
                p.textAlign = when (i) { 0 -> Paint.Align.LEFT; labels.size - 1 -> Paint.Align.RIGHT; else -> Paint.Align.CENTER }
                c.drawText(labels[i], i * step, height - 3 * d, p)
            }
        }
    }
}

/** A year of activity as a heatmap: one column per week (Mon at the top), darker orange = more km. */
class CalendarHeat(ctx: Context) : View(ctx) {
    private var weeks: List<DoubleArray> = emptyList()
    private var months: List<Pair<Int, String>> = emptyList()
    private var max = 1.0
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)

    /** from: the Monday the grid starts on (yyyy-MM-dd); km per date. */
    fun set(from: String, kmByDay: Map<String, Double>, today: String) {
        val cal = java.util.Calendar.getInstance()
        cal.set(from.substring(0, 4).toInt(), from.substring(5, 7).toInt() - 1, from.substring(8, 10).toInt())
        val w = ArrayList<DoubleArray>(); val m = ArrayList<Pair<Int, String>>()
        val names = arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
        var lastMonth = -1
        while (true) {
            val col = DoubleArray(7) { -1.0 }
            for (dow in 0 until 7) {
                val key = String.format(Locale.US, "%04d-%02d-%02d", cal.get(java.util.Calendar.YEAR), cal.get(java.util.Calendar.MONTH) + 1, cal.get(java.util.Calendar.DAY_OF_MONTH))
                if (key > today) break
                if (dow == 0 && cal.get(java.util.Calendar.MONTH) != lastMonth) { lastMonth = cal.get(java.util.Calendar.MONTH); m.add(w.size to names[lastMonth]) }
                col[dow] = kmByDay[key] ?: 0.0
                cal.add(java.util.Calendar.DAY_OF_MONTH, 1)
            }
            w.add(col)
            if (col.any { it < 0 } || w.size > 60) break
        }
        weeks = w; months = m; max = (kmByDay.values.maxOrNull() ?: 1.0).coerceAtLeast(1.0)
        invalidate()
    }

    override fun onDraw(c: Canvas) {
        if (weeks.isEmpty()) return
        val d = resources.displayMetrics.density
        val labelH = 12 * d
        val cell = Math.min(width.toFloat() / weeks.size, (height - labelH) / 7f)
        val gap = cell * 0.18f
        weeks.forEachIndexed { x, col ->
            col.forEachIndexed { y, km ->
                if (km < 0) return@forEachIndexed
                p.color = if (km <= 0) Color.parseColor("#1E1E26")
                    else Color.argb((70 + 185 * Math.sqrt(km / max)).toInt().coerceAtMost(255), 252, 76, 2)
                c.drawRoundRect(x * cell, labelH + y * cell, x * cell + cell - gap, labelH + y * cell + cell - gap, gap, gap, p)
            }
        }
        p.color = Ui.MUTED; p.textSize = 9 * d; p.textAlign = Paint.Align.LEFT
        var lastX = -100f
        months.forEach { (col, name) -> val x = col * cell; if (x - lastX > 24 * d) { c.drawText(name, x, 9 * d, p); lastX = x } }
    }
}
