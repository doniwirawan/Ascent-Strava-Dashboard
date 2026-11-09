package xyz.doniwirawan.ascent

import android.content.Intent
import android.graphics.Color
import android.util.Base64
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The website's Plan section (js/plan.js) read through GET /api/v1/plan: the target
 *  event, this week's TSS (target / planned / done), today's workout and the next
 *  14 days. A structured workout is shared as a .fit file to the head unit's app.
 *  Planning and editing stay on the website. */
object Plan {
    private val PHASE = mapOf("base" to "Base", "build" to "Build", "peak" to "Peak", "taper" to "Taper", "race" to "Race")
    private val PHASE_COLOR = mapOf("base" to "#3B82F6", "build" to "#F97316", "peak" to "#EF4444", "taper" to "#A78BFA", "race" to "#22C55E", "rec" to "#64748B")

    private fun hm(secs: Long) = if (secs <= 0) "" else (secs / 3600).let { h -> val m = Math.round((secs % 3600) / 60.0); if (h > 0) "${h}h" + (if (m > 0) String.format(Locale.US, "%02d", m) else "") else "${m}m" }

    /** Website plCompliance: planned vs done TSS of a day. */
    internal fun compliance(planned: Double, done: Double, day: String, today: String): String = when {
        planned <= 0 -> if (done > 0) "extra" else ""
        day > today || (day == today && done <= 0) -> "future"
        done / planned in 0.8..1.2 -> "green"
        done / planned in 0.5..1.5 -> "yellow"
        done > 0 -> "orange"
        else -> "red"
    }
    private fun compColor(c: String) = when (c) { "green" -> Ui.GREEN; "yellow" -> Color.parseColor("#EAB308"); "orange" -> Color.parseColor("#F97316"); "red" -> Ui.RED; else -> Ui.MUTED }

    fun page(a: AppActivity): Unit = a.load(listOf("plan", "activities?limit=500", "me")) { r ->
        val p = r["plan"]
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities"))
        val col = a.page()
        More.back(a, col, "Plan")
        val ws = p?.optJSONArray("workouts")?.let { arr -> (0 until arr.length()).map { arr.getJSONObject(it) } } ?: emptyList()
        if (p == null || (ws.isEmpty() && p.optJSONObject("event") == null)) {
            col.addView(Ui.text(a, "No plan yet. Make one on the website (Plan section): pick an event, fill the weeks, and it shows here.", 13f, Ui.MUTED))
            return@load
        }
        // done TSS per day, same load model as the Training page
        val rides = acts.filter { Screens.isRide(it) }
        val stravaFtp = r["me"]?.optDouble("ftp", 0.0) ?: 0.0
        val bestNp = rides.filter { it.optBoolean("device_watts") && it.optLong("moving_time") >= 1200 }.maxOfOrNull { it.optDouble("weighted_average_watts", it.optDouble("average_watts", 0.0)) } ?: 0.0
        val ftp = if (stravaFtp > 0) stravaFtp else Math.round(bestNp * 0.95).toDouble()
        val hrMax = acts.maxOfOrNull { it.optDouble("max_heartrate", 0.0) } ?: 0.0
        val s = Training.series(acts, ftp, hrMax)
        val done = s?.days?.associate { it.date to it.load } ?: emptyMap()
        val today = LocalDate.now(); val t = today.toString()
        val mon = today.minusDays((today.dayOfWeek.value - 1).toLong())
        fun weekSum(f: (String) -> Double) = (0..6).sumOf { f(mon.plusDays(it.toLong()).toString()) }
        val plannedBy = ws.groupBy { it.optString("date") }.mapValues { (_, l) -> l.sumOf { it.optDouble("tss", 0.0) } }

        // event + this week
        val ev = p.optJSONObject("event")
        val wk = p.optJSONArray("weeks")?.let { arr -> (0 until arr.length()).map { arr.getJSONObject(it) } }?.firstOrNull { it.optString("mon") == mon.toString() }
        val phase = wk?.let { if (it.optBoolean("rec")) "rec" else it.optString("phase") }
        val tiles = ArrayList<Pair<String, String>>()
        val evDate = ev?.optString("date")?.takeIf { it.length == 10 && it >= t }
        if (evDate != null) tiles += "${java.time.temporal.ChronoUnit.DAYS.between(today, LocalDate.parse(evDate))}" to "days to ${ev.optString("name").ifEmpty { "the event" }}|time"
        if (wk != null) tiles += "${wk.optInt("tss")}" to "this week's target TSS · ${if (phase == "rec") "Recovery" else PHASE[phase] ?: ""}|effort"
        tiles += "${Math.round(weekSum { plannedBy[it] ?: 0.0 })}" to "planned this week|effort"
        tiles += "${Math.round(weekSum { done[it] ?: 0.0 })}" to "done this week|energy"
        col.addView(Ui.tiles(a, tiles))
        if (phase != null) col.addView(Ui.text(a, "Phase: ${if (phase == "rec") "Recovery week" else PHASE[phase]}", 12f, Color.parseColor(PHASE_COLOR[phase] ?: "#8A8A96"), true).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })

