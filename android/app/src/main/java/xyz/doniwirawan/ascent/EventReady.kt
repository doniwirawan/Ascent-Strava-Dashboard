package xyz.doniwirawan.ascent

import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import org.json.JSONObject
import java.time.LocalDate
import java.util.Locale

/**
 * Training → Event readiness, the website's js/event-ready.js: pick a target
 * (100 km, a BRM, Bentang Jawa, custom) and get a score from your own ride
 * history — longest ride, weekly volume, fitness (CTL), best 3-day block —
 * plus a finish-time estimate against the cutoff and a plan. Rules of thumb.
 */
object EventReady {
    class Preset(val id: String, val name: String, val km: Double, val elev: Double, val limit: Double, val audax: Boolean = false, val ultra: Boolean = false)

    val PRESETS = listOf(
        Preset("r100", "100 km", 100.0, 1000.0, 0.0),
        Preset("r200", "200 km", 200.0, 2000.0, 0.0),
        Preset("brm200", "BRM 200", 200.0, 2000.0, 13.5, audax = true),
        Preset("brm300", "BRM 300", 300.0, 3000.0, 20.0, audax = true),
        Preset("brm400", "BRM 400", 400.0, 4000.0, 27.0, audax = true),
        Preset("brm600", "BRM 600", 600.0, 6000.0, 40.0, audax = true),
        Preset("bjawa", "Bentang Jawa", 1500.0, 16000.0, 156.0, ultra = true),
        Preset("custom", "Custom", 150.0, 1500.0, 0.0),
    )

    class Target(var id: String, var km: Double, var elev: Double, var limit: Double, var date: String)

    fun target(a: AppActivity): Target {
        val s = try { JSONObject(Repo.prefs(a).getString("evt_target", null) ?: "{}") } catch (e: Exception) { JSONObject() }
        val p = PRESETS.find { it.id == s.optString("id") } ?: PRESETS[2]
        return Target(p.id, s.optDouble("km", p.km), s.optDouble("elev", p.elev), s.optDouble("limit", p.limit), s.optString("date"))
    }

    private fun save(a: AppActivity, t: Target) = Repo.prefs(a).edit().putString("evt_target",
        JSONObject().put("id", t.id).put("km", t.km).put("elev", t.elev).put("limit", t.limit).put("date", t.date).toString()).apply()

    private fun interp(tbl: List<Pair<Double, Double>>, x: Double): Double {
        if (x <= tbl[0].first) return tbl[0].second
        for (i in 1 until tbl.size) {
            val (x1, y1) = tbl[i]; val (x0, y0) = tbl[i - 1]
            if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
        }
        return tbl.last().second
    }

    class Needs(val longest: Double, val weekly: Double, val ctl: Double, val block3: Double)

    /** What the event asks for, by distance (km). */
    internal fun needs(km: Double) = Needs(
        longest = if (km <= 300) 0.7 * km else minOf(400.0, 0.75 * km),
        weekly = minOf(400.0, 40 + 0.55 * km),
        ctl = interp(listOf(100.0 to 35.0, 200.0 to 50.0, 300.0 to 60.0, 400.0 to 65.0, 600.0 to 75.0, 1500.0 to 85.0), km),
        block3 = if (km >= 600) minOf(500.0, 0.5 * km) else 0.0,
    )

    class History(val longestKm: Double, val weekly: Double, val block3: Double, val vEq: Double, val dRef: Double, val stop: Double, val nRef: Int)

    private fun day(x: JSONObject) = x.optString("start_date_local").ifEmpty { x.optString("start_date") }.take(10)

    private fun median(l: List<Double>): Double {
        val s = l.sorted(); val m = s.size / 2
        return if (s.isEmpty()) 0.0 else if (s.size % 2 == 1) s[m] else (s[m - 1] + s[m]) / 2
    }

