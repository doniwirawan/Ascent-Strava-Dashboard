package xyz.doniwirawan.ascent

import android.widget.LinearLayout
import org.json.JSONObject
import java.time.LocalDate
import java.util.Locale

/**
 * More → Training: the website's Training page (js/training.js) — the load
 * model and fitness chart, form advice, recovery, consistency, FTP, run
 * predictions and the list-data insight cards. The AI plan is not here yet.
 */
object Training {
    private fun day(x: JSONObject) = x.optString("start_date_local").ifEmpty { x.optString("start_date") }.take(10)

    class Load(val load: Double, val basis: String)

    /** One activity's training load, website _trActivityLoad: power TSS, else Relative Effort, else HR-TRIMP, else duration. */
    internal fun load(a: JSONObject, ftp: Double, hrMax: Double, hrRest: Double = 60.0): Load? {
        val dur = a.optDouble("moving_time", a.optDouble("elapsed_time", 0.0))
        if (dur <= 0) return null
        val np = if (a.optBoolean("device_watts")) a.optDouble("weighted_average_watts", a.optDouble("average_watts", 0.0)) else 0.0
        if (np > 0 && ftp > 0) { val f = np / ftp; return Load(dur * np * f / (ftp * 3600) * 100, "power") }
        a.optDouble("suffer_score", 0.0).takeIf { it > 0 }?.let { return Load(it, "effort") }
        val hr = a.optDouble("average_heartrate", 0.0)
        if (hr > 0 && hrMax > hrRest) {
            val r = ((hr - hrRest) / (hrMax - hrRest)).coerceIn(0.0, 1.0)
            return Load(dur / 60 * r * 0.64 * Math.exp(1.92 * r) * 0.6, "hr")
        }
        return Load(dur / 3600 * 50, "time")
    }

    class Day(val date: String, val load: Double, val ctl: Double, val atl: Double) { val tsb get() = ctl - atl }
    class Series(val days: List<Day>, val basis: Map<String, Int>) {
        val last get() = days.last()
        val ramp get() = if (days.size > 7) last.ctl - days[days.size - 8].ctl else 0.0
    }

    /** CTL (42-day) and ATL (7-day) from the first activity to [today], website _trBuildSeries. */
    internal fun series(acts: List<JSONObject>, ftp: Double, hrMax: Double, today: LocalDate = LocalDate.now()): Series? {
        val byDay = HashMap<String, Double>(); val basis = HashMap<String, Int>()
        acts.forEach { a -> val k = day(a); if (k.length == 10) load(a, ftp, hrMax)?.let { byDay[k] = (byDay[k] ?: 0.0) + it.load; basis[it.basis] = (basis[it.basis] ?: 0) + 1 } }
        val first = byDay.keys.minOrNull() ?: return null
        val kC = 1 - Math.exp(-1.0 / 42); val kA = 1 - Math.exp(-1.0 / 7)
        var ctl = 0.0; var atl = 0.0
        val out = ArrayList<Day>()
        var d = LocalDate.parse(first)
        while (!d.isAfter(today) && out.size < 4000) {
            val l = byDay[d.toString()] ?: 0.0
            ctl += (l - ctl) * kC; atl += (l - atl) * kA
            out.add(Day(d.toString(), l, ctl, atl)); d = d.plusDays(1)
        }
        return if (out.isEmpty()) null else Series(out, basis)
    }

    /** Website _trFormBand: label, colour and advice for a form (TSB) and ramp. */
    internal fun band(tsb: Double, ramp: Double): Triple<String, Int, String> {
        val (label, color, advice) = when {
            tsb < -30 -> Triple("High fatigue", Ui.RED, "Prioritise recovery — easy spins or a rest day. Your fatigue is well above your fitness right now.")
            tsb < -10 -> Triple("Productive", 0xFFFB923C.toInt(), "Productive training load. Keep hard days hard and easy days easy, and bank a recovery day this week.")
            tsb < 5 -> Triple("Neutral", 0xFFEAB308.toInt(), "Balanced form. A good window for a quality session or a longer endurance ride.")
            tsb < 25 -> Triple("Fresh", Ui.GREEN, "Fresh and race-ready. Strong day for a hard effort, an event, or a PR attempt.")
            else -> Triple("Very fresh", 0xFF4DA8FF.toInt(), "Very fresh — fitness may start to fade. Time to add some training stimulus.")
        }
        val extra = when { ramp > 8 -> " ⚠ Fitness is ramping fast (+${Math.round(ramp)}/wk) — watch for overreaching."; ramp < -6 -> " Fitness is drifting down (${Math.round(ramp)}/wk)."; else -> "" }
        return Triple(label, color, advice + extra)
    }

