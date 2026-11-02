package xyz.doniwirawan.ascent

import org.json.JSONObject

/**
 * More → Captions: the website's bulk caption tool (js/ai-coach.js bulkRun).
 * Pick activities — the ones still on Strava's default title ("Morning Ride")
 * are pre-filtered — and the server rewrites each title + description with AI
 * through the upload webhook's pipeline (POST /api/v1/activities/{id}/caption).
 * The private note is kept.
 */
object Captions {
    /** A title nobody wrote: Strava's "Morning Ride" / "Bersepeda Sore", or a Huawei sync name — website isDefaultTitle. */
    private val DEFAULT = listOf(
        Regex("^(morning|lunch|afternoon|evening|night)( (virtual|gravel|mountain bike|e-bike|e-mountain bike|trail|indoor|open water|weight|velomobile|handcycle))? (ride|run|walk|hike|swim|workout|activity|training|yoga|badminton|row|ski|skate)$", RegexOption.IGNORE_CASE),
        Regex("^(bersepeda|berlari|lari|berjalan|jalan|jalan kaki|berenang|renang|mendaki|hiking|latihan|olahraga)( (pagi|siang|sore|malam)( hari)?| di (luar|dalam) ruangan| di kolam| di perairan terbuka)$", RegexOption.IGNORE_CASE),
    )
    internal fun isDefaultTitle(name: String) = DEFAULT.any { it.matches(name.trim()) }

    private val picked = LinkedHashSet<String>()
    private var all = false                 // false: default titles only
    private var busy = false
    private var stop = false
    private var note = ""

    fun page(a: AppActivity): Unit = a.load(listOf("activities?limit=500")) { r ->
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities"))
        val shown = (if (all) acts else acts.filter { isDefaultTitle(it.optString("name")) }).take(150)
        val col = a.page()
        More.back(a, col, "Captions")
        col.addView(Ui.text(a, "Rewrites the Strava title and description with AI — the same writer as on upload (only the destination is ever named; the private note stays). It overwrites them and can't be undone.", 12f, Ui.MUTED))
        if (note.isNotEmpty()) col.addView(Ui.text(a, note, 12f, Ui.GREEN, true))
        if (busy) { col.addView(a.button("Stop") { stop = true; note = "Stopping…"; a.show("more:captions") }); return@load }
        col.addView(a.button(if (all) "Show default titles only" else "Show all activities") { all = !all; picked.clear(); a.show("more:captions") })
        if (shown.isEmpty()) { col.addView(Ui.text(a, "No activities still on a default title.", 13f, Ui.MUTED)); return@load }
        picked.retainAll(shown.map { it.optString("id") }.toSet())
        col.addView(a.button(if (picked.size == shown.size) "Clear selection" else "Select all ${shown.size}") {
            if (picked.size == shown.size) picked.clear() else shown.forEach { picked.add(it.optString("id")) }
            a.show("more:captions")
        })
        val go = a.button("") { if (picked.isNotEmpty()) confirm(a, acts.filter { it.optString("id") in picked }) }
        fun label() { go.text = "Rewrite ${picked.size} with AI"; go.visibility = if (picked.isEmpty()) android.view.View.GONE else android.view.View.VISIBLE }
        label()
        col.addView(go)
        col.addView(Ui.card(a).apply {
            shown.forEachIndexed { i, x ->
                if (i > 0) addView(Ui.divider(a))
                val id = x.optString("id")
                addView(Ui.row(a, x.optString("name"), if (id in picked) "✓" else "", Ui.date(x.optString("start_date_local")) + " · " + Ui.km(x.optDouble("distance"))).apply {
                    // toggled in place: a redraw would refetch the list and lose the scroll position
                    setOnClickListener { if (!picked.remove(id)) picked.add(id); (getChildAt(1) as android.widget.TextView).text = if (id in picked) "✓" else ""; label() }
                })
            }
        })
    }

    private fun confirm(a: AppActivity, list: List<JSONObject>) {
        android.app.AlertDialog.Builder(a).setTitle("Rewrite ${list.size} on Strava?")
            .setMessage("The title and description of ${list.size} ${if (list.size == 1) "activity" else "activities"} will be rewritten with AI. This overwrites them and can't be undone.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Rewrite") { _, _ -> run(a, list) }
            .show()
    }

    private fun run(a: AppActivity, list: List<JSONObject>) {
        busy = true; stop = false; note = "Rewriting 0 / ${list.size}…"; a.show("more:captions")
        Thread {
            var ok = 0; var failed = 0; var last = ""
            for ((i, x) in list.withIndex()) {
                if (stop) break
                val res = runCatching { Api.post(a, "activities/${x.optString("id")}/caption", JSONObject()) }
                if (res.isSuccess) { ok++; picked.remove(x.optString("id")); last = res.getOrNull()?.optString("name").orEmpty() } else failed++
                note = "Rewriting ${i + 1} / ${list.size}…" + if (last.isNotEmpty()) " Latest: $last" else ""
                a.ui.post { a.show("more:captions") }
            }
            runCatching { Api.get(a, "activities?limit=500") }       // new titles into the saved list
            busy = false
            note = (if (stop) "Stopped. " else "Done. ") + "Rewrote $ok" + if (failed > 0) ", $failed failed (AI or Strava unavailable)." else "."
            a.ui.post { a.show("more:captions") }
        }.start()
    }
}