    /** What your history shows. Real rides only (no e-bike). */
    internal fun history(acts: List<JSONObject>, today: LocalDate = LocalDate.now()): History {
        val from84 = today.minusDays(84).toString(); val from56 = today.minusDays(56).toString(); val from182 = today.minusDays(182).toString()
        val rides = acts.filter { Screens.isRide(it) && it.optString("type") != "EBikeRide" && it.optDouble("distance") > 0 && it.optDouble("moving_time") > 0 && day(it).length == 10 }
        var longest = 0.0; var km56 = 0.0
        val byDay = HashMap<String, Double>()
        for (r in rides) {
            val k = day(r); val km = r.optDouble("distance") / 1000
            if (k >= from84) { longest = maxOf(longest, km); byDay[k] = (byDay[k] ?: 0.0) + km }
            if (k >= from56) km56 += km
        }
        var block3 = 0.0
        var d = today.minusDays(84)
        while (!d.isAfter(today)) {
            block3 = maxOf(block3, (0..2L).sumOf { byDay[d.plusDays(it).toString()] ?: 0.0 })
            d = d.plusDays(1)
        }
        // pace reference: the 5 longest rides of the last 6 months (≥ 40 km)
        var ref = rides.filter { day(it) >= from182 && it.optDouble("distance") >= 40000 }
        if (ref.size < 3) ref = rides.filter { it.optDouble("distance") >= 30000 }
        ref = ref.sortedByDescending { it.optDouble("distance") }.take(5)
        // flat-equivalent speed: every 100 m of climbing costs about 2 km of flat
        val vEq = median(ref.map { (it.optDouble("distance") / 1000 + 0.02 * it.optDouble("total_elevation_gain", 0.0)) / (it.optDouble("moving_time") / 3600) })
        val dRef = median(ref.map { it.optDouble("distance") / 1000 })
        val stop = median(ref.map { it.optDouble("elapsed_time", 0.0).takeIf { e -> e > 0 }.let { e -> (e ?: it.optDouble("moving_time")) / it.optDouble("moving_time") } })
        return History(longest, km56 / 8, block3, vEq, dRef, stop, ref.size)
    }

    class Finish(val moving: Double, val total: Double, val sleep: Double, val nights: Int, val v: Double, val stopR: Double)

    /** Finish-time estimate in hours, or null without long rides to go on. */
    internal fun finish(km: Double, elev: Double, h: History): Finish? {
        if (h.vEq <= 0) return null
        val fatigue = maxOf(0.75, Math.pow(h.dRef / km, 0.07))   // longer = slower
        val v = h.vEq * minOf(1.0, fatigue)
        val moving = (km + 0.02 * elev) / v
        // stops grow with distance: at least 12%, brevets ~20–25%, self-supported ultras ~35%
        val stopR = minOf(1.5, maxOf(if (h.stop > 0) h.stop else 1.0, if (km >= 1000) 1.35 else if (km >= 600) 1.25 else if (km >= 300) 1.2 else 1.12))
        val awake = moving * stopR
        val nights = maxOf(0, Math.ceil(awake / 20).toInt() - 1)
        val sleep = nights * (if (km >= 1000) 5.0 else 2.5)
        return Finish(moving, awake + sleep, sleep, nights, v, stopR)
    }

    class Factor(val label: String, val have: Double, val need: Double, val unit: String, val w: Int)

    internal fun factors(n: Needs, h: History, ctl: Double) = listOfNotNull(
        Factor("Longest ride · 12 wk", h.longestKm, n.longest, "km", 35),
        Factor("Weekly volume · 8 wk avg", h.weekly, n.weekly, "km/wk", 25),
        Factor("Fitness (CTL)", ctl, n.ctl, "", 25),
        if (n.block3 > 0) Factor("Best 3-day block · 12 wk", h.block3, n.block3, "km", 15) else null,
    )

    /** 0–100; capped at 60 when the estimate misses the cutoff. */
    internal fun score(f: List<Factor>, overCut: Boolean): Int {
        var s = f.sumOf { it.w * minOf(1.0, if (it.need > 0) it.have / it.need else 1.0) } / f.sumOf { it.w } * 100
        if (overCut) s = minOf(s, 60.0)
        return Math.round(s).toInt()
    }

    /** Weeks of building to close the gaps: long ride +12%/wk, volume +10%/wk, CTL +5/wk. */
    internal fun weeks(n: Needs, h: History, ctl: Double): Int {
        fun grow(have: Double, need: Double, r: Double) = if (have >= need) 0 else Math.ceil(Math.log(need / maxOf(have, need * 0.25)) / Math.log(1 + r)).toInt()
        return maxOf(grow(h.longestKm, n.longest, 0.12), grow(h.weekly, n.weekly, 0.10),
            if (ctl >= n.ctl) 0 else Math.ceil((n.ctl - ctl) / 5).toInt(), if (n.block3 > 0) grow(h.block3, n.block3, 0.12) else 0)
    }

    internal fun hrs(h: Double): String {
        if (h >= 48) { val d = Math.floor(h / 24).toInt(); return "${d}d ${Math.round(h - d * 24)}h" }
        val hh = Math.floor(h).toInt(); val m = Math.round((h - hh) * 60).toInt()
        return if (m == 60) "${hh + 1}h" else String.format(Locale.US, "%dh %02dm", hh, m)
    }

    private val YELLOW = 0xFFEAB308.toInt()
    private val AMBER = 0xFFFB923C.toInt()

