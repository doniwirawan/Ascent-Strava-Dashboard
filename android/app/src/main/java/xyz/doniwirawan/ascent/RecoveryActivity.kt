package xyz.doniwirawan.ascent

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Native Recovery / Strain screen — the same two readings the website shows,
 * drawn with real Android views so it works from the widget without waiting on
 * a WebView. Reads the cached snapshot instantly, then refreshes behind it.
 */
class RecoveryActivity : Activity() {

    private lateinit var recoveryRing: RingView
    private lateinit var strainRing: RingView
    private lateinit var caption: TextView
    private lateinit var detail: TextView
    private val io = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        actionBar?.hide()

        val d = resources.displayMetrics.density
        val pad = (20 * d).toInt()

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            gravity = Gravity.CENTER_HORIZONTAL
        }

        col.addView(TextView(this).apply {
            text = "TODAY"
            setTextColor(Color.parseColor("#63636F"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            letterSpacing = 0.18f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        })

        recoveryRing = RingView(this).apply { label = "RECOVERY" }
        col.addView(recoveryRing, LinearLayout.LayoutParams((260 * d).toInt(), (260 * d).toInt()).apply {
            topMargin = (18 * d).toInt()
        })

        caption = TextView(this).apply {
            setTextColor(Color.parseColor("#B4B4BE"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            gravity = Gravity.CENTER
            setPadding(0, (16 * d).toInt(), 0, 0)
        }
        col.addView(caption)

        strainRing = RingView(this).apply { label = "DAY STRAIN"; accent = Color.parseColor("#0093E7") }
        col.addView(strainRing, LinearLayout.LayoutParams((190 * d).toInt(), (190 * d).toInt()).apply {
            topMargin = (26 * d).toInt()
        })

        detail = TextView(this).apply {
            setTextColor(Color.parseColor("#63636F"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            gravity = Gravity.CENTER
            setPadding(0, (18 * d).toInt(), 0, 0)
        }
        col.addView(detail)

        col.addView(Button(this).apply {
            text = "Open the full dashboard"
            setOnClickListener {
                startActivity(Intent(this@RecoveryActivity, MainActivity::class.java))
            }
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
                topMargin = (26 * d).toInt()
            }
        })

        setContentView(ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#0C0C0C"))
            addView(col, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        })

        show(Repo.cached(this))
        refresh()
    }

    private fun show(s: Repo.Snapshot?) {
        if (s == null) {
            caption.text = Repo.lastError(this) ?: "No data yet."
            detail.text = ""
            return
        }
        val colour = Repo.recoveryBandColor(s.recovery)
        recoveryRing.set(s.recovery / 100f, "${s.recovery}%", Repo.recoveryBandLabel(s.recovery), colour)
        strainRing.set((s.strain / 21.0).toFloat(), String.format(Locale.US, "%.1f", s.strain), "OF 21", null)

        caption.text = when {
            s.recovery >= 67 -> "Well recovered. Good day to go hard."
            s.recovery >= 34 -> "Partly recovered. Moderate training is fine."
            else -> "Fatigue is high. Take it easy or rest."
        }
        detail.text = String.format(
            Locale.US,
            "Fitness %d · Fatigue %d · Form %+d\nThis week: %.1f km over %d activities",
            Math.round(s.ctl), Math.round(s.atl), Math.round(s.tsb), s.week.km, s.week.count
        )
    }

    private fun refresh() {
        io.execute {
            try { Repo.refresh(this) } catch (e: Exception) { /* cached view stays */ }
            AscentWidget.drawAll(this)
            ui.post { show(Repo.cached(this)) }
        }
    }

    /** A single WHOOP-style ring: track, arc, big value, small caption. */
    class RingView(ctx: Context) : View(ctx) {
        var label: String = ""
        var accent: Int? = null
        private var pct = 0f
        private var big = "—"
        private var cap = ""

        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }

        fun set(pct: Float, big: String, cap: String, colour: Int?) {
            this.pct = pct.coerceIn(0f, 1f)
            this.big = big
            this.cap = cap
            if (colour != null) accent = colour
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            val d = resources.displayMetrics.density
            val stroke = 18 * d
            val pad = stroke / 2 + 2 * d
            val box = RectF(pad, pad, width - pad, height - pad)
            val colour = accent ?: Color.parseColor("#16EC8B")

            paint.style = Paint.Style.STROKE
            paint.strokeWidth = stroke
            paint.strokeCap = Paint.Cap.ROUND

            paint.color = Color.parseColor("#1E1E26")
            canvas.drawArc(box, 0f, 360f, false, paint)

            if (pct > 0.004f) {
                paint.color = colour
                canvas.drawArc(box, -90f, 360f * pct, false, paint)
            }

            // All three lines stack inside the ring — drawing the label at the
            // view's bottom edge put it straight through the arc.
            val cx = width / 2f
            val cy = height / 2f

            text.color = Color.parseColor("#8A8A96")
            text.textSize = height * 0.055f
            text.letterSpacing = 0.14f
            text.typeface = android.graphics.Typeface.DEFAULT_BOLD
            canvas.drawText(label, cx, cy - height * 0.15f, text)

            text.color = Color.WHITE
            text.textSize = height * 0.22f
            text.letterSpacing = 0f
            canvas.drawText(big, cx, cy + height * 0.07f, text)

            text.color = colour
            text.textSize = height * 0.058f
            text.letterSpacing = 0.14f
            canvas.drawText(cap, cx, cy + height * 0.20f, text)
            text.letterSpacing = 0f
        }
    }
}