        // today, then the next 14 days, and the last 7 with their compliance
        fun section(title: String, list: List<JSONObject>) {
            if (list.isEmpty()) return
            col.addView(Ui.heading(a, title))
            col.addView(Ui.card(a).apply {
                list.forEachIndexed { i, w ->
                    if (i > 0) addView(Ui.divider(a))
                    val d = w.optString("date")
                    val comp = compliance(plannedBy[d] ?: 0.0, done[d] ?: 0.0, d, t)
                    val when_ = LocalDate.parse(d).format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.US))
                    val sub = listOfNotNull(when_, hm(w.optLong("secs")).ifEmpty { null }, "${w.optInt("tss")} TSS",
                        w.optDouble("if", 0.0).takeIf { it > 0 }?.let { String.format(Locale.US, "IF %.2f", it) },
                        if (comp in setOf("green", "yellow", "orange", "red")) "done ${Math.round(done[d] ?: 0.0)} TSS" else null).joinToString(" · ")
                    val row = Ui.row(a, w.optString("title"), if (w.optBoolean("structured")) ".fit ›" else "", sub)
                    ((row.getChildAt(0) as? android.widget.LinearLayout)?.getChildAt(0) as? android.widget.TextView)?.setTextColor(if (comp == "future") Ui.TEXT else compColor(comp))
                    if (w.optBoolean("structured")) row.setOnClickListener { shareFit(a, w.optString("id")) }
                    addView(row)
                    w.optString("notes").takeIf { it.isNotBlank() }?.let { addView(Ui.text(a, it, 11f, Ui.MUTED)) }
                    w.optString("text").takeIf { it.isNotBlank() && d == t }?.let { addView(Ui.text(a, it, 11f, Ui.MUTED).apply { typeface = android.graphics.Typeface.MONOSPACE }) }
                }
            })
        }
        section("Today", ws.filter { it.optString("date") == t })
        section("Next 14 days", ws.filter { it.optString("date") > t && it.optString("date") <= today.plusDays(14).toString() })
        section("Last 7 days", ws.filter { it.optString("date") < t && it.optString("date") >= today.minusDays(7).toString() }.reversed())
        col.addView(Ui.text(a, "Tap a structured workout to send its .fit to your head unit's app (iGPSport, Garmin Connect, Wahoo…). Colours: green on plan, yellow a bit off, orange well off, red missed. Plan and edit workouts on the website's Plan section.", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 10), 0, 0) })
    }

    /** Fetch the workout's .fit from the API and open the share sheet. */
    private fun shareFit(a: AppActivity, id: String) {
        android.widget.Toast.makeText(a, "Preparing .fit…", android.widget.Toast.LENGTH_SHORT).show()
        Thread {
            val res = runCatching {
                val r = Api.get(a, "plan/$id?fit=1")
                val dir = File(a.cacheDir, "share").apply { mkdirs() }
                File(dir, r.optString("filename", "workout.fit")).apply { writeBytes(Base64.decode(r.getString("fit_base64"), Base64.DEFAULT)) }
            }
            a.ui.post {
                res.onSuccess { f ->
                    val uri = FileProvider.getUriForFile(a, "${a.packageName}.files", f)
                    a.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                        type = "application/octet-stream"; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }, "Send workout to…"))
                }.onFailure { android.widget.Toast.makeText(a, "Couldn't make the .fit: ${it.message}", android.widget.Toast.LENGTH_LONG).show() }
            }
        }.start()
    }
}