    /** The card, added to `col` on the Training page. */
    fun card(a: AppActivity, col: LinearLayout, acts: List<JSONObject>, ctl: Double) {
        if (acts.none { Screens.isRide(it) }) return
        val t = target(a)
        val preset = PRESETS.find { it.id == t.id } ?: PRESETS[0]
        val n = needs(t.km); val h = history(acts)
        val f = factors(n, h, ctl)
        val fin = finish(t.km, t.elev, h)
        val overCut = t.limit > 0 && fin != null && fin.total > t.limit
        val sc = score(f, overCut)
        val (verdict, vc) = when { sc >= 90 -> "Ready" to Ui.GREEN; sc >= 70 -> "Almost there" to YELLOW; sc >= 45 -> "Needs building" to AMBER; else -> "Not yet" to Ui.RED }
        val wk = weeks(n, h, ctl)
        val weeksLeft = runCatching { Math.floorDiv(LocalDate.parse(t.date).toEpochDay() - LocalDate.now().toEpochDay(), 7L).toInt() }.getOrNull()

        col.addView(Ui.heading(a, "Event readiness"))
        col.addView(Ui.card(a).apply {
            addView(Ui.text(a, "How ready are you for a target ride?", 12f, Ui.MUTED))
            // presets
            val chips = LinearLayout(a)
            PRESETS.forEach { p ->
                chips.addView(Ui.text(a, p.name, 13f, if (p.id == t.id) android.graphics.Color.WHITE else Ui.MUTED, true).apply {
                    val pd = Ui.dp(a, 8); setPadding(pd + pd / 2, pd, pd + pd / 2, pd)
                    background = GradientDrawable().apply { setColor(if (p.id == t.id) Ui.ORANGE else Ui.LINE); cornerRadius = Ui.dp(a, 14).toFloat() }
                    setOnClickListener {
                        save(a, if (p.id == "custom") t.also { it.id = "custom" } else Target(p.id, p.km, p.elev, p.limit, t.date))
                        a.show(a.currentPage())
                    }
                }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { setMargins(0, Ui.dp(a, 8), Ui.dp(a, 6), Ui.dp(a, 4)) })
            }
            addView(android.widget.HorizontalScrollView(a).apply { isHorizontalScrollBarEnabled = false; addView(chips) })
            // distance, elevation, cutoff, date
            fun num(v: Double) = if (v > 0) (if (v % 1 == 0.0) Math.round(v).toString() else v.toString()) else ""
            fun field(hint: String, v: String, type: Int) = EditText(a).apply {
                this.hint = hint; setText(v); inputType = type; textSize = 14f; setTextColor(Ui.TEXT); setHintTextColor(Ui.MUTED)
            }
            val dec = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            val km = field("Distance (km)", num(t.km), dec); val elev = field("Elevation (m)", num(t.elev), dec)
            val limit = field("Cutoff (h)", num(t.limit), dec); val date = field("Event date (YYYY-MM-DD)", t.date, InputType.TYPE_CLASS_DATETIME or InputType.TYPE_DATETIME_VARIATION_DATE)
            listOf(km to elev, limit to date).forEach { (l, r) ->
                addView(LinearLayout(a).apply {
                    addView(l, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                    addView(r, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                })
            }
            addView(Ui.text(a, "Update", 13f, Ui.ORANGE, true).apply {
                setPadding(0, Ui.dp(a, 4), 0, Ui.dp(a, 8))
                setOnClickListener {
                    fun v(e: EditText) = maxOf(0.0, e.text.toString().toDoubleOrNull() ?: 0.0)
                    val d = date.text.toString().trim().takeIf { runCatching { LocalDate.parse(it) }.isSuccess } ?: ""
                    val changed = v(km) != t.km || v(elev) != t.elev || v(limit) != t.limit
                    save(a, Target(if (changed) "custom" else t.id, if (v(km) > 0) v(km) else 1.0, v(elev), v(limit), d))
                    a.show(a.currentPage())
                }
            })
            // score + verdict + timeline
            addView(LinearLayout(a).apply {
                gravity = Gravity.CENTER_VERTICAL
                addView(Ui.text(a, "$sc%", 34f, vc, true).apply { setPadding(0, 0, Ui.dp(a, 14), 0) })
                addView(LinearLayout(a).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(Ui.text(a, verdict, 16f, vc, true))
                    var tl = if (wk == 0) "Your numbers already meet the target." else "About $wk week${if (wk > 1) "s" else ""} of steady building to close the gaps."
                    if (weeksLeft != null) tl += if (weeksLeft < 0) " (The event date has passed.)" else {
                        val ok = wk + 1 <= weeksLeft   // +1 week taper
                        " You have $weeksLeft week${if (weeksLeft != 1) "s" else ""} until the event" + if (ok) " — enough, with a taper week before." else " — tight; consider a shorter target first."
                    }
                    addView(Ui.text(a, tl, 12f, Ui.TEXT))
                }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            })
            // factor bars
            f.forEach { x ->
                val pct = minOf(100.0, if (x.need > 0) x.have / x.need * 100 else 100.0)
                val c = if (pct >= 100) Ui.GREEN else if (pct >= 70) YELLOW else AMBER
                addView(LinearLayout(a).apply {
                    setPadding(0, Ui.dp(a, 10), 0, Ui.dp(a, 4))
                    addView(Ui.text(a, x.label, 12f, Ui.MUTED), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                    addView(Ui.text(a, "${Math.round(x.have)} / ${Math.round(x.need)} ${x.unit}".trim(), 12f, c, true))
                })
                addView(LinearLayout(a).apply {
                    background = GradientDrawable().apply { setColor(Ui.LINE); cornerRadius = Ui.dp(a, 3).toFloat() }
                    addView(View(a).apply { background = GradientDrawable().apply { setColor(c); cornerRadius = Ui.dp(a, 3).toFloat() } },
                        LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, pct.toFloat()))
                    addView(View(a), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, (100 - pct).toFloat()))
                }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Ui.dp(a, 6)))
            }
            if (overCut) addView(Ui.text(a, "⚠ At your current long-ride pace the estimate is over the cutoff — speed on long rides is the limiter, not just distance.", 12f, Ui.RED, true).apply { setPadding(0, Ui.dp(a, 10), 0, 0) })
            // finish time
            if (fin != null) {
                addView(View(a), LinearLayout.LayoutParams(1, Ui.dp(a, 10)))
                addView(Ui.divider(a))
                addView(Ui.row(a, "Moving time", hrs(fin.moving)))
                addView(Ui.row(a, if (fin.nights > 0) "Total incl. stops + ${fin.nights} sleep${if (fin.nights > 1) "s" else ""}" else "Total incl. stops", hrs(fin.total)))
                if (t.limit > 0) {
                    val margin = t.limit - fin.total
                    addView(Ui.row(a, "Cutoff", hrs(t.limit)))
                    addView(Ui.row(a, "Margin", (if (margin >= 0) "+" else "−") + hrs(Math.abs(margin))).apply { (getChildAt(childCount - 1) as? android.widget.TextView)?.setTextColor(if (margin >= 0) Ui.GREEN else Ui.RED) })
                }
                val needV = if (t.limit > 0) (t.km + 0.02 * t.elev) / maxOf(0.1, (t.limit - fin.sleep) / fin.stopR) else 0.0
                addView(Ui.text(a, String.format(Locale.US, "Estimated from your %d longest recent rides (~%.1f km/h flat-equivalent at this distance, stops ×%.2f).", h.nRef, fin.v, fin.stopR) +
                    (if (t.limit > 0) String.format(Locale.US, " To make the cutoff you need ~%.1f km/h flat-equivalent moving.", needV) else ""), 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
            }
            // plan
            addView(Ui.text(a, "Plan", 14f, Ui.TEXT, true).apply { setPadding(0, Ui.dp(a, 12), 0, Ui.dp(a, 2)) })
            fun r10(x: Double) = Math.round(x / 10) * 10
            val tips = ArrayList<String>()
            if (h.longestKm < n.longest) {
                val next = minOf(r10(n.longest), maxOf(r10(h.longestKm * 1.12), r10(h.longestKm) + 10))
                tips.add("Next long ride: $next km, then add ~10–15% every 1–2 weeks up to ${r10(n.longest)} km.")
            } else tips.add("Your long ride (${Math.round(h.longestKm)} km) already covers it — keep one long ride every 1–2 weeks.")
            if (h.weekly < n.weekly) tips.add("Build weekly volume from ${Math.round(h.weekly)} toward ${r10(n.weekly)} km/wk (≤10% more per week, an easy week every 4th).")
            if (ctl < n.ctl) tips.add("Raise fitness (CTL) from ${Math.round(ctl)} toward ${Math.round(n.ctl)} — about +5 per week, mostly from more steady endurance hours rather than harder rides.")
            if (n.block3 > 0 && h.block3 < n.block3) tips.add("Practise back-to-back days: a 3-day block of ${r10(n.block3)} km teaches your body (and butt) to ride on tired legs.")
            if (preset.audax || t.km >= 300) tips.add("Ride at least one long training ride into the night — lights, reflective vest, and staying awake are part of the event.")
            if (preset.ultra || t.km >= 1000) tips.add("Self-supported ultra: test your full bikepacking setup, plan sleep stops (~4–5 h/night), resupply points and route navigation before race day.")
            tips.add("Fuel 60–90 g carbs and ~500–750 ml fluid per hour on anything over 4 hours, and practise it in training.")
            tips.forEach { addView(Ui.text(a, "•  $it", 13f, Ui.TEXT).apply { setPadding(0, Ui.dp(a, 3), 0, Ui.dp(a, 3)) }) }
            addView(Ui.text(a, "Rules of thumb from audax/ultra training practice applied to your Strava history — a guide, not a guarantee. Elevation defaults assume hilly (Bali-like) routes; edit them for the real course.", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
        })
    }
}
