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

    /** A grid of big numbers with small captions, `cols` per row. */
    fun tiles(ctx: Context, items: List<Pair<String, String>>, cols: Int = 2): LinearLayout {
        val box = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        items.chunked(cols).forEach { row ->
            val line = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
            row.forEach { (value, label) ->
                val c = card(ctx).apply {
                    gravity = Gravity.CENTER_HORIZONTAL
                    addView(text(ctx, value, 20f, TEXT, true).apply { gravity = Gravity.CENTER })
                    addView(text(ctx, label.uppercase(Locale.US), 10f, MUTED, true).apply { gravity = Gravity.CENTER; letterSpacing = 0.08f })
                }
                line.addView(c, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply {
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
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)

    fun set(values: DoubleArray, labels: List<String>) { this.values = values; this.labels = labels; invalidate() }

    override fun onDraw(c: Canvas) {
        if (values.isEmpty()) return
        val d = resources.displayMetrics.density
        val bottom = height - 16 * d
        val top = 14 * d
        val max = values.maxOrNull()?.takeIf { it > 0 } ?: 1.0
        val slot = width.toFloat() / values.size
        val bw = slot * 0.62f
        val every = Math.max(1, Math.ceil(values.size / 8.0).toInt())
        p.textAlign = Paint.Align.CENTER
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

/** The ride's shape from its summary polyline — no map tiles, no network. */
class RouteView(ctx: Context) : View(ctx) {
    private var pts: List<DoubleArray> = emptyList()
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)

    fun set(polyline: String?) { pts = if (polyline.isNullOrEmpty()) emptyList() else Ui.decodePolyline(polyline); invalidate() }

    override fun onDraw(c: Canvas) {
        if (pts.size < 2) return
        val d = resources.displayMetrics.density
        val k = Math.cos(Math.toRadians(pts[0][0]))            // squash longitude to keep the shape true
        val xs = pts.map { it[1] * k }; val ys = pts.map { it[0] }
        val minX = xs.minOrNull()!!; val maxX = xs.maxOrNull()!!; val minY = ys.minOrNull()!!; val maxY = ys.maxOrNull()!!
        val pad = 14 * d
        val s = Math.min((width - 2 * pad) / Math.max(maxX - minX, 1e-9), (height - 2 * pad) / Math.max(maxY - minY, 1e-9))
        val ox = (width - (maxX - minX) * s) / 2; val oy = (height - (maxY - minY) * s) / 2
        fun px(i: Int) = (ox + (xs[i] - minX) * s).toFloat()
        fun py(i: Int) = (height - oy - (ys[i] - minY) * s).toFloat()
        val path = Path().apply { moveTo(px(0), py(0)); for (i in 1 until pts.size) lineTo(px(i), py(i)) }
        p.style = Paint.Style.STROKE; p.strokeJoin = Paint.Join.ROUND; p.strokeCap = Paint.Cap.ROUND
        p.strokeWidth = 3.5f * d; p.color = Ui.ORANGE
        c.drawPath(path, p)
        p.style = Paint.Style.FILL
        p.color = Ui.GREEN; c.drawCircle(px(0), py(0), 5 * d, p)
        p.color = Ui.RED; c.drawCircle(px(pts.size - 1), py(pts.size - 1), 5 * d, p)
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
        }
        c.drawPath(path, p)
        c.restore()
    }
}
