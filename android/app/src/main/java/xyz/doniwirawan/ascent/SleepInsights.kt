package xyz.doniwirawan.ascent

import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.util.Locale

/**
 * The website's sleep analysis (js/sleep.js _slpAnalyse + _slpHeadline) under
 * the Sleep tab: the findings, training against rest nights, the day of the
 * week, how nights spread, and month and year trends. A night is dated by the
 * morning you woke, so the night after a ride on the 9th is the 10th.
 */
object SleepInsights {
    /** One night: the /sleep columns that have a value. */
    class Night(val date: String, private val v: Map<String, Double>) {
        operator fun get(k: String): Double? = v[k]
        val asleep get() = v["asleep"] ?: 0.0
        val deep get() = v["deep"] ?: 0.0
        val rem get() = v["rem"] ?: 0.0
        val light get() = v["light"] ?: 0.0
    }

    internal fun nights(s: JSONObject): List<Night> {
        val cols = s.optJSONArray("cols") ?: return emptyList()
        val rows = s.optJSONArray("rows") ?: JSONArray()
        return (0 until rows.length()).map { i ->
            val r = rows.getJSONArray(i)
            val m = HashMap<String, Double>()
            for (c in 1 until cols.length()) if (c < r.length() && !r.isNull(c)) r.optDouble(c).takeIf { !it.isNaN() }?.let { m[cols.getString(c)] = it }
            Night(r.optString(0), m)
        }.sortedBy { it.date }
    }

    class Train(var re: Double = 0.0, var min: Double = 0.0, var dist: Double = 0.0, var startH: Double? = null) { val load get() = if (re > 0) re else min }

    /** Days you trained: Relative Effort (else moving minutes) and the earliest start, website _slpTrainingDays. */
    internal fun trainingDays(acts: List<JSONObject>): Map<String, Train> {
        val map = HashMap<String, Train>()
        acts.forEach { a ->
            val s = a.optString("start_date_local"); val d = s.take(10)
            if (d.length < 10) return@forEach
            val t = map.getOrPut(d) { Train() }
            t.re += a.optDouble("suffer_score", 0.0); t.min += a.optDouble("moving_time", 0.0) / 60; t.dist += a.optDouble("distance", 0.0)
            s.drop(11).take(5).takeIf { it.length == 5 }?.let { hm -> val h = hm.take(2).toDouble() + hm.drop(3).toDouble() / 60; if (t.startH == null || h < t.startH!!) t.startH = h }
        }
        return map
    }

    internal fun next(d: String, k: Long = 1) = LocalDate.parse(d).plusDays(k).toString()
    internal fun dow(d: String) = LocalDate.parse(d).dayOfWeek.value % 7           // 0 = Sunday
    internal val DOW = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
    internal fun mean(l: List<Double>) = if (l.isEmpty()) Double.NaN else l.average()
    internal fun hm(m: Double) = if (m.isNaN()) "—" else "${(m / 60).toInt()}h ${Math.round(m % 60).toInt().let { if (it == 60) 59 else it }}m"
    internal fun clock(h: Double) = (((h % 24) + 24) % 24).let { x -> val hh = x.toInt(); val mm = Math.round((x - hh) * 60).toInt(); String.format(Locale.US, "%02d:%02d", if (mm == 60) hh + 1 else hh, if (mm == 60) 0 else mm) }

    class Agg(val n: Int, val asleep: Double, val deep: Double, val rem: Double, val light: Double, val eff: Double, val bed: Double)
    internal fun agg(g: List<Night>) = Agg(g.size, mean(g.map { it.asleep }), mean(g.map { it.deep }), mean(g.map { it.rem }), mean(g.map { it.light }),
        mean(g.mapNotNull { it["eff"] }), mean(g.mapNotNull { it["bed"] }))

    class Card(val tone: Int, val title: String, val body: String)

