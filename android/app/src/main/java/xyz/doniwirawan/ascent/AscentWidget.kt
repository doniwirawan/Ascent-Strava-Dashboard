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
            val snap = Repo.cached(ctx)
            val error = Repo.lastError(ctx)

            if (snap == null) {
                v.setTextViewText(R.id.tvBig, "—")
                v.setTextViewText(R.id.tvTime, "—")
                v.setTextViewText(R.id.tvElev, "—")
                v.setTextViewText(R.id.tvMonth, "—")
            } else {
                v.setTextViewText(R.id.tvBig, km(snap.week.km))
                v.setTextViewText(R.id.tvTime, hours(snap.week.seconds))
                v.setTextViewText(R.id.tvElev, "${snap.week.elevation.roundToInt().withCommas()} m")
                v.setTextViewText(R.id.tvMonth, "${km(snap.month.km)} km")
            }

            // Recovery pill, tinted by band. Hidden until we have a snapshot,
            // so a fresh widget never shows a made-up 50%.
            if (snap == null) {
                v.setViewVisibility(R.id.tvRecovery, android.view.View.GONE)
            } else {
                v.setViewVisibility(R.id.tvRecovery, android.view.View.VISIBLE)
                v.setTextViewText(R.id.tvRecovery, "${snap.recovery}%")
                v.setTextColor(R.id.tvRecovery, Repo.recoveryBandColor(snap.recovery))
            }

            // The right-hand slot carries whichever matters more: a live error,
            // or how stale the numbers are.
            if (error != null) {
                v.setTextViewText(R.id.tvSync, "tap to retry")
                v.setTextColor(R.id.tvSync, ctx.getColor(R.color.error))
            } else {
                v.setTextViewText(R.id.tvSync, ago(snap?.syncedAt ?: 0L))
                v.setTextColor(R.id.tvSync, ctx.getColor(R.color.dim))
            }

            v.setImageViewBitmap(R.id.ivChart, chart(ctx, snap?.days, widthDp(mgr, id)))

            v.setOnClickPendingIntent(
                R.id.root,
                PendingIntent.getBroadcast(
                    ctx, 0, refreshIntent(ctx),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            // The recovery pill is the one spot that opens the native screen.
            v.setOnClickPendingIntent(
                R.id.tvRecovery,
                PendingIntent.getActivity(
                    ctx, 1, Intent(ctx, RecoveryActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            mgr.updateAppWidget(id, v)
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
            val gap = w * 0.02f
            val barW = (w - gap * 6) / 7f
            val radius = barW * 0.28f

            for (i in 0 until 7) {
                val isToday = i == 6
                // Empty days still get a sliver so the week's shape stays legible.
                val ratio = if (peak > 0) (values[i] / peak).toFloat() else 0f
                val barH = max(h * 0.10f, h * ratio)
                val left = i * (barW + gap)
                paint.color = when {
                    values[i] <= 0.0 -> Color.parseColor("#1E1E26")
                    isToday -> ctx.getColor(R.color.orange)
                    else -> Color.parseColor("#7A3A18")
                }
                canvas.drawRoundRect(
                    RectF(left, h - barH, left + barW, h.toFloat()), radius, radius, paint
                )
            }
            return bmp
        }
    }
}