    class Consistency(val pct: Int, val weeks: List<Int>, val hit: Int, val missed: Int, val daysThisMonth: Int, val longest: Int)

    /** Website _trConsistency: rides per Monday-week over the last 12 weeks against a target of 3. */
    internal fun consistency(rides: List<JSONObject>, today: LocalDate = LocalDate.now()): Consistency? {
        val days = rides.map { day(it) }.filter { it.length == 10 }.toSet()
        if (days.isEmpty()) return null
        fun monday(d: LocalDate) = d.minusDays((d.dayOfWeek.value - 1).toLong())
        val cur = monday(today)
        fun weeksAgo(k: String) = ((cur.toEpochDay() - monday(LocalDate.parse(k)).toEpochDay()) / 7).toInt()
        val per = rides.map { day(it) }.filter { it.length == 10 }.groupingBy { weeksAgo(it) }.eachCount()
        val win = minOf(12, weeksAgo(days.minOrNull()!!) + 1)
        val weeks = (win - 1 downTo 0).map { per[it] ?: 0 }
        return Consistency(Math.round(weeks.sumOf { minOf(it / 3.0, 1.0) } / win * 100).toInt(), weeks, weeks.count { it >= 3 }, weeks.count { it == 0 },
            days.count { it.startsWith(today.toString().take(7)) }, More.longestStreak(days))
    }