    /** The website's findings, in its order; each only when the data supports it. */
    internal fun findings(all: List<Night>, train: Map<String, Train>): List<Card> {
        val real = all.filter { it.asleep >= 60 }
        if (real.isEmpty()) return emptyList()
        val byDate = real.associateBy { it.date }
        val tDates = train.keys.sorted()
        val days = if (tDates.isEmpty()) emptyList() else generateSequence(tDates.first()) { next(it) }.takeWhile { it <= tDates.last() }.toList()
        val afterT = ArrayList<Night>(); val afterR = ArrayList<Night>()
        days.forEach { d -> byDate[next(d)]?.let { (if (d in train) afterT else afterR).add(it) } }
        val win = if (tDates.isEmpty()) real else real.filter { it.date >= tDates.first() && it.date <= next(tDates.last()) }
        val cards = ArrayList<Card>()
        val warn = 0xFFFB923C.toInt(); val info = Ui.BLUE; val good = Ui.GREEN

        // 1. the worst night of the week, and whether it is also the biggest training day
        val wLo = win.firstOrNull()?.date; val wHi = win.lastOrNull()?.date
        val dowAgg = listOf(1, 2, 3, 4, 5, 6, 0).map { i -> Triple(DOW[i], agg(win.filter { dow(it.date) == i }), train.keys.count { wLo != null && it >= wLo && it <= wHi!! && dow(it) == i }) }
        dowAgg.filter { it.second.n >= 5 }.minByOrNull { it.second.asleep }?.let { worst ->
            val restAvg = mean(dowAgg.filter { it.first != worst.first }.map { it.second.asleep }.filter { !it.isNaN() })
            val clash = dowAgg.maxByOrNull { it.third }?.first == worst.first
            cards += if (clash) Card(warn, "${worst.first} is your biggest training day and your worst night of sleep",
                "You sleep ${hm(worst.second.asleep)} before a ${worst.first}, against ${hm(restAvg)} on every other night — and ${worst.first} is also the day you train most (${worst.third} sessions). You are riding your hardest on your thinnest sleep. Moving that start an hour later, or protecting the bedtime the night before, is the single highest-value change here.")
            else Card(info, "${worst.first} is your shortest night of sleep", "You sleep ${hm(worst.second.asleep)} on a ${worst.first}, against ${hm(restAvg)} on every other night.")
        }
        // 2. dawn starts
        val starts = train.mapNotNull { (d, t) -> byDate[d]?.let { n -> t.startH?.let { h -> Triple(h, n, t.min / 60) } } }
        val dawn = starts.filter { it.first < 6 }; val later = starts.filter { it.first >= 6 }
        if (dawn.size >= 5 && later.size >= 5) {
            val dS = mean(dawn.map { it.second.asleep }); val lS = mean(later.map { it.second.asleep })
            cards += Card(warn, "Dawn starts cost you ${hm(lS - dS)} of sleep",
                "On days you roll out before 06:00 you sleep ${hm(dS)} and are up at ${clock(mean(dawn.mapNotNull { it.second["up"] }))}; when you start later, ${hm(lS)}. Those dawn days are also your longest rides — " +
                    String.format(Locale.US, "%.1fh against %.1fh", mean(dawn.map { it.third }), mean(later.map { it.third })) + " — so the biggest efforts sit on the thinnest sleep. Your bedtime does not move to meet the earlier alarm, so the hour simply disappears.")
        }
        // 3. bedtime slope
        val bp = real.filter { it["bed"] != null && it["up"] != null }
        if (bp.size > 50) {
            val mx = mean(bp.map { it["bed"]!! }); val my = mean(bp.map { it["up"]!! })
            val den = bp.sumOf { (it["bed"]!! - mx).let { d -> d * d } }
            val slope = if (den > 0) bp.sumOf { (it["bed"]!! - mx) * (it["up"]!! - my) } / den else 0.0
            val lost = Math.round(60 * (1 - slope)).toInt()
            val med = bp.map { it["bed"]!! }.sorted()[bp.size / 2]
            val early = agg(bp.filter { it["bed"]!! <= med }); val late = agg(bp.filter { it["bed"]!! > med })
            if (lost in 1..60) cards += Card(info, "Every hour you go to bed late costs you $lost minutes",
                "Across ${bp.size} nights, an hour's later bedtime buys back only ${Math.round(60 * slope)} minutes of lie-in — the other $lost are gone. Turn in before ${clock(med)} and you average ${hm(early.asleep)} with ${Math.round(early.deep)} min of deep; after it, ${hm(late.asleep)} with ${Math.round(late.deep)} min. Bedtime is the decision that sets the night.")
        }
        // 4. training earns sleep
        val aT = agg(afterT); val aR = agg(afterR)
        if (aT.n > 0 && aR.n > 0) cards += Card(good, "Training buys you ${hm(Math.abs(aT.asleep - aR.asleep))} more sleep",
            "After a training day you sleep ${hm(aT.asleep)}; after a rest day, ${hm(aR.asleep)}. Deep sleep goes up ${Math.round(aT.deep - aR.deep)} minutes and REM ${Math.round(aT.rem - aR.rem)} minutes. Rest days are quietly your worst-sleeping days.")
        // 5. the rebound after a big (2h+) day
        val big = train.filter { it.value.min >= 120 }.keys
        val arc = listOf(0L, 1L, 2L).map { k -> agg(big.mapNotNull { byDate[next(it, k)] }) }
        if (arc[1].n >= 10 && arc[0].n >= 10) cards += Card(good, "A big ride buys one great night — then it is over",
            "The night of a 2h+ day you sleep ${hm(arc[0].asleep)}. The night after jumps to ${hm(arc[1].asleep)}, with deep at ${Math.round(arc[1].deep)} min and REM at ${Math.round(arc[1].rem)} min — against your ${Math.round(mean(real.map { it.deep }))} / ${Math.round(mean(real.map { it.rem }))} min normal. By the second night you are back to ${hm(arc[2].asleep)}. The night straight after a big day is the one worth protecting.")
        // 6. weekends
        val we = real.filter { dow(it.date) == 0 || dow(it.date) == 6 }; val wd = real.filter { dow(it.date) in 1..5 }
        if (we.size > 20 && wd.size > 20) { val e = agg(we); val d = agg(wd)
            if (d.asleep - e.asleep > 10) cards += Card(warn, "Weekends cost you ${hm(d.asleep - e.asleep)} a night",
                "Saturday and Sunday nights average ${hm(e.asleep)} against ${hm(d.asleep)} on weeknights, with deep at ${Math.round(e.deep)} min versus ${Math.round(d.deep)}. The weekend is when you ride most and sleep least.") }
        // 7. wake-ups
        val wk = real.filter { it["wakeups"] != null && it["eff"] != null }.sortedBy { it["wakeups"] }
        if (wk.size >= 30) {
            val t = wk.size / 3; val few = wk.subList(0, t); val many = wk.subList(2 * t, wk.size)
            val f = agg(few); val m = agg(many)
            cards += Card(info, String.format(Locale.US, "More wake-ups, but not less sleep — %.0f%% vs %.0f%% efficiency", f.eff, m.eff),
                String.format(Locale.US, "On your calmest nights you wake %.1f times and sleep %s at %.0f%% efficiency. On your most broken nights you wake %.1f times — and sleep %s at %.0f%%. Longer nights give you more chances to surface; deep sleep slips from %d to %d min.",
                    mean(few.map { it["wakeups"]!! }), hm(f.asleep), f.eff, mean(many.map { it["wakeups"]!! }), hm(m.asleep), m.eff, Math.round(f.deep), Math.round(m.deep)))
        }
        // 8. runs of 3+ nights under 6h
        val streaks = ArrayList<List<Night>>(); var run = ArrayList<Night>()
        real.forEach { n -> if (n.asleep < 360) run.add(n) else { if (run.size >= 3) streaks.add(run); run = ArrayList() } }
        if (run.size >= 3) streaks.add(run)
        if (streaks.isNotEmpty()) { val longest = streaks.maxByOrNull { it.size }!!; val debt = streaks.sumOf { it.size }
            cards += Card(info, "${streaks.size} stretches of three or more short nights in a row",
                "$debt nights — ${Math.round(100.0 * debt / real.size)}% of everything tracked — sit inside a run of three or more nights under 6h. The longest was ${longest.size} nights, ${Ui.date(longest.first().date)} to ${Ui.date(longest.last().date)}. These runs, not the odd bad night, are what build up a deficit.") }
        // 9. naps
        val naps = real.filter { (it["nap"] ?: 0.0) > 0 }
        if (naps.isNotEmpty()) cards += Card(info, "You nap on ${Math.round(100.0 * naps.size / real.size)}% of days, averaging ${Math.round(mean(naps.map { it["nap"]!! }))} minutes",
            "Nap days follow a short night: ${hm(mean(naps.map { it.asleep }))} of night sleep against ${hm(mean(real.filter { (it["nap"] ?: 0.0) <= 0 }.map { it.asleep }))} on days you do not nap. The nap is compensation, not a bonus.")
        // 10. the long-horizon drift in deep sleep
        val years = real.groupBy { it.date.take(4) }.toSortedMap()
        if (years.size >= 3) {
            val f = agg(years.values.first()); val l = agg(years.values.last())
            fun pct(x: Agg) = 100 * x.deep / (x.deep + x.rem + x.light)
            if (pct(f) - pct(l) > 1) cards += Card(info, "Same hours, slightly thinner sleep than two years ago",
                "Your nightly total — ${hm(f.asleep)} in ${years.firstKey()}, ${hm(l.asleep)} in ${years.lastKey()}. The mix has moved: deep ${Math.round(f.deep)} → ${Math.round(l.deep)} min and REM ${Math.round(f.rem)} → ${Math.round(l.rem)} min. A mild drift rather than a cliff — watch it rather than worry about it.")
        }
        return cards
    }

