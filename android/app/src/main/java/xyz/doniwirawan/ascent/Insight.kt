package xyz.doniwirawan.ascent

import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

/**
 * The website's AI insight on each page (js/ai-coach.js aiSectionInsight): the
 * page's visible text goes to your AI (AI → Settings) for one connecting
 * insight. Saved per page and shown straight from the phone; rewritten only when
 * the page's numbers changed and the saved one is over a week old, or on ↻.
 * Nothing is sent without an AI key. No page shows where rides start.
 */
object Insight {
    private const val MAX_AGE = 7 * 86_400_000L
    private val SKIP = setOf("more", "more:chase", "more:gps", "more:data", "more:photos")
    private val SYS = "You are a sharp, neutral sports-data analyst. From what is shown on one dashboard page, surface ONE specific, non-obvious insight that CONNECTS multiple numbers — e.g. how speed relates to distance or elevation, a trend across weeks/months, the balance between sports, consistency, or an outlier and what it implies. " +
        "Do NOT just praise a single headline stat (like top speed) and do NOT use motivational filler or exclamations. Use ONLY the numbers given; never invent data or mention metrics that are not present. Reply in English. 1–2 plain sentences, max 40 words. No headings, no preamble."

    /** The page's text, top to bottom, without input fields or a previous insight. */
    internal fun text(v: View): String {
        val out = StringBuilder()
        fun walk(x: View) { when {
            x.tag == "insight" || x is EditText -> {}
            x is TextView -> x.text.toString().trim().takeIf { it.isNotEmpty() && it != "›" }?.let { out.append(it).append('\n') }
            x is ViewGroup -> for (i in 0 until x.childCount) walk(x.getChildAt(i))
        } }
        walk(v)
        return out.toString().replace(Regex("[ \t]{2,}"), " ").trim().take(1800)
    }

    private fun hash(s: String): String { var h = 0; for (c in s) h = h * 31 + c.code; return h.toString(36) }

    /** Puts the page's insight card on [content]; asks the AI only when [final] (the fresh draw) and needed. */
    fun add(a: AppActivity, page: String, content: LinearLayout, final: Boolean, force: Boolean = false) {
        if (page in SKIP || Coach.key(a).isBlank()) return
        val txt = text(content)
        if (txt.length < 30) return
        val prefs = Repo.prefs(a); val key = "ai_ins_$page"; val sig = hash(txt)
        val saved = runCatching { JSONObject(prefs.getString(key, "{}")!!) }.getOrNull()
        for (i in content.childCount - 1 downTo 0) if (content.getChildAt(i).tag == "insight") content.removeViewAt(i)
        val body = Ui.text(a, saved?.optString("text").orEmpty().ifEmpty { "…" }, 13f, Ui.TEXT)
        val card = Ui.card(a).apply {
            tag = "insight"
            addView(LinearLayout(a).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(Ui.text(a, "✦ AI insight", 11f, Ui.ORANGE, true), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                addView(Ui.text(a, "↻", 15f, Ui.MUTED, true).apply { setPadding(Ui.dp(a, 12), 0, 0, 0); setOnClickListener { add(a, page, content, true, true) } })
            })
            addView(body)
        }
        content.addView(card, if (page.startsWith("more:")) minOf(2, content.childCount) else 0)
        val fresh = saved != null && saved.optString("text").isNotEmpty() && (saved.optString("sig") == sig || System.currentTimeMillis() - saved.optLong("at") < MAX_AGE)
        if (!final || (fresh && !force)) { if (saved?.optString("text").isNullOrEmpty()) content.removeView(card); return }
        body.text = "…"
        Thread {
            val reply = runCatching { Coach.once(a, SYS, "This is the \"${label(page)}\" page. On-screen content (headings and stats):\n\"\"\"\n$txt\n\"\"\"\nGive one analytical insight connecting these numbers.", 160).trim() }.getOrNull()
            if (reply != null) prefs.edit().putString(key, JSONObject().put("sig", sig).put("text", reply).put("at", System.currentTimeMillis()).toString()).apply()
            a.ui.post { if (a.currentPage() == page) { if (reply != null) body.text = reply else if (saved?.optString("text").isNullOrEmpty()) content.removeView(card) else body.text = saved!!.optString("text") } }
        }.start()
    }

    private fun label(page: String) = mapOf("home" to "Overview", "rides" to "Activities", "power" to "Power", "sleep" to "Sleep & Recovery", "money" to "Money & gear")[page]
        ?: page.substringAfter(':').replaceFirstChar { it.uppercase() }
}
