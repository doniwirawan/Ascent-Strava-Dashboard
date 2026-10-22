package xyz.doniwirawan.ascent

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
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
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * AI Coach: ask about your training with your own AI key (Coach.kt), plus your
 * website conversations to read back (/api/v1/ai/chats).
 */
class ChatsActivity : Activity() {

    private lateinit var col: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var inputBar: LinearLayout
    private lateinit var input: EditText
    private var mode = "chat"                      // chat | settings | web
    private val io = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())
    private var busy = false

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        actionBar?.hide()
        window.statusBarColor = Ui.BG
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Ui.BG) }
        col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = Ui.dp(this@ChatsActivity, 16); setPadding(p, p, p, p)
        }
        scroll = ScrollView(this).apply { addView(col, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)) }
        root.addView(scroll, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        inputBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Ui.CARD)
            val p = Ui.dp(this@ChatsActivity, 8); setPadding(p * 2, p, p, p)
        }
        input = EditText(this).apply {
            hint = "Ask your coach…"; setTextColor(Ui.TEXT); setHintTextColor(Ui.MUTED); maxLines = 4
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        }
        inputBar.addView(input, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        inputBar.addView(Ui.text(this, "Send", 15f, Ui.ORANGE, true).apply {
            val p = Ui.dp(this@ChatsActivity, 12); setPadding(p, p, p, p)
            setOnClickListener { send(input.text.toString()) }
        })
        root.addView(inputBar)
        setContentView(root)
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        if (Coach.key(this).isBlank()) showSettings() else showChat()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (mode != "chat" && Coach.key(this).isNotBlank()) showChat() else super.onBackPressed()
    }

    private fun header(title: String, vararg links: Pair<String, () -> Unit>) {
        val h = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        h.addView(Ui.text(this, title, 20f, Ui.TEXT, true), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        links.forEach { (label, go) ->
            h.addView(Ui.text(this, label, 13f, Ui.ORANGE, true).apply {
                setPadding(Ui.dp(this@ChatsActivity, 12), Ui.dp(this@ChatsActivity, 6), 0, Ui.dp(this@ChatsActivity, 6)); setOnClickListener { go() }
            })
        }
        col.addView(h)
    }

    // ── chat ────────────────────────────────────────────────────────────────
    private fun showChat() {
        mode = "chat"; inputBar.visibility = android.view.View.VISIBLE
        col.removeAllViews()
        header("AI Coach", "Website chats" to { showWebList() }, "Settings" to { showSettings() })
        val p = Coach.provider(this)
        col.addView(Ui.text(this, "${p.name} · ${Coach.model(this)} · it sees your stats, rides, power and sleep (never where you live)", 11f, Ui.MUTED).apply {
            setPadding(0, Ui.dp(this@ChatsActivity, 4), 0, Ui.dp(this@ChatsActivity, 8))
        })
        val hist = Coach.history(this)
        if (hist.length() == 0) {
            col.addView(Ui.text(this, "Try:", 12f, Ui.MUTED))
            listOf("How did my last 7 days go?", "Am I recovered enough for a hard ride today?", "Plan my next week of riding",
                "How has my sleep been, and is it hurting my training?").forEach { q ->
                col.addView(Ui.text(this, q, 13f, Ui.TEXT).apply {
                    val pd = Ui.dp(this@ChatsActivity, 12); setPadding(pd, pd * 3 / 4, pd, pd * 3 / 4)
                    background = GradientDrawable().apply { setColor(Ui.CARD); cornerRadius = Ui.dp(this@ChatsActivity, 12).toFloat(); setStroke(Ui.dp(this@ChatsActivity, 1), Ui.LINE) }
                    setOnClickListener { send(q) }
                }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = Ui.dp(this@ChatsActivity, 8) })
            }
        } else {
            for (i in 0 until hist.length()) bubble(hist.getJSONObject(i))
            col.addView(Ui.text(this, "New conversation", 12f, Ui.MUTED).apply {
                setPadding(0, Ui.dp(this@ChatsActivity, 16), 0, 0); gravity = Gravity.CENTER
                setOnClickListener { Coach.clear(this@ChatsActivity); showChat() }
            }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        }
        scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    private fun bubble(m: JSONObject): TextView {
        val mine = m.optString("role") == "user"
        val t = Ui.text(this, m.optString("content").replace(Regex("\\*\\*(.+?)\\*\\*"), "$1").replace(Regex("^#+ ", RegexOption.MULTILINE), ""), 14f, Ui.TEXT).apply {
            val p = Ui.dp(this@ChatsActivity, 12); setPadding(p, p * 3 / 4, p, p * 3 / 4)
            background = GradientDrawable().apply { setColor(if (mine) Ui.ORANGE else Ui.CARD); cornerRadius = Ui.dp(this@ChatsActivity, 14).toFloat() }
            setTextIsSelectable(true)
        }
        col.addView(t, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
            gravity = if (mine) Gravity.END else Gravity.START
            topMargin = Ui.dp(this@ChatsActivity, 8)
            if (mine) marginStart = Ui.dp(this@ChatsActivity, 48) else marginEnd = Ui.dp(this@ChatsActivity, 24)
        })
        return t
    }

    private fun send(q: String) {
        val text = q.trim()
        if (text.isEmpty() || busy) return
        if (Coach.key(this).isBlank()) { showSettings(); return }
        busy = true
        input.setText("")
        if (Coach.history(this).length() == 0) { col.removeAllViews(); header("AI Coach", "Website chats" to { showWebList() }, "Settings" to { showSettings() }) }
        bubble(JSONObject().put("role", "user").put("content", text))
        val wait = bubble(JSONObject().put("role", "assistant").put("content", "Thinking…"))
        scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
        io.execute {
            val r = try { Result.success(Coach.ask(this, text)) } catch (e: Exception) { Result.failure(e) }
            ui.post {
                busy = false
                if (r.isSuccess) showChat()
                else { wait.text = r.exceptionOrNull()?.message ?: "Something went wrong."; wait.setTextColor(Ui.RED) }
            }
        }
    }

    // ── key settings ────────────────────────────────────────────────────────
    private fun showSettings() {
        mode = "settings"; inputBar.visibility = android.view.View.GONE
        col.removeAllViews()
        header("AI settings")
        col.addView(Ui.text(this, "Paste a key from your AI provider. It stays on this phone and is only sent to that provider. " +
            "DeepSeek is the cheapest; OpenRouter lets one key use many models.", 13f, Ui.MUTED).apply { setPadding(0, Ui.dp(this@ChatsActivity, 6), 0, 0) })
        col.addView(Ui.heading(this, "Provider"))
        var chosen = Coach.provider(this).id
        val chips = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val model = EditText(this)
        fun drawChips() {
            chips.removeAllViews()
            Coach.PROVIDERS.chunked(3).forEach { rowList ->
                val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                rowList.forEach { p ->
                    row.addView(Ui.text(this, p.name, 13f, if (p.id == chosen) Color.WHITE else Ui.MUTED, true).apply {
                        gravity = Gravity.CENTER
                        val pd = Ui.dp(this@ChatsActivity, 10); setPadding(pd, pd, pd, pd)
                        background = GradientDrawable().apply { setColor(if (p.id == chosen) Ui.ORANGE else Ui.CARD); cornerRadius = Ui.dp(this@ChatsActivity, 10).toFloat() }
                        setOnClickListener { chosen = p.id; model.hint = "Model (default ${p.model})"; drawChips() }
                    }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { setMargins(Ui.dp(this@ChatsActivity, 3), Ui.dp(this@ChatsActivity, 3), Ui.dp(this@ChatsActivity, 3), Ui.dp(this@ChatsActivity, 3)) })
                }
                chips.addView(row)
            }
        }
        drawChips()
        col.addView(chips)
        col.addView(Ui.heading(this, "API key"))
        val key = EditText(this).apply {
            setText(Coach.key(this@ChatsActivity)); hint = "sk-…"; setSingleLine(true)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setTextColor(Ui.TEXT); setHintTextColor(Ui.MUTED)
        }
        col.addView(key, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        model.apply {
            setText(Repo.prefs(this@ChatsActivity).getString("ai_model", "")); hint = "Model (default ${Coach.provider(this@ChatsActivity).model})"
            setSingleLine(true); setTextColor(Ui.TEXT); setHintTextColor(Ui.MUTED)
        }
        col.addView(model, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        val note = Ui.text(this, "", 12f, Ui.MUTED)
        col.addView(Button(this).apply {
            text = "Save"; isAllCaps = false
            setOnClickListener {
                if (key.text.isBlank()) { note.text = "Paste a key first."; note.setTextColor(Ui.RED); return@setOnClickListener }
                Coach.save(this@ChatsActivity, chosen, key.text.toString(), model.text.toString())
                showChat()
            }
        }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = Ui.dp(this@ChatsActivity, 12) })
        col.addView(note)
        if (Coach.key(this).isNotBlank()) col.addView(Button(this).apply {
            text = "Remove key from this phone"; isAllCaps = false
            setOnClickListener { Coach.save(this@ChatsActivity, chosen, "", ""); showSettings() }
        }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = Ui.dp(this@ChatsActivity, 8) })
        col.addView(Ui.text(this, "Your website chats are under Website chats.", 11f, Ui.MUTED).apply {
            setPadding(0, Ui.dp(this@ChatsActivity, 16), 0, 0); setOnClickListener { showWebList() }
        })
    }

    // ── website conversations (read-only) ──────────────────────────────────
    private fun showWebList() {
        mode = "web"; inputBar.visibility = android.view.View.GONE
        Api.cached(this, "ai/chats")?.let { listWeb(it) } ?: run { col.removeAllViews(); col.addView(Ui.text(this, "Loading…", 13f, Ui.MUTED)) }
        io.execute {
            val fresh = try { Api.get(this, "ai/chats") } catch (e: Exception) { null }
            ui.post { if (fresh != null && mode == "web") listWeb(fresh) }
        }
    }

    private fun listWeb(r: JSONObject) {
        col.removeAllViews()
        header("Website chats", "Back" to { if (Coach.key(this).isBlank()) showSettings() else showChat() })
        val chats = r.optJSONArray("chats") ?: JSONArray()
        if (chats.length() == 0) { col.addView(Ui.text(this, "No saved conversations yet.", 13f, Ui.MUTED)); return }
        val c = Ui.card(this)
        for (i in 0 until chats.length()) {
            val chat = chats.getJSONObject(i)
            if (i > 0) c.addView(Ui.divider(this))
            c.addView(Ui.row(this, chat.optString("title").ifEmpty { "Chat" }, "${chat.optJSONArray("messages")?.length() ?: 0}",
                SimpleDateFormat("d MMM yyyy, HH:mm", Locale.getDefault()).format(Date(chat.optLong("ts")))).apply { setOnClickListener { showWebChat(chat) } })
        }
        col.addView(c, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = Ui.dp(this@ChatsActivity, 10) })
    }

    private fun showWebChat(chat: JSONObject) {
        col.removeAllViews()
        header(chat.optString("title").ifEmpty { "Chat" }.take(40), "Back" to { showWebList() })
        val msgs = chat.optJSONArray("messages") ?: JSONArray()
        for (i in 0 until msgs.length()) { val m = msgs.getJSONObject(i); if (m.optString("role") != "system") bubble(m) }
        scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }
}