    fun draw(a: AppActivity, col: LinearLayout, s: JSONObject, acts: List<JSONObject>) {
        val all = nights(s); val real = all.filter { it.asleep >= 60 }
        if (real.size < 7) return
        val train = trainingDays(acts)
        findings(all, train).takeIf { it.isNotEmpty() }?.let { cs ->
            col.addView(Ui.heading(a, "What your sleep says"))
            cs.forEach { c ->
                col.addView(Ui.card(a).apply {
                    addView(Ui.text(a, c.title, 14f, c.tone, true))
                    addView(Ui.text(a, c.body, 12f, Ui.TEXT).apply { setPadding(0, Ui.dp(a, 4), 0, 0) })
                })
            }
        }
        // the night after: rest, then the day's load in quartiles
        val byDate = real.associateBy { it.date }
        val tDates = train.keys.sorted()
        if (tDates.isNotEmpty()) {
            val loads = train.values.map { it.load }.filter { it > 0 }.sorted()
            val cuts = listOf(0.25, 0.5, 0.75).map { loads.getOrElse((loads.size * it).toInt()) { 0.0 } }
            val buckets = linkedMapOf("Rest day" to ArrayList<Night>(), "Easy day" to ArrayList(), "Moderate day" to ArrayList(), "Hard day" to ArrayList(), "Very hard day" to ArrayList())
            generateSequence(tDates.first()) { next(it) }.takeWhile { it <= tDates.last() }.forEach { d ->
                val n = byDate[next(d)] ?: return@forEach
                val t = train[d]
                buckets[if (t == null) "Rest day" else if (t.load <= cuts[0]) "Easy day" else if (t.load <= cuts[1]) "Moderate day" else if (t.load <= cuts[2]) "Hard day" else "Very hard day"]!!.add(n)
            }
            col.addView(Ui.heading(a, "The night after"))
            col.addView(Ui.card(a).apply {
                buckets.filter { it.value.isNotEmpty() }.entries.forEachIndexed { i, (k, l) ->
                    if (i > 0) addView(Ui.divider(a))
                    val g = agg(l)
                    addView(Ui.row(a, k, hm(g.asleep), "${g.n} nights · deep ${Math.round(g.deep)} min · REM ${Math.round(g.rem)} min" + if (!g.eff.isNaN()) String.format(Locale.US, " · %.0f%%", g.eff) else ""))
                }
                addView(Ui.text(a, "Load is that day's Strava Relative Effort (else moving minutes), split into quarters of your own training days.", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
            })
        }
        // day of the week
        col.addView(Ui.heading(a, "By day of the week"))
        col.addView(Ui.card(a).apply {
            listOf(1, 2, 3, 4, 5, 6, 0).forEachIndexed { i, d ->
                val g = agg(real.filter { dow(it.date) == d })
                if (g.n == 0) return@forEachIndexed
                if (i > 0) addView(Ui.divider(a))
                addView(Ui.row(a, "Night before ${DOW[d]}", hm(g.asleep), "${g.n} nights · deep ${Math.round(g.deep)} min" + if (!g.bed.isNaN()) " · bed ${clock(g.bed)}" else ""))
            }
        })
        // how nights spread
        val hist = listOf(0.0 to 300.0, 300.0 to 360.0, 360.0 to 420.0, 420.0 to 480.0, 480.0 to 540.0, 540.0 to 1e9).map { (lo, hi) -> real.count { it.asleep >= lo && it.asleep < hi }.toDouble() }
        col.addView(Ui.heading(a, "How your nights spread"))
        col.addView(Ui.card(a).apply {
            addView(Screens.chart(a, BarChart(a).apply { color = Ui.BLUE; set(hist.toDoubleArray(), listOf("<5h", "5–6h", "6–7h", "7–8h", "8–9h", "9h+")) }, 130))
            addView(Ui.text(a, "${Math.round(100.0 * real.count { it.asleep < 360 } / real.size)}% of nights under 6h · ${Math.round(100.0 * real.count { it.asleep >= 420 } / real.size)}% at 7h or more, of ${real.size} nights.", 11f, Ui.MUTED))
        })
        // per month, the last 24
        val months = real.groupBy { it.date.take(7) }.toSortedMap().entries.toList().takeLast(24)
        if (months.size >= 2) {
            col.addView(Ui.heading(a, "Average night per month (hours)"))
            col.addView(Ui.card(a).apply {
                addView(Screens.chart(a, BarChart(a).apply {
                    color = Ui.BLUE; format = { String.format(Locale.US, "%.1f", it) }; highlight = months.size - 1
                    set(months.map { agg(it.value).asleep / 60 }.toDoubleArray(), months.map { it.key.takeLast(2) })
                }, 140))
            })
        }
        // year by year
        val years = real.groupBy { it.date.take(4) }.toSortedMap()
        if (years.size >= 2) {
            col.addView(Ui.heading(a, "Year by year"))
            col.addView(Ui.card(a).apply {
                years.entries.forEachIndexed { i, (y, l) ->
                    if (i > 0) addView(Ui.divider(a))
                    val g = agg(l); val tot = g.deep + g.rem + g.light
                    addView(Ui.row(a, "$y · ${g.n} nights", hm(g.asleep), String.format(Locale.US, "deep %.0f%% · REM %.0f%% · under 6h %.0f%%", 100 * g.deep / tot, 100 * g.rem / tot, 100.0 * l.count { it.asleep < 360 } / l.size) +
                        (if (!g.eff.isNaN()) String.format(Locale.US, " · %.0f%% efficient", g.eff) else "") + if (!g.bed.isNaN()) " · bed ${clock(g.bed)}" else ""))
                }
            })
        }
        // records, the recipe, month by month, long-term health, healthiest year
        SleepHealth.draw(a, col, all, real, train)
        // the watch's daily body data joined with the rides
        SleepBody.draw(a, col, all, real, train, acts)
    }
}
