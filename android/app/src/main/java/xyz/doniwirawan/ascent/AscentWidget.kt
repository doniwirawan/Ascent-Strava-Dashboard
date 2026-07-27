package xyz.doniwirawan.ascent

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.widget.RemoteViews
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Home-screen widget: this week's distance, time and climbing, plus a seven-day
 * bar chart. Draws from the cached snapshot immediately, then refreshes in the
 * background. Tapping anywhere refreshes.
 */
class AscentWidget : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { draw(ctx, mgr, it) }
        fetch(ctx, null)
    }

    override fun onAppWidgetOptionsChanged(
        ctx: Context, mgr: AppWidgetManager, id: Int, options: android.os.Bundle
    ) = draw(ctx, mgr, id)

    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != ACTION_REFRESH) { super.onReceive(ctx, intent); return }
        // Network on a receiver's main thread would ANR — hand off and keep the
        // process alive until the fetch finishes.
        val pending = goAsync()
        fetch(ctx) { pending.finish() }
    }

    companion object {
        const val ACTION_REFRESH = "xyz.doniwirawan.ascent.REFRESH"
        private val pool = Executors.newSingleThreadExecutor()

        fun refreshIntent(ctx: Context): Intent =
            Intent(ctx, AscentWidget::class.java).setAction(ACTION_REFRESH)

        /** Refreshes from Strava off the main thread, then redraws every widget. */
        fun fetch(ctx: Context, onDone: (() -> Unit)?) {
            val app = ctx.applicationContext
            pool.execute {
                try {
                    Repo.refresh(app)
                } catch (e: Exception) {
                    // Repo already stored the message; the widget shows it.
                } finally {
                    drawAll(app)
                    onDone?.invoke()
                }
            }
        }

        fun drawAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, AscentWidget::class.java))
            ids.forEach { draw(ctx, mgr, it) }
        }

        private fun draw(ctx: Context, mgr: AppWidgetManager, id: Int) {
            val v = RemoteViews(ctx.packageName, R.layout.widget)
            populate(ctx, v, widthDp(mgr, id))
            mgr.updateAppWidget(id, v)
        }

        /** Fills the RemoteViews. Split out so the preview harness shares it. */
        private fun populate(ctx: Context, v: RemoteViews, widthDp: Int) {
            val snap = Repo.cached(ctx)
            val error = Repo.lastError(ctx)

            if (snap == null) {
                v.setTextViewText(R.id.tvBig, "—")
                v.setTextViewText(R.id.tvTime, "")
                v.setTextViewText(R.id.tvTotals, "")
            } else {
                v.setTextViewText(R.id.tvBig, km(snap.week.km))
                v.setTextViewText(
                    R.id.tvTime,
                    "${hours(snap.week.seconds)} h  ·  ${snap.week.elevation.roundToInt().withCommas()} m"
                )
                v.setTextViewText(
                    R.id.tvTotals,
                    "month ${km(snap.month.km)}  ·  year ${km(snap.ytd.km)} km"
                )
            }

            // The two rings mirror the web dashboard. Until a snapshot exists
            // they draw as empty tracks rather than inventing a 50%.
            v.setImageViewBitmap(
                R.id.ivRecovery,
                ring(ctx, snap?.let { it.recovery / 100f },
                    snap?.let { Repo.recoveryBandColor(it.recovery) } ?: ctx.getColor(R.color.dim),
                    snap?.let { "${it.recovery}%" } ?: "—", "RECOVERY")
            )
            v.setImageViewBitmap(
                R.id.ivStrain,
                ring(ctx, snap?.let { (it.strain / 21.0).toFloat() }, STRAIN_BLUE,
                    snap?.let { String.format(Locale.US, "%.1f", it.strain) } ?: "—", "STRAIN")
            )

            // The right-hand slot carries whichever matters more: a live error,
            // or how stale the numbers are.
            if (error != null) {
                v.setTextViewText(R.id.tvSync, "tap to retry")
                v.setTextColor(R.id.tvSync, ctx.getColor(R.color.error))
            } else {
                v.setTextViewText(R.id.tvSync, ago(snap?.syncedAt ?: 0L))
                v.setTextColor(R.id.tvSync, ctx.getColor(R.color.dim))
            }

            v.setImageViewBitmap(R.id.ivChart, chart(ctx, snap?.days, widthDp))

            v.setOnClickPendingIntent(
                R.id.root,
                PendingIntent.getBroadcast(
                    ctx, 0, refreshIntent(ctx),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            // Either ring opens the native Recovery screen; the rest refreshes.
            val openRecovery = PendingIntent.getActivity(
                ctx, 1, Intent(ctx, RecoveryActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            v.setOnClickPendingIntent(R.id.ivRecovery, openRecovery)
            v.setOnClickPendingIntent(R.id.ivStrain, openRecovery)
        }

        private fun widthDp(mgr: AppWidgetManager, id: Int): Int =
            mgr.getAppWidgetOptions(id)
                .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
                .takeIf { it > 0 } ?: 250

        // ── Formatting ──────────────────────────────────────────────────────

        private fun km(v: Double) =
            if (v >= 100) String.format(Locale.US, "%.0f", v)
            else String.format(Locale.US, "%.1f", v)

        private fun hours(seconds: Long): String {
            val h = seconds / 3600
            val m = (seconds % 3600) / 60
            return String.format(Locale.US, "%d:%02d", h, m)
        }

        private fun Int.withCommas() = String.format(Locale.US, "%,d", this)

        private fun ago(at: Long): String {
            if (at <= 0L) return "never synced"
            val mins = (System.currentTimeMillis() - at) / 60000
            return when {
                mins < 1 -> "just now"
                mins < 60 -> "${mins}m ago"
                mins < 1440 -> "${mins / 60}h ago"
                else -> "${mins / 1440}d ago"
            }
        }

        // ── Rings ───────────────────────────────────────────────────────────

        private const val STRAIN_BLUE = 0xFF0093E7.toInt()

        /**
         * One ring as a bitmap: track, arc from 12 o'clock, value, caption.
         * A null pct means "no data" and draws the bare track.
         */
        private fun ring(ctx: Context, pct: Float?, colour: Int, big: String, cap: String): Bitmap {
            val d = ctx.resources.displayMetrics.density
            val size = (44 * d).toInt()
            val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bmp)
            val stroke = 5f * d
            val pad = stroke / 2f + 1f
            val box = RectF(pad, pad, size - pad, size - pad)

            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                strokeCap = Paint.Cap.ROUND
                color = Color.parseColor("#22222B")
            }
            canvas.drawArc(box, 0f, 360f, false, p)
            if (pct != null && pct > 0.004f) {
                p.color = colour
                canvas.drawArc(box, -90f, 360f * pct.coerceIn(0f, 1f), false, p)
            }

            val t = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                textAlign = Paint.Align.CENTER
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }
            t.color = Color.WHITE
            t.textSize = size * 0.26f
            canvas.drawText(big, size / 2f, size / 2f + t.textSize * 0.16f, t)
            t.color = colour
            t.textSize = size * 0.115f
            canvas.drawText(cap, size / 2f, size * 0.77f, t)
            return bmp
        }

        // ── Seven-day bar chart ─────────────────────────────────────────────

        /**
         * Rendered as a bitmap because RemoteViews has no drawing primitives.
         * The image is stretched with fitXY, so only the bar heights need to be
         * accurate — width is scaled to whatever the widget ends up being.
         */
        private fun chart(ctx: Context, days: DoubleArray?, widthDp: Int): Bitmap {
            val density = ctx.resources.displayMetrics.density
            val w = max(160, (widthDp * density).toInt())
            val h = (34 * density).toInt()
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bmp)

            val values = days ?: DoubleArray(7)
            val peak = values.maxOrNull() ?: 0.0
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val gap = w * 0.045f
            val barW = (w - gap * 6) / 7f
            // fitXY stretches this bitmap to the view, which inflates rounded
            // corners into blobs — keep the radius small and absolute.
            val radius = minOf(barW * 0.28f, 2f * density)

            for (i in 0 until 7) {
                val isToday = i == 6
                // Empty days still get a sliver so the week's shape stays legible.
                val ratio = if (peak > 0) (values[i] / peak).toFloat() else 0f
                val barH = max(h * 0.10f, h * ratio)
                val left = i * (barW + gap)
                paint.color = when {
                    values[i] <= 0.0 -> Color.parseColor("#1E1E26")
                    isToday -> ctx.getColor(R.color.orange)
                    else -> Color.parseColor("#C2521A")
                }
                canvas.drawRoundRect(
                    RectF(left, h - barH, left + barW, h.toFloat()), radius, radius, paint
                )
            }
            return bmp
        }
    }
}
