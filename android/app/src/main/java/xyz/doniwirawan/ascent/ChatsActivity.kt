package xyz.doniwirawan.ascent

import android.app.Activity
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import android.widget.ScrollView
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Your AI Coach conversations from the website (/api/v1/ai/chats), read-only:
 * a list of chats, then one chat as message bubbles. Asking new questions
 * stays on the website, which holds the AI keys.
 */
class ChatsActivity : Activity() {

    private lateinit var col: LinearLayout
    private lateinit var scroll: ScrollView
    private var open: JSONObject? = null
    private val io = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        actionBar?.hide()
        window.statusBarColor = Ui.BG
        col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = Ui.dp(this@ChatsActivity, 16); setPadding(p, p, p, p)
        }
        scroll = ScrollView(this).apply { setBackgroundColor(Ui.BG); addView(col, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)) }
        setContentView(scroll)
        Api.cached(this, "ai/chats")?.let { showList(it) } ?: col.addView(Ui.text(this, "Loading…", 13f, Ui.MUTED))
        io.execute {
            val fresh = try { Api.get(this, "ai/chats") } catch (e: Exception) { null }
            ui.post { if (fresh != null && open == null) showList(fresh) }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (open != null) { open = null; Api.cached(this, "ai/chats")?.let { showList(it) } } else super.onBackPressed()
    }

    private fun showList(r: JSONObject) {
        col.removeAllViews()
        col.addView(Ui.text(this, "AI Coach", 20f, Ui.TEXT, true))
        col.addView(Ui.text(this, "Your conversations from the website. Ask new questions there (Web → AI Coach).", 12f, Ui.MUTED).apply { setPadding(0, Ui.dp(this@ChatsActivity, 4), 0, Ui.dp(this@ChatsActivity, 12)) })
        val chats = r.optJSONArray("chats") ?: JSONArray()
        if (chats.length() == 0) { col.addView(Ui.text(this, "No saved conversations yet.", 13f, Ui.MUTED)); return }
        val c = Ui.card(this)
        for (i in 0 until chats.length()) {
            val chat = chats.getJSONObject(i)
            if (i > 0) c.addView(Ui.divider(this))
            val n = chat.optJSONArray("messages")?.length() ?: 0
            c.addView(Ui.row(this, chat.optString("title").ifEmpty { "Chat" }, "$n",
                SimpleDateFormat("d MMM yyyy, HH:mm", Locale.getDefault()).format(Date(chat.optLong("ts")))).apply {
                setOnClickListener { showChat(chat) }
            })
        }
        col.addView(c)
    }

    private fun showChat(chat: JSONObject) {
        open = chat
        col.removeAllViews()
        col.addView(Ui.text(this, chat.optString("title").ifEmpty { "Chat" }, 17f, Ui.TEXT, true).apply { setPadding(0, 0, 0, Ui.dp(this@ChatsActivity, 12)) })
        val msgs = chat.optJSONArray("messages") ?: JSONArray()
        for (i in 0 until msgs.length()) {
            val m = msgs.getJSONObject(i)
            val mine = m.optString("role") == "user"
            if (m.optString("role") == "system") continue
            val bubble = Ui.text(this, m.optString("content").replace(Regex("\\*\\*(.+?)\\*\\*"), "$1").replace(Regex("^#+ ", RegexOption.MULTILINE), ""), 14f, Ui.TEXT).apply {
                val p = Ui.dp(this@ChatsActivity, 12); setPadding(p, p * 3 / 4, p, p * 3 / 4)
                background = GradientDrawable().apply { setColor(if (mine) Ui.ORANGE else Ui.CARD); cornerRadius = Ui.dp(this@ChatsActivity, 14).toFloat() }
                setTextIsSelectable(true)
            }
            col.addView(bubble, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
                gravity = if (mine) Gravity.END else Gravity.START
                topMargin = Ui.dp(this@ChatsActivity, 8)
                if (mine) marginStart = Ui.dp(this@ChatsActivity, 48) else marginEnd = Ui.dp(this@ChatsActivity, 24)
            })
        }
        scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }
}
