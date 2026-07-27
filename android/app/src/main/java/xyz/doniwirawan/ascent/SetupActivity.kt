package xyz.doniwirawan.ascent

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * The only screen in the app: shows what the widget last managed to fetch, and
 * lets the Strava refresh token be replaced if it ever stops working. Built in
 * code so the APK needs no UI libraries at all.
 */
class SetupActivity : Activity() {

    private lateinit var status: TextView
    private lateinit var tokenField: EditText
    private val io = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())

    /** Set when the launcher opens this as the widget's configure screen. */
    private var widgetId = android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)

        widgetId = intent?.getIntExtra(
            android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_ID,
            android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID
        ) ?: android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID
        // Report success up front so backing out still leaves a working widget.
        if (widgetId != android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID) {
            setResult(
                RESULT_OK,
                Intent().putExtra(android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            )
        }

        val pad = (16 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(Color.parseColor("#0C0C0C"))
        }

        col.addView(title("Ascent Widget"))
        col.addView(
            body(
                "Add the widget from your launcher's widget picker. It shows this " +
                    "week's distance, moving time and climbing, with a bar per day. " +
                    "Tap the widget to refresh; it also updates itself every 30 minutes."
            )
        )

        status = body("").apply {
            setPadding(0, pad, 0, pad)
            setTextColor(Color.parseColor("#8A8A96"))
        }
        col.addView(status)

        col.addView(label("Strava refresh token"))
        tokenField = EditText(this).apply {
            setText(Repo.refreshToken(this@SetupActivity))
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setSingleLine(true)
        }
        col.addView(tokenField, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        col.addView(
            body("Only needed if Strava ever invalidates the built-in one. It stays on this phone.")
                .apply { setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f) }
        )

        col.addView(button("Save & refresh now") {
            Repo.setRefreshToken(this, tokenField.text.toString())
            refresh()
        })

        col.addView(button("Open the dashboard") {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.DASHBOARD_URL)))
        })

        setContentView(ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#0C0C0C"))
            addView(col, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        })

        showCached()
    }

    private fun showCached() {
        val snap = Repo.cached(this)
        val error = Repo.lastError(this)
        status.text = when {
            error != null -> "Last attempt failed:\n$error"
            snap == null -> "No data yet — tap “Save & refresh now”."
            else -> buildString {
                append("This week: ")
                append(String.format(Locale.US, "%.1f km", snap.week.km))
                append(" · ").append(snap.week.count).append(" activities\n")
                append("This month: ").append(String.format(Locale.US, "%.1f km", snap.month.km)).append("\n")
                append("This year: ").append(String.format(Locale.US, "%.1f km", snap.ytd.km)).append("\n")
                snap.lastName?.let { append("Latest: ").append(it).append("\n") }
                append("Synced ")
                append(SimpleDateFormat("d MMM, HH:mm", Locale.getDefault()).format(Date(snap.syncedAt)))
            }
        }
        status.setTextColor(if (error != null) Color.parseColor("#F87171") else Color.parseColor("#8A8A96"))
    }

    private fun refresh() {
        status.text = "Fetching from Strava…"
        status.setTextColor(Color.parseColor("#8A8A96"))
        io.execute {
            try {
                Repo.refresh(this)
            } catch (e: Exception) {
                // Repo recorded the message; showCached reads it back.
            }
            AscentWidget.drawAll(this)
            ui.post { showCached() }
        }
    }

    // ── Tiny view builders ──────────────────────────────────────────────────

    private fun title(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
        setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    private fun body(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(Color.parseColor("#8A8A96"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setPadding(0, (8 * resources.displayMetrics.density).toInt(), 0, 0)
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(Color.parseColor("#FC4C02"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(0, (20 * resources.displayMetrics.density).toInt(), 0, 0)
    }

    private fun button(text: String, onClick: () -> Unit) = Button(this).apply {
        this.text = text
        gravity = Gravity.CENTER
        setOnClickListener { onClick() }
        val lp = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
        lp.topMargin = (12 * resources.displayMetrics.density).toInt()
        layoutParams = lp
    }
}