    // Daniels VDOT (website _trVdot / _trRaceMin)
    private fun vo2Pace(v: Double) = -4.60 + 0.182258 * v + 0.000104 * v * v
    private fun vo2Frac(t: Double) = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)
    internal fun vdot(m: Double, min: Double) = vo2Pace(m / min) / vo2Frac(min)
    internal fun raceMinutes(vdot: Double, m: Double): Double {
        var lo = 1.0; var hi = 900.0
        repeat(50) { val t = (lo + hi) / 2; if (vdot(m, t) > vdot) lo = t else hi = t }
        return (lo + hi) / 2
    }

    private fun hms(min: Double) = Math.round(min * 60).let { s -> if (s >= 3600) String.format(Locale.US, "%d:%02d:%02d", s / 3600, s % 3600 / 60, s % 60) else String.format(Locale.US, "%d:%02d", s / 60, s % 60) }

    fun page(a: AppActivity): Unit = a.load(listOf("activities?limit=500", "me")) { r ->
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities")).filter { day(it).length == 10 }
        val me = r["me"]
        val col = a.page()
        More.back(a, col, "Training")
        if (acts.isEmpty()) { col.addView(Ui.text(a, "Load your activities to see training load & fatigue.", 13f, Ui.MUTED)); return@load }
        val rides = acts.filter { Screens.isRide(it) }
        val hrMax = acts.maxOfOrNull { it.optDouble("max_heartrate", 0.0) } ?: 0.0
        val stravaFtp = me?.optDouble("ftp", 0.0) ?: 0.0
        val bestNp = rides.filter { it.optBoolean("device_watts") && it.optLong("moving_time") >= 1200 }.maxOfOrNull { it.optDouble("weighted_average_watts", it.optDouble("average_watts", 0.0)) } ?: 0.0
        val ftp = if (stravaFtp > 0) stravaFtp else Math.round(bestNp * 0.95).toDouble()
        val s = series(acts, ftp, hrMax) ?: return@load
        val (label, formColor, advice) = band(s.last.tsb, s.ramp)

        col.addView(Ui.tiles(a, listOf(
            "${Math.round(s.last.ctl)}" to "fitness · CTL (42-day)|effort", "${Math.round(s.last.atl)}" to "fatigue · ATL (7-day)|energy",
            String.format(Locale.US, "%+d", Math.round(s.last.tsb)) to "form · $label", String.format(Locale.US, "%+d /wk", Math.round(s.ramp)) to "ramp rate",
        )))
        col.addView(Ui.card(a).apply {
            addView(Ui.text(a, "Recovery recommendation", 14f, formColor, true))
            addView(Ui.text(a, advice, 13f, Ui.TEXT).apply { setPadding(0, Ui.dp(a, 4), 0, 0) })
        })

        // Recovery & next ride (website _trRecoveryCardHTML)
        acts.maxByOrNull { it.optString("start_date") }?.let { last ->
            val l = load(last, ftp, hrMax)?.load ?: 0.0
            val hours = Math.round((12 + l * 0.4).coerceIn(12.0, 96.0))
            val end = Screens.parse(last.optString("start_date")) + last.optLong("elapsed_time", last.optLong("moving_time")) * 1000
            val ready = end + hours * 3_600_000
            val left = (ready - System.currentTimeMillis()) / 3_600_000.0
            col.addView(Ui.heading(a, "Recovery & next ride"))
            col.addView(Ui.card(a).apply {
                addView(Ui.row(a, last.optString("name"), "load ${Math.round(l)}", Ui.date(last.optString("start_date_local")) + " · " + Ui.km(last.optDouble("distance")) + " · " + Ui.hm(last.optLong("moving_time"))).apply { setOnClickListener { a.openRide(last) } })
                addView(Ui.divider(a))
                if (left <= 0 || s.last.tsb >= 5) addView(Ui.text(a, "Recovered — you're good for a hard ride now.", 13f, Ui.GREEN, true))
                else addView(Ui.text(a, "Ready for a hard session in ~" + (if (left < 36) "${Math.round(left)}h" else "${Math.round(left / 24)}d") +
                    " (" + java.text.SimpleDateFormat("EEE d MMM, HH:mm", Locale.US).format(java.util.Date(ready)) + ")", 13f, 0xFFFB923C.toInt(), true))
                addView(Ui.text(a, "Easy recovery spin: anytime.", 11f, Ui.MUTED))
            })
        }

        // Performance management chart: the last 120 days
        val shown = s.days.takeLast(120)
        col.addView(Ui.heading(a, "Performance management chart"))
        col.addView(Ui.card(a).apply {
            addView(Screens.chart(a, FitnessChart(a).apply {
                set(shown.map { it.ctl }.toDoubleArray(), shown.map { it.tsb }.toDoubleArray(), shown.map { Ui.date(it.date).substringBeforeLast(' ') })
            }, 170))
            val names = mapOf("power" to "power", "effort" to "Relative Effort", "hr" to "heart rate", "time" to "duration")
            addView(Ui.text(a, "Orange: fitness. Bars: form. Load from " + s.basis.entries.sortedByDescending { it.value }.joinToString(" · ") { "${it.value} ${names[it.key]}" } +
                (if (ftp > 0) " · FTP ${Math.round(ftp)} W" + (if (stravaFtp > 0) "" else " (est.)") else ""), 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
        })

        consistency(rides)?.let { c ->
            col.addView(Ui.heading(a, "Consistency · last ${c.weeks.size} weeks"))
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, "${c.pct}%", 32f, if (c.pct >= 80) Ui.GREEN else if (c.pct >= 60) 0xFFFB923C.toInt() else Ui.RED, true))
                addView(Screens.chart(a, BarChart(a).apply { set(c.weeks.map { it.toDouble() }.toDoubleArray(), c.weeks.indices.map { "" }) }, 70))
                addView(Ui.row(a, "Days ridden this month", "${c.daysThisMonth}", "of ${LocalDate.now().dayOfMonth} so far"))
                addView(Ui.row(a, "Longest streak", "${c.longest} days"))
                addView(Ui.row(a, "Weeks with 3+ rides", "${c.hit} / ${c.weeks.size}"))
                addView(Ui.row(a, "Missed weeks", "${c.missed}", "no rides at all"))
            })
        }

        // FTP and its trend per quarter (best 20-min+ NP × 0.95)
        if (ftp > 0) {
            val kg = me?.optDouble("weight", 0.0)?.takeIf { it > 0 } ?: 0.0
            val wkg = if (kg > 0) ftp / kg else 0.0
            col.addView(Ui.heading(a, "FTP"))
            col.addView(Ui.card(a).apply {
                addView(Ui.row(a, "${Math.round(ftp)} W", if (wkg > 0) String.format(Locale.US, "%.2f W/kg", wkg) else "",
                    (if (stravaFtp > 0) "From your Strava profile FTP." else "95% of your best normalized power of a 20-minute+ ride.") +
                        if (wkg > 0) " · " + when { wkg >= 5 -> "Elite"; wkg >= 4 -> "Excellent"; wkg >= 3.3 -> "Very good"; wkg >= 2.7 -> "Good"; wkg >= 2 -> "Moderate"; else -> "Building" } else ""))
                val q = rides.filter { it.optBoolean("device_watts") && it.optLong("moving_time") >= 1200 }.groupBy { day(it).take(4) + " Q" + ((day(it).substring(5, 7).toInt() - 1) / 3 + 1) }
                    .mapValues { (_, l) -> Math.round(l.maxOf { it.optDouble("weighted_average_watts", it.optDouble("average_watts", 0.0)) } * 0.95).toDouble() }.toSortedMap().entries.toList().takeLast(8)
                if (q.size >= 2) {
                    addView(Ui.text(a, "Estimated FTP per quarter: " + (q.last().value - q.first().value).let { d -> if (d > 0) "▲ +${Math.round(d)} W" else if (d < 0) "▼ ${Math.round(d)} W" else "flat" }, 12f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 8), 0, 0) })
                    addView(Screens.chart(a, BarChart(a).apply { color = Ui.PURPLE; set(q.map { it.value }.toDoubleArray(), q.map { it.key.takeLast(2) }) }, 110))
                }
            })
        }

        // Run predictions from the best run (≥1.5 km, faster than 12 min/km)
        acts.filter { it.optString("sport_type").ifEmpty { it.optString("type") }.contains("Run") && it.optDouble("distance") >= 1500 && it.optDouble("moving_time") > 0 && it.optDouble("moving_time") / 60 / (it.optDouble("distance") / 1000) < 12 }
            .maxByOrNull { vdot(it.optDouble("distance"), it.optDouble("moving_time") / 60) }?.let { best ->
                val v = vdot(best.optDouble("distance"), best.optDouble("moving_time") / 60)
                col.addView(Ui.heading(a, "Run predictions · Daniels VDOT ${Math.round(v)}"))
                col.addView(Ui.card(a).apply {
                    listOf("5K" to 5000.0, "10K" to 10000.0, "Half marathon" to 21097.5, "Marathon" to 42195.0).forEachIndexed { i, (n, m) ->
                        if (i > 0) addView(Ui.divider(a))
                        val t = raceMinutes(v, m)
                        addView(Ui.row(a, n, hms(t), hms(t / (m / 1000)) + " /km"))
                    }
                    addView(Ui.text(a, "From your best run: " + Ui.km(best.optDouble("distance")) + " on " + Ui.date(best.optString("start_date_local")) + ". A 5K time trial sharpens it.", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
                })
            }

        insights(a, col, rides, hrMax)
    }

    private fun insights(a: AppActivity, col: LinearLayout, rides: List<JSONObject>, hrMax: Double) {
        fun z2(x: JSONObject) = hrMax > 0 && x.optDouble("average_heartrate", 0.0).let { it > 0 && it / hrMax >= 0.6 && it / hrMax < 0.7 }
        // Climbing ability
        val moving = rides.filter { it.optDouble("moving_time") > 0 && it.optDouble("distance") > 0 }
        if (moving.size >= 3) {
            val elev = moving.sumOf { it.optDouble("total_elevation_gain") }; val t = moving.sumOf { it.optDouble("moving_time") }; val d = moving.sumOf { it.optDouble("distance") }
            val vam = moving.filter { it.optDouble("moving_time") >= 1800 && it.optDouble("total_elevation_gain") / it.optDouble("distance") >= 0.015 }.maxByOrNull { it.optDouble("total_elevation_gain") / (it.optDouble("moving_time") / 3600) }
            col.addView(Ui.heading(a, "Climbing ability"))
            col.addView(Ui.tiles(a, listOf(
                "${Math.round(elev / (t / 3600))} m/h" to "climb rate|climb", String.format(Locale.US, "%.1f%%", elev / d * 100) to "average gradient",
                "${Math.round(elev / (d / 1000))} m/km" to "climbing per km",
                (vam?.let { "${Math.round(it.optDouble("total_elevation_gain") / (it.optDouble("moving_time") / 3600))} VAM" } ?: "—") to (vam?.optString("name")?.take(24) ?: "no sustained climbs"),
            )))
        }
        // Fitness trend on Zone-2 rides, per month
        val z2 = rides.filter { z2(it) && it.optDouble("average_speed") > 0 }.sortedBy { it.optString("start_date") }.takeLast(15)
        val months = z2.groupBy { day(it).take(7) }.toSortedMap()
        if (z2.size >= 3 && months.size >= 2) {
            val kmh = months.mapValues { (_, l) -> l.map { it.optDouble("average_speed") }.average() * 3.6 }
            val delta = kmh.values.last() - kmh.values.first()
            col.addView(Ui.heading(a, "Fitness trend · last ${z2.size} Zone-2 rides"))
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, (if (delta > 0.05) String.format(Locale.US, "▲ +%.1f km/h", delta) else if (delta < -0.05) String.format(Locale.US, "▼ %.1f km/h", delta) else "Holding steady") + " at the same aerobic effort.", 12f, Ui.MUTED))
                months.forEach { (m, l) ->
                    val w = l.map { it.optDouble("average_watts", 0.0) }.filter { it > 0 }
                    addView(Ui.divider(a))
                    addView(Ui.row(a, Ui.date("$m-01").substringAfter(' '), String.format(Locale.US, "%.1f km/h", kmh[m]), "${l.size} rides" + if (w.isNotEmpty()) " · ${Math.round(w.average())} W" else ""))
                }
            })
        }
        // Seasonal insights
        if (rides.size >= 8) {
            val today = LocalDate.now().toString()
            val byYear = rides.groupBy { day(it).take(4) }.mapValues { (_, l) -> l.sumOf { it.optDouble("distance") } }
            val byMonth = rides.groupBy { day(it).take(7) }
            val bestYear = byYear.maxByOrNull { it.value }!!
            val bestMonth = byMonth.mapValues { (_, l) -> l.sumOf { it.optDouble("distance") } }.maxByOrNull { it.value }!!
            fun ytd(y: Int) = rides.filter { day(it).startsWith("$y") && day(it).substring(5) <= today.substring(5) }.sumOf { it.optDouble("distance") }
            val y = today.take(4).toInt()
            val ytdPrev = ytd(y - 1)
            fun spd(m: String) = byMonth[m]?.map { it.optDouble("average_speed") }?.filter { it > 0 }?.takeIf { it.isNotEmpty() }?.average()?.times(3.6)
            val now = spd(today.take(7)); val was = spd("${y - 1}" + today.substring(4, 7))
            col.addView(Ui.heading(a, "Seasonal insights"))
            col.addView(Ui.tiles(a, listOf(
                String.format(Locale.US, "%,.0f km", bestYear.value / 1000) to "biggest year · ${bestYear.key}|distance",
                String.format(Locale.US, "%,.0f km", bestMonth.value / 1000) to "biggest month · " + Ui.date(bestMonth.key + "-01").substringAfter(' '),
                (if (ytdPrev > 0) Math.round((ytd(y) - ytdPrev) / ytdPrev * 100).let { String.format(Locale.US, "%+d%%", it) } else "—") to "distance vs this point last year",
                (if (now != null && was != null) String.format(Locale.US, "%+.1f km/h", now - was) else "—") to "this month's speed vs last year|speed",
            )))
        }
        // Personal records
        if (rides.size >= 3) {
            fun best(label: String, filter: (JSONObject) -> Boolean, key: (JSONObject) -> Double, value: (JSONObject) -> String, low: Boolean = false) =
                rides.filter(filter).let { l -> if (low) l.minByOrNull(key) else l.maxByOrNull(key) }?.let { Triple(label, value(it), it) }
            val recs = listOfNotNull(
                best("Longest ride", { true }, { it.optDouble("distance") }, { Ui.km(it.optDouble("distance")) }),
                best("Biggest climbing day", { true }, { it.optDouble("total_elevation_gain") }, { "${Math.round(it.optDouble("total_elevation_gain"))} m" }),
                best("Fastest century", { it.optDouble("distance") >= 100_000 }, { it.optDouble("average_speed") }, { Ui.kmh(it.optDouble("average_speed")) }),
                best("Longest Zone-2 ride", { z2(it) }, { it.optDouble("moving_time") }, { Ui.hm(it.optLong("moving_time")) }),
                best("Highest average cadence", { it.optDouble("average_cadence", 0.0) > 0 }, { it.optDouble("average_cadence") }, { "${Math.round(it.optDouble("average_cadence"))} rpm" }),
                best("Highest average power", { it.optDouble("average_watts", 0.0) > 0 }, { it.optDouble("average_watts") }, { "${Math.round(it.optDouble("average_watts"))} W" }),
                best("Hottest ride", { it.has("average_temp") && !it.isNull("average_temp") }, { it.optDouble("average_temp") }, { "${Math.round(it.optDouble("average_temp"))}°C" }),
                best("Coldest ride", { it.has("average_temp") && !it.isNull("average_temp") }, { it.optDouble("average_temp") }, { "${Math.round(it.optDouble("average_temp"))}°C" }, low = true),
            )
            col.addView(Ui.heading(a, "Personal records"))
            col.addView(Ui.card(a).apply {
                recs.forEachIndexed { i, (l, v, x) ->
                    if (i > 0) addView(Ui.divider(a))
                    addView(Ui.row(a, l, v, x.optString("name") + " · " + Ui.date(x.optString("start_date_local"))).apply { setOnClickListener { a.openRide(x) } })
                }
            })
        }
        val latest = rides.filter { it.optDouble("moving_time") > 0 }.maxByOrNull { it.optString("start_date") } ?: return
        // Ride quality: the latest ride's percentile against your own rides
        if (rides.size >= 8) {
            fun pct(v: Double, all: List<Double>) = all.filter { it > 0 }.sorted().takeIf { it.isNotEmpty() }?.let { s -> s.count { it <= v }.toDouble() / s.size }
            fun effort(x: JSONObject) = x.optDouble("suffer_score", 0.0).takeIf { it > 0 } ?: x.optDouble("average_heartrate", 0.0)
            val parts = listOf(
                "Endurance" to pct(latest.optDouble("moving_time"), rides.map { it.optDouble("moving_time") }),
                "Climbing" to pct(latest.optDouble("total_elevation_gain"), rides.map { it.optDouble("total_elevation_gain") }),
                "Efficiency" to pct(latest.optDouble("average_speed"), rides.map { it.optDouble("average_speed") }),
                "Effort" to effort(latest).takeIf { it > 0 }?.let { pct(it, rides.map { r -> effort(r) }) },
            ).filter { it.second != null }
            val overall = Math.round(parts.sumOf { it.second!! } / parts.size * 100)
            col.addView(Ui.heading(a, "Ride quality · latest ride"))
            col.addView(Ui.card(a).apply {
                addView(Ui.row(a, latest.optString("name"), "$overall / 100").apply { ((getChildAt(1)) as android.widget.TextView).setTextColor(if (overall >= 80) Ui.GREEN else if (overall >= 60) 0xFFFB923C.toInt() else Ui.RED) })
                parts.forEach { (n, v) -> addView(Ui.row(a, n, String.format(Locale.US, "%.1f / 10", v!! * 10))) }
                addView(Ui.text(a, "Each score is this ride's percentile against your own ride history.", 11f, Ui.MUTED))
            })
        }
        // Similar rides: the latest against past rides of a similar distance and climb
        val past = rides.filter { it.optDouble("distance") > 0 && it !== latest }.sortedByDescending { it.optString("start_date") }
        val e = latest.optDouble("total_elevation_gain")
        val similar = past.filter { Math.abs((it.optDouble("distance") - latest.optDouble("distance")) / latest.optDouble("distance")) <= 0.15 && (e <= 50 || Math.abs((it.optDouble("total_elevation_gain") - e) / e) <= 0.4) }.take(12)
        if (similar.size >= 2) {
            val pool = similar + latest
            fun rank(k: String, desc: Boolean) = pool.map { it.optDouble(k, 0.0) }.let { if (desc) it.sortedDescending() else it.sorted() }.indexOf(latest.optDouble(k, 0.0)) + 1
            col.addView(Ui.heading(a, "Similar rides"))
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, latest.optString("name") + " · " + Ui.km(latest.optDouble("distance")) + " · ${Math.round(e)} m, against ${similar.size} similar past rides", 12f, Ui.MUTED))
                addView(Ui.row(a, "Speed", "#${rank("average_speed", true)} of ${pool.size}"))
                if (latest.optDouble("average_heartrate", 0.0) > 0) addView(Ui.row(a, "Lowest heart rate", "#${rank("average_heartrate", false)} of ${pool.size}"))
                addView(Ui.row(a, "Climbing", "#${rank("total_elevation_gain", true)} of ${pool.size}"))
            })
        }
    }
}
