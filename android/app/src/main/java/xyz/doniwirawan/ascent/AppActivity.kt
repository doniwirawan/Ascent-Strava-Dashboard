package xyz.doniwirawan.ascent

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * The app's front door: native screens over the personal API (Home, Rides,
 * Power, Sleep, Money), with the full web dashboard one tap away. Each screen
 * draws its saved copy straight away, then redraws when fresh data arrives.
 */
class AppActivity : Activity() {

    private lateinit var content: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var status: TextView
    private lateinit var banner: LinearLayout
    private var release: Updater.Release? = null
    private val tabs = linkedMapOf("home" to "Home", "rides" to "Rides", "power" to "Power", "sleep" to "Sleep", "money" to "Money")
    private val tabViews = HashMap<String, TextView>()
    private val tabIcons = HashMap<String, TabIcon>()
    private var current = "home"
    private var generation = 0                       // drops answers for a screen you already left
    private val io = Executors.newFixedThreadPool(3)
    val ui = Handler(Looper.getMainLooper())

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        actionBar?.hide()
        window.statusBarColor = Ui.BG
        window.navigationBarColor = Ui.BG

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Ui.BG) }

        // top bar: title, status, web dashboard, settings
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(Ui.dp(this@AppActivity, 16), Ui.dp(this@AppActivity, 12), Ui.dp(this@AppActivity, 8), Ui.dp(this@AppActivity, 4))
        }
        top.addView(Ui.text(this, "Ascent", 20f, Ui.TEXT, true), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        top.addView(topButton("Web") { startActivity(Intent(this, MainActivity::class.java)) })
        top.addView(topButton("⚙") { showSettings() })
        root.addView(top)
        status = Ui.text(this, "", 11f, Ui.MUTED).apply { setPadding(Ui.dp(this@AppActivity, 16), 0, Ui.dp(this@AppActivity, 16), 0) }
        root.addView(status)
        banner = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            visibility = android.view.View.GONE
            val p = Ui.dp(this@AppActivity, 12)
            setPadding(p, p, p, p)
            background = android.graphics.drawable.GradientDrawable().apply { setColor(Ui.ORANGE); cornerRadius = Ui.dp(this@AppActivity, 10).toFloat() }
            setOnClickListener { installUpdate() }
        }
        root.addView(banner, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
            val m = Ui.dp(this@AppActivity, 16); setMargins(m, Ui.dp(this@AppActivity, 8), m, 0)
        })

        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = Ui.dp(this@AppActivity, 16)
            setPadding(p, Ui.dp(this@AppActivity, 4), p, p)
        }
        scroll = ScrollView(this).apply { addView(content, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)) }
        root.addView(scroll, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Ui.CARD)
            setPadding(0, Ui.dp(this@AppActivity, 4), 0, Ui.dp(this@AppActivity, 4))
        }
        tabs.forEach { (id, name) ->
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(0, Ui.dp(this@AppActivity, 8), 0, Ui.dp(this@AppActivity, 6))
                setOnClickListener { show(id) }
            }
            val icon = TabIcon(this, id)
            item.addView(icon, LinearLayout.LayoutParams(Ui.dp(this, 24), Ui.dp(this, 24)))
            val t = Ui.text(this, name, 11f, Ui.MUTED, true).apply { gravity = Gravity.CENTER; setPadding(0, Ui.dp(this@AppActivity, 3), 0, 0) }
            item.addView(t)
            tabViews[id] = t
            tabIcons[id] = icon
            bar.addView(item, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        }
        root.addView(bar)
        setContentView(root)

        if (Repo.prefs(this).getString("api_token", null).isNullOrBlank() && BuildConfig.BAKED_API_TOKEN.isNotBlank())
            Repo.prefs(this).edit().putString("api_token", BuildConfig.BAKED_API_TOKEN).apply()

        current = saved?.getString("tab") ?: Repo.prefs(this).getString("tab", "home") ?: "home"
        if (Api.hasToken(this)) {
            show(current)
            // the Recovery card and the widgets come from Repo's snapshot
            io.execute {
                try { Repo.refresh(this) } catch (e: Exception) {}
                AscentWidget.drawAll(this)
                ui.post { if (current == "home" && Api.hasToken(this)) show("home") }
            }
            checkForUpdate(false)
        } else showSettings()
    }

    override fun onSaveInstanceState(out: Bundle) {
        super.onSaveInstanceState(out)
        out.putString("tab", current)
    }

    private fun topButton(label: String, onClick: () -> Unit) = Ui.text(this, label, 14f, Ui.TEXT, true).apply {
        val p = Ui.dp(this@AppActivity, 12)
        setPadding(p, p / 2, p, p / 2)
        setOnClickListener { onClick() }
    }

    fun show(tab: String) {
        if (!Api.hasToken(this)) { showSettings(); return }
        current = tab
        Repo.prefs(this).edit().putString("tab", tab).apply()
        tabViews.forEach { (id, v) -> v.setTextColor(if (id == tab) Ui.ORANGE else Ui.MUTED) }
        tabIcons.forEach { (id, v) -> v.color = if (id == tab) Ui.ORANGE else Ui.MUTED }
        scroll.scrollTo(0, 0)
        when (tab) {
            "home" -> Screens.home(this)
            "rides" -> Screens.rides(this)
            "power" -> Screens.power(this)
            "sleep" -> Screens.sleep(this)
            "money" -> Screens.money(this)
        }
    }

    /** Clears the screen and returns the column to fill. */
    fun page(): LinearLayout { content.removeAllViews(); return content }

    /**
     * Draws `render` from the saved copies of `paths` now, then fetches them all
     * and draws again. `render` gets null for a path that has never loaded.
     */
    fun load(paths: List<String>, render: (Map<String, JSONObject?>) -> Unit) {
        val gen = ++generation
        val cached = paths.associateWith { Api.cached(this, it) }
        if (cached.values.any { it != null }) render(cached)
        else { page().addView(Ui.text(this, "Loading…", 13f, Ui.MUTED)) }
        status.text = "Updating…"
        io.execute {
            val fresh = HashMap<String, JSONObject?>()
            var error: String? = null
            for (p in paths) {
                fresh[p] = try { Api.get(this, p) } catch (e: Exception) { error = e.message; cached[p] }
            }
            ui.post {
                if (gen != generation) return@post
                status.text = error ?: ""
                status.setTextColor(if (error != null) Ui.RED else Ui.MUTED)
                if (fresh.values.any { it != null }) render(fresh)
                else page().addView(Ui.text(this, error ?: "Nothing to show yet.", 13f, Ui.MUTED))
            }
        }
    }

    /** Looks for a newer build; `manual` also reports "up to date" / errors. */
    private fun checkForUpdate(manual: Boolean, note: TextView? = null) {
        io.execute {
            val r = try { Result.success(Updater.check(this)) } catch (e: Exception) { Result.failure(e) }
            ui.post {
                release = r.getOrNull()
                showBanner()
                if (manual) note?.text = when {
                    r.isFailure -> "Couldn't check: ${r.exceptionOrNull()?.message}"
                    release != null -> "Version ${release!!.name} is available — tap the orange bar."
                    else -> "You have the latest version (${BuildConfig.VERSION_NAME})."
                }
            }
        }
    }

    private fun showBanner(text: String? = null) {
        val rel = release
        banner.removeAllViews()
        if (rel == null) { banner.visibility = android.view.View.GONE; return }
        banner.visibility = android.view.View.VISIBLE
        banner.addView(TabIcon(this, "update").apply { color = Color.WHITE }, LinearLayout.LayoutParams(Ui.dp(this, 22), Ui.dp(this, 22)))
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(Ui.dp(this@AppActivity, 10), 0, 0, 0) }
        col.addView(Ui.text(this, text ?: "Update to ${rel.name}", 14f, Color.WHITE, true))
        col.addView(Ui.text(this, if (text != null) "" else rel.notes.ifEmpty { "Tap to download and install." }, 12f, Color.WHITE))
        banner.addView(col, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
    }

    private var downloading = false
    private fun installUpdate() {
        val rel = release ?: return
        if (downloading) return
        downloading = true
        io.execute {
            val file = try {
                // the link only lives 10 minutes — fetch a fresh one each time
                val fresh = Updater.check(this) ?: rel
                Updater.download(this, fresh) { pct -> ui.post { showBanner(if (pct >= 0) "Downloading… $pct%" else "Downloading…") } }
            } catch (e: Exception) {
                ui.post { downloading = false; showBanner("Download failed — tap to retry") }
                null
            }
            if (file != null) ui.post {
                downloading = false
                if (Updater.install(this, file)) showBanner("Installing ${rel.name}…")
                else showBanner("Allow Ascent to install updates, then tap here again")
            }
        }
    }

    /** Token entry — first run, or the ⚙ button. */
    private fun showSettings() {
        generation++
        tabViews.values.forEach { it.setTextColor(Ui.MUTED) }
        tabIcons.values.forEach { it.color = Ui.MUTED }
        status.text = ""
        val col = page()
        col.addView(Ui.text(this, "Your data, in the app", 18f, Ui.TEXT, true).apply { setPadding(0, Ui.dp(this@AppActivity, 8), 0, 0) })
        col.addView(Ui.text(this,
            "The app reads your rides, stats, power, sleep and spending from your dashboard's own database. " +
                "Give it a Personal API token:\n\n" +
                "1. Open the dashboard (button below) → Settings → Personal API.\n" +
                "2. Name it \"Android\" and tap Create token.\n" +
                "3. Copy the asc_… token and paste it here.\n\n" +
                "The token stays on this phone. Revoke it in the dashboard any time.", 13f, Ui.MUTED).apply {
            setPadding(0, Ui.dp(this@AppActivity, 8), 0, Ui.dp(this@AppActivity, 12))
        })
        col.addView(Ui.heading(this, "Personal API token"))
        val field = EditText(this).apply {
            setText(Api.token(this@AppActivity))
            hint = "asc_…"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            setTextColor(Color.WHITE); setHintTextColor(Ui.MUTED)
            setSingleLine(true)
        }
        col.addView(field, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        val note = Ui.text(this, "", 12f, Ui.MUTED).apply { setPadding(0, Ui.dp(this@AppActivity, 8), 0, 0) }
        col.addView(button("Save") {
            val t = field.text.toString().trim()
            if (!t.startsWith("asc_")) { note.text = "That isn't a Personal API token — it starts with asc_."; note.setTextColor(Ui.RED); return@button }
            Api.setToken(this, t)
            note.text = "Checking…"; note.setTextColor(Ui.MUTED)
            io.execute {
                val err = try { Api.get(this, ""); null } catch (e: Exception) { e.message }
                ui.post {
                    if (err != null) { note.text = err; note.setTextColor(Ui.RED); return@post }
                    io.execute { try { Repo.refresh(this) } catch (e: Exception) {}; AscentWidget.drawAll(this) }
                    show("home")
                }
            }
        })
        col.addView(note)
        col.addView(button("Open the dashboard") { startActivity(Intent(this, MainActivity::class.java)) })
        if (Api.hasToken(this)) col.addView(button("Remove token from this phone") {
            Api.setToken(this, ""); showSettings()
        })
        col.addView(Ui.text(this, "Home-screen widgets use the same token. Long-press a widget for its own settings.", 11f, Ui.MUTED).apply {
            setPadding(0, Ui.dp(this@AppActivity, 16), 0, 0)
        })
        col.addView(Ui.heading(this, "App version ${BuildConfig.VERSION_NAME}"))
        val upNote = Ui.text(this, "", 12f, Ui.MUTED)
        col.addView(button("Check for updates") { upNote.text = "Checking…"; checkForUpdate(true, upNote) })
        col.addView(upNote)
    }

    fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = Ui.dp(this@AppActivity, 10) }
    }

    fun openRide(a: JSONObject) {
        startActivity(Intent(this, RideActivity::class.java).putExtra("activity", a.toString()))
    }
}
