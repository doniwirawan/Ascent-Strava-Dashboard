package xyz.doniwirawan.ascent

import android.graphics.drawable.GradientDrawable
import android.view.View
import android.widget.LinearLayout
import xyz.doniwirawan.ascent.SleepInsights.Night
import xyz.doniwirawan.ascent.SleepInsights.Train
import xyz.doniwirawan.ascent.SleepInsights.agg
import xyz.doniwirawan.ascent.SleepInsights.clock
import xyz.doniwirawan.ascent.SleepInsights.hm
import xyz.doniwirawan.ascent.SleepInsights.mean
import xyz.doniwirawan.ascent.SleepInsights.next
import java.time.LocalDate
import java.util.Locale

/**
 * More of the website's Sleep section (js/sleep.js) under the Sleep tab: your
 * records, best nights against worst ("the recipe"), month by month, what the
 * numbers mean for long-term health, and your healthiest year. Same rules and
 * wording as the website; population-level associations, not a diagnosis.
 */
object SleepHealth {
    private val AMBER = 0xFFF59E0B.toInt()
    private val LIME = 0xFF84CC16.toInt()
    private val DEEP = 0xFF6366F1.toInt()
    private val REM = 0xFFC084FC.toInt()
    internal fun scoreColor(s: Int) = if (s >= 80) Ui.GREEN else if (s >= 65) LIME else if (s >= 50) AMBER else Ui.RED

    private fun sd(l: List<Double>): Double { val mu = mean(l); return Math.sqrt(mean(l.map { (it - mu) * (it - mu) })) }
    private fun f1(v: Double) = String.format(Locale.US, "%.1f", v)
    private fun range(a: String, b: String) = generateSequence(a) { next(it) }.takeWhile { it <= b }.toList()

    internal fun corr(xs: List<Double>, ys: List<Double>): Double? {
        if (xs.size < 5) return null
        val mx = mean(xs); val my = mean(ys)
        var num = 0.0; var dx = 0.0; var dy = 0.0
        for (i in xs.indices) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) * (xs[i] - mx); dy += (ys[i] - my) * (ys[i] - my) }
        val den = Math.sqrt(dx * dy)
        return if (den > 0) Math.round(num / den * 1000) / 1000.0 else null
    }

    // ── Records (website _slpRecords) ───────────────────────────────────────
    class Rec(val label: String, val value: String, val date: String, val ctx: String, val color: Int)
    class Week(val from: String, val to: String, val asleep: Double, val deep: Double, val rem: Double)
    class Month(val month: String, val nights: Int, val asleep: Double, val deep: Double, val rem: Double, val eff: Double, val best: Night, val under6: Int, val full: Boolean)
    class Tier(val n: Int, val asleep: Double, val bed: Double, val up: Double, val deep: Double, val rem: Double, val eff: Double, val wakeups: Double, val trainedPct: Double, val dow: String)
    class Records(val nights: List<Rec>, val bestWeek: Week?, val worstWeek: Week?, val goodRun: Triple<Int, String, String>?,
                  val months: List<Month>, val bestMonth: Month?, val worstMonth: Month?, val best: Tier, val worst: Tier, val tierSize: Int)

    internal fun records(real: List<Night>, train: Map<String, Train>): Records? {
        if (real.isEmpty()) return null
        val byDate = real.associateBy { it.date }
        val solid = real.filter { it.asleep >= 300 }
        fun ctx(n: Night): String {
            val prev = train[next(n.date, -1)]
            return listOfNotNull(n["bed"]?.let { "to bed ${clock(it)}" }, if (prev != null) "after ${f1(prev.min / 60)}h riding" else "after a rest day").joinToString(" · ")
        }
        fun rec(label: String, n: Night?, v: (Night) -> String, c: Int) = n?.let { Rec(label, v(it), Ui.date(it.date), ctx(it), c) }
        val nights = listOfNotNull(
            rec("Longest night", real.maxByOrNull { it.asleep }, { hm(it.asleep) }, Ui.ORANGE),
            rec("Most deep sleep", real.maxByOrNull { it.deep }, { "${Math.round(it.deep)}m" }, DEEP),
            rec("Most REM", real.maxByOrNull { it.rem }, { "${Math.round(it.rem)}m" }, REM),
            rec("Best efficiency", solid.filter { it["eff"] != null }.maxByOrNull { it["eff"]!! }, { f1(it["eff"]!!) + "%" }, Ui.GREEN),
            rec("Least time awake", solid.filter { it["wake"] != null }.minByOrNull { it["wake"]!! }, { "${Math.round(it["wake"]!!)}m" }, Ui.GREEN),
            rec("Earliest to bed", real.filter { it["bed"] != null }.minByOrNull { it["bed"]!! }, { clock(it["bed"]!!) }, Ui.TEXT),
            rec("Shortest night", real.minByOrNull { it.asleep }, { hm(it.asleep) }, Ui.RED),
        )
        // rolling 7-night windows, only where all seven nights were tracked
        val span = range(real.first().date, real.last().date)
        var bestWeek: Week? = null; var worstWeek: Week? = null
        for (i in 0 until span.size - 6) {
            val g = span.subList(i, i + 7).map { byDate[it] }
            if (g.any { it == null }) continue
            val x = agg(g.filterNotNull())
            val w = Week(span[i], span[i + 6], x.asleep, x.deep, x.rem)
            if (bestWeek == null || w.asleep > bestWeek.asleep) bestWeek = w
            if (worstWeek == null || w.asleep < worstWeek.asleep) worstWeek = w
        }
        // longest run of 7h+ nights
        var goodRun: Triple<Int, String, String>? = null; var run = 0; var from = ""
        span.forEach { d ->
            val n = byDate[d]
            if (n != null && n.asleep >= 420) { if (run == 0) from = d; run++; if (goodRun == null || run > goodRun!!.first) goodRun = Triple(run, from, d) } else run = 0
        }
        // the monthly ledger; a month needs 15 nights to be ranked
        val months = real.groupBy { it.date.take(7) }.toSortedMap().map { (m, g) ->
            val x = agg(g)
            Month(m, g.size, x.asleep, x.deep, x.rem, x.eff, g.maxByOrNull { it.asleep }!!, g.count { it.asleep < 360 }, g.size >= 15)
        }
        val ranked = months.filter { it.full }.sortedByDescending { it.asleep }
        // best nights against worst
        val srt = real.sortedByDescending { it.asleep }
        val k = minOf(maxOf(10, Math.round(real.size * 0.1).toInt()), real.size / 2)
        fun tier(g: List<Night>): Tier {
            val x = agg(g)
            val dowN = IntArray(7); g.forEach { dowN[SleepInsights.dow(it.date)]++ }
            val pk = dowN.indices.maxByOrNull { dowN[it] } ?: 0
            return Tier(g.size, x.asleep, x.bed, mean(g.mapNotNull { it["up"] }), x.deep, x.rem, x.eff, mean(g.mapNotNull { it["wakeups"] }),
                100.0 * g.count { train.containsKey(next(it.date, -1)) } / g.size, SleepInsights.DOW[pk])
        }
        return Records(nights, bestWeek, worstWeek, goodRun, months, ranked.firstOrNull(), ranked.lastOrNull(), tier(srt.take(k)), tier(srt.takeLast(k)), k)
    }

    // ── Health risk (website _slpRisk) ──────────────────────────────────────
    class Comp(val label: String, val w: Double, val score: Double?, val read: String, val ev: String)
    class Flag(val tone: Int, val title: String, val body: String)
    class Risk(val score: Int, val grade: String, val comps: List<Comp>, val flags: List<Flag>)

    internal fun risk(real: List<Night>, allDays: List<Night>): Risk? {
        if (real.size < 60) return null
        fun band(v: Double, zero: Double, full: Double) = (100 * (v - zero) / (full - zero)).coerceIn(0.0, 100.0)
        val all = agg(real); val wake = mean(real.mapNotNull { it["wake"] })
        // regularity on the sleep midpoint, as the mortality studies use
        val mids = real.filter { it["bed"] != null && it["up"] != null }.map { it["bed"]!! + (it["up"]!! - it["bed"]!!) / 2 }
        val midMu = mean(mids); val midSD = if (mids.size > 30) sd(mids) else null
        val shortPct = 100.0 * real.count { it.asleep < 360 } / real.size
        val longPct = 100.0 * real.count { it.asleep > 540 } / real.size
        val tot = all.deep + all.rem + all.light
        val deepPct = 100 * all.deep / tot; val remPct = 100 * all.rem / tot
        val comps = listOf(
            Comp("How long you sleep", 0.40, 0.5 * band(all.asleep, 300.0, 420.0) + 0.5 * band(shortPct, 40.0, 5.0),
                "${hm(all.asleep)} a night on average, and ${Math.round(shortPct)}% of nights fall under 6h.",
                "Adults who habitually sleep under 6–7h show higher rates of cardiovascular disease, type 2 diabetes and all-cause mortality across large cohort studies. The usual guideline band is 7–9h."),
            Comp("How regular the timing is", 0.25, midSD?.let { band(it, 2.0, 0.5) },
                if (midSD == null) "Not enough bedtime and wake-time data to score." else "Your sleep midpoint sits around ${clock(midMu)} and swings ±${Math.round(midSD * 60)} minutes night to night.",
                "Irregular sleep timing predicts cardiometabolic risk and mortality about as strongly as short duration does, and independently of it — a steady schedule counts on its own."),
            Comp("How solid the night is", 0.20, if (all.eff.isNaN()) null else band(all.eff, 70.0, 90.0),
                "${f1(all.eff)}% efficiency — ${hm(wake)} of every night is spent awake in bed.",
                "Fragmented, low-efficiency sleep is associated with higher blood pressure and poorer glucose control, separately from how many hours you log."),
            Comp("How the stages divide up", 0.15, (100 - 4 * (Math.abs(deepPct - 20) + Math.abs(remPct - 20))).coerceIn(0.0, 100.0),
                "${f1(deepPct)}% deep and ${f1(remPct)}% REM, against a rough 20% target for each.",
                "Deep sleep is when physical repair and growth-hormone release happen; REM is when memory consolidates. A wrist tracker estimates these rather than measuring them, so read the trend and not the decimal."),
        )
        val scored = comps.filter { it.score != null }
        val score = Math.round(scored.sumOf { it.score!! * it.w } / scored.sumOf { it.w }).toInt()
        val grade = if (score >= 80) "Strong" else if (score >= 65) "Reasonable" else if (score >= 50) "Worth attention" else "A real weak spot"

        val flags = ArrayList<Flag>()
        val sp = Math.round(shortPct)
        flags.add(when {
            shortPct >= 25 -> Flag(AMBER, "$sp% of your nights are under 6h", "This is the pattern with the most consistent evidence behind it. Short sleep as a habit — not the occasional bad night — is what the cardiovascular and metabolic risk associations are built on.")
            shortPct >= 12 -> Flag(Ui.BLUE, "$sp% of your nights are under 6h", "Not a habit, but not rare either. These nights cluster into runs, and it is the runs that accumulate.")
            else -> Flag(Ui.GREEN, "Only $sp% of your nights drop under 6h", "Short nights are the exception for you rather than the pattern, which is the part that matters most for long-term risk.")
        })
        if (midSD != null && midSD > 1) flags.add(Flag(AMBER, "Your sleep timing swings ±${Math.round(midSD * 60)} minutes", "A midpoint that moves by more than an hour night to night is the profile linked to raised cardiometabolic risk independently of duration. Anchoring the wake time is usually easier than anchoring the bedtime."))
        else if (midSD != null) flags.add(Flag(Ui.GREEN, "Your sleep timing is steady, ±${Math.round(midSD * 60)} minutes", "A consistent midpoint is protective on its own, and it is the cheapest of these four to hold on to."))
        if (all.eff >= 88) flags.add(Flag(Ui.GREEN, "Efficiency sits at ${f1(all.eff)}%", "Above the 85% mark usually treated as healthy. When you are asleep you stay asleep — your weak spot is how long you are in bed, not how well you use it."))
        else flags.add(Flag(Ui.BLUE, "Efficiency sits at ${f1(all.eff)}%", "You lose about ${hm(wake)} a night to lying awake. Below roughly 85% is where fragmentation starts being associated with higher blood pressure."))
        if (longPct >= 10) flags.add(Flag(Ui.BLUE, "${Math.round(longPct)}% of nights run past 9h", "Long sleep carries risk associations too, though these are widely read as illness causing the long sleep rather than the reverse. Worth noticing, not worth worrying about on its own."))
        // SpO2: a nightly minimum that keeps dipping under 90% is the standard screening flag
        val spo = allDays.filter { it["spo2"] != null && it["spo2min"] != null }
        if (spo.size >= 30) {
            val avg = mean(spo.map { it["spo2"]!! }); val low = spo.count { it["spo2min"]!! < 90 }; val lowPct = 100.0 * low / spo.size
            flags.add(if (lowPct >= 20) Flag(AMBER, "Blood oxygen dips below 90% on ${Math.round(lowPct)}% of measured nights",
                "Your average SpO2 is ${f1(avg)}%, which is normal, but the nightly minimum falls under 90% on $low of ${spo.size} nights. Repeated overnight desaturation is the usual screening signal for sleep-disordered breathing. This is the one number here worth mentioning to a doctor rather than acting on yourself.")
            else Flag(Ui.GREEN, "Blood oxygen averages ${f1(avg)}%", "The nightly minimum drops below 90% on only ${Math.round(lowPct)}% of measured nights, so there is no persistent desaturation pattern in this data."))
        }
        val rhr = real.filter { it["rhr"] != null }
        if (rhr.size >= 20) flags.add(Flag(Ui.BLUE, "Resting heart rate averages ${Math.round(mean(rhr.map { it["rhr"]!! }))} bpm",
            "For context rather than scoring: it barely moves with your sleep (r = ${corr(rhr.map { it.asleep }, rhr.map { it["rhr"]!! })}), so it does no work in the number above. Its long-run trend is still the most useful single cardiovascular marker your watch records."))
        return Risk(score, grade, comps, flags)
    }

    // ── Healthiest year (website _slpYearHealth) ────────────────────────────
    class Metric(val k: String, val w: Double, val dir: Int, val label: String, val fmt: (Double) -> String)
    class YearRow(val year: String, val nights: Int, val v: Map<String, Double?>) { val norm = HashMap<String, Double>(); var score = 0 }
    class Years(val rows: List<YearRow>, val metrics: List<Metric>, val winner: YearRow, val loser: YearRow, val drivers: List<Triple<Metric, Double, Double>>)

    internal fun years(real: List<Night>, allDays: List<Night>): Years? {
        val byYear = real.groupBy { it.date.take(4) }.toSortedMap()
        if (byYear.size < 2) return null
        val rows = byYear.map { (y, g) ->
            val days = allDays.filter { it.date.startsWith(y) }
            val x = agg(g)
            val mids = g.filter { it["bed"] != null && it["up"] != null }.map { it["bed"]!! + (it["up"]!! - it["bed"]!!) / 2 }
            fun pick(k: String) = days.mapNotNull { it[k] }.takeIf { it.size >= 20 }?.average()
            YearRow(y, g.size, mapOf("asleep" to x.asleep, "reg" to (if (mids.size > 20) sd(mids) else null), "under6" to 100.0 * g.count { it.asleep < 360 } / g.size,
                "eff" to x.eff, "deepPct" to 100 * x.deep / (x.deep + x.rem + x.light), "rhr" to pick("rhr"), "hrv" to pick("hrv"), "stress" to pick("stress"), "steps" to pick("steps")))
        }
        val metrics = listOf(
            Metric("asleep", 0.22, 1, "Sleep per night") { hm(it) },
            Metric("reg", 0.15, -1, "Timing regularity") { "±${Math.round(it * 60)}m" },
            Metric("under6", 0.10, -1, "Short nights") { "${Math.round(it)}%" },
            Metric("eff", 0.12, 1, "Efficiency") { f1(it) + "%" },
            Metric("deepPct", 0.08, 1, "Deep sleep share") { f1(it) + "%" },
            Metric("rhr", 0.13, -1, "Resting heart rate") { "${Math.round(it)} bpm" },
            Metric("hrv", 0.08, 1, "HRV") { "${Math.round(it)} ms" },
            Metric("stress", 0.07, -1, "Stress") { "${Math.round(it)}" },
            Metric("steps", 0.05, 1, "Daily steps") { String.format(Locale.US, "%,d", Math.round(it)) },
        ).filter { m -> rows.all { r -> r.v[m.k]?.isNaN() == false } }
        if (metrics.isEmpty()) return null
        val wsum = metrics.sumOf { it.w }
        // min–max across your own years; a flat metric scores 50 everywhere
        metrics.forEach { m ->
            val vals = rows.map { it.v[m.k]!! }; val lo = vals.minOrNull()!!; val hi = vals.maxOrNull()!!
            rows.forEach { r -> val n = if (hi == lo) 50.0 else 100 * (r.v[m.k]!! - lo) / (hi - lo); r.norm[m.k] = if (m.dir > 0) n else 100 - n }
        }
        rows.forEach { r -> r.score = Math.round(metrics.sumOf { r.norm[it.k]!! * it.w } / wsum).toInt() }
        val ranked = rows.sortedByDescending { it.score }
        val win = ranked.first(); val lose = ranked.last()
        val drivers = metrics.map { m -> Triple(m, (win.norm[m.k]!! - lose.norm[m.k]!!) * m.w, 0.0) }.filter { it.second > 0 }.sortedByDescending { it.second }.take(3)
            .map { Triple(it.first, win.v[it.first.k]!!, lose.v[it.first.k]!!) }
        return Years(rows, metrics, win, lose, drivers)
    }

    // ── Drawing ─────────────────────────────────────────────────────────────
    private fun bar(a: AppActivity, pct: Double, c: Int) = LinearLayout(a).apply {
        background = GradientDrawable().apply { setColor(Ui.LINE); cornerRadius = Ui.dp(a, 3).toFloat() }
        val p = pct.coerceIn(0.0, 100.0)
        addView(View(a).apply { background = GradientDrawable().apply { setColor(c); cornerRadius = Ui.dp(a, 3).toFloat() } }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, p.toFloat()))
        addView(View(a), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, (100 - p).toFloat()))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Ui.dp(a, 6))
    }
    private fun note(a: AppActivity, s: String) = Ui.text(a, s, 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 8), 0, 0) }
    private fun valueColor(row: LinearLayout, c: Int) = row.apply { (getChildAt(childCount - 1) as? android.widget.TextView)?.setTextColor(c) }

    fun draw(a: AppActivity, col: LinearLayout, all: List<Night>, real: List<Night>, train: Map<String, Train>) {
        records(real, train)?.let { r ->
            col.addView(Ui.heading(a, "Your records"))
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, "The single best and worst nights on file, and what you had done that day", 11f, Ui.MUTED))
                r.nights.forEach { x -> addView(Ui.divider(a)); addView(valueColor(Ui.row(a, x.label, x.value, x.date + " · " + x.ctx), x.color)) }
                r.bestWeek?.let { w -> addView(Ui.divider(a)); addView(valueColor(Ui.row(a, "Best 7 nights in a row", hm(w.asleep), "${Ui.date(w.from)} → ${Ui.date(w.to)} · ${Math.round(w.deep)} min deep · ${Math.round(w.rem)} min REM a night"), Ui.GREEN)) }
                r.worstWeek?.let { w -> addView(Ui.divider(a)); addView(valueColor(Ui.row(a, "Worst 7 nights in a row", hm(w.asleep), "${Ui.date(w.from)} → ${Ui.date(w.to)} · ${Math.round(w.deep)} min deep · ${Math.round(w.rem)} min REM a night"), Ui.RED)) }
                r.goodRun?.let { (n, f, t) -> addView(Ui.divider(a)); addView(valueColor(Ui.row(a, "Longest run of 7h+ nights", "$n nights", "${Ui.date(f)} → ${Ui.date(t)} · back to back, no night under 7h"), Ui.GREEN)) }
            })

            val b = r.best; val w = r.worst
            col.addView(Ui.heading(a, "Your ${r.tierSize} best nights against your ${r.tierSize} worst"))
            col.addView(Ui.card(a).apply {
                addView(Ui.row(a, "", "Best  ·  Worst"))
                listOf("Total sleep" to (hm(b.asleep) to hm(w.asleep)), "Bedtime" to (clock(b.bed) to clock(w.bed)), "Wake time" to (clock(b.up) to clock(w.up)),
                    "Deep" to ("${Math.round(b.deep)}m" to "${Math.round(w.deep)}m"), "REM" to ("${Math.round(b.rem)}m" to "${Math.round(w.rem)}m"),
                    "Efficiency" to (f1(b.eff) + "%" to f1(w.eff) + "%"), "Wake-ups" to (f1(b.wakeups) to f1(w.wakeups)),
                    "Rode the day before" to ("${Math.round(b.trainedPct)}%" to "${Math.round(w.trainedPct)}%"), "Most common day" to (b.dow.take(3) to w.dow.take(3)),
                ).forEach { (l, v) -> addView(Ui.divider(a)); addView(Ui.row(a, l, "${v.first}  ·  ${v.second}")) }
                if (!b.bed.isNaN() && !w.bed.isNaN() && !b.up.isNaN() && !w.up.isNaN()) {
                    val bedGap = Math.abs((w.bed - b.bed) * 60); val upGap = Math.abs((b.up - w.up) * 60)
                    val head = "Your best nights start at ${clock(b.bed)} and end at ${clock(b.up)}; your worst start at ${clock(w.bed)} and end at ${clock(w.up)}."
                    val tail = if (bedGap > upGap * 1.5) "The bedtime moves ${hm(bedGap)} between the two groups while the wake time barely shifts — the morning is fixed for you, so the whole difference is decided the night before."
                        else if (upGap > bedGap * 1.5) "The wake time moves ${hm(upGap)} while the bedtime barely shifts, so what separates a good night from a bad one is whether you got to stay in bed, not when you turned in."
                        else "Both ends move, and by almost the same amount — ${hm(bedGap)} earlier to bed and ${hm(upGap)} later up. A good night is not one thing going right, it is an early bedtime and an unhurried morning arriving together, which is why they cluster on the days with nothing scheduled."
                    addView(note(a, "$head $tail"))
                }
            })

            col.addView(Ui.heading(a, "Month by month"))
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, "Every month on record, newest first. Months with fewer than 15 tracked nights are marked and left out of the best/worst ranking.", 11f, Ui.MUTED))
                r.months.reversed().forEach { m ->
                    val tag = if (m.month == r.bestMonth?.month) " · best" else if (m.month == r.worstMonth?.month) " · worst" else if (!m.full) " · ${m.nights} nights" else ""
                    addView(Ui.divider(a))
                    val row = Ui.row(a, Ui.date(m.month + "-01").substringAfter(' ') + tag, hm(m.asleep),
                        "deep ${Math.round(m.deep)}m · REM ${Math.round(m.rem)}m" + (if (!m.eff.isNaN()) " · ${f1(m.eff)}%" else "") +
                            " · ${Math.round(100.0 * m.under6 / m.nights)}% under 6h · best ${hm(m.best.asleep)} on ${Ui.date(m.best.date)}")
                    addView(if (m.month == r.bestMonth?.month) valueColor(row, Ui.GREEN) else if (m.month == r.worstMonth?.month) valueColor(row, Ui.RED) else row)
                }
                val bm = r.bestMonth; val wm = r.worstMonth
                if (bm != null && wm != null) addView(note(a, "Your best full month was ${bm.month} at ${hm(bm.asleep)} a night; your worst was ${wm.month} at ${hm(wm.asleep)}. That is a swing of ${hm(bm.asleep - wm.asleep)} a night between two months of your own life — bigger than the gap between your training days and your rest days."))
            })
        }

        risk(real, all)?.let { k ->
            col.addView(Ui.heading(a, "What this means for your long-term health"))
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, "Your numbers against ordinary adult sleep guidance, and what the research associates with each pattern", 11f, Ui.MUTED))
                addView(LinearLayout(a).apply {
                    setPadding(0, Ui.dp(a, 8), 0, Ui.dp(a, 4))
                    addView(Ui.text(a, "${k.score}", 34f, scoreColor(k.score), true).apply { setPadding(0, 0, Ui.dp(a, 4), 0) })
                    addView(Ui.text(a, "/ 100  ", 12f, Ui.MUTED))
                    addView(Ui.text(a, k.grade, 16f, scoreColor(k.score), true))
                    gravity = android.view.Gravity.CENTER_VERTICAL
                })
                addView(Ui.text(a, "A weighted read of the four sleep measures with the strongest health evidence behind them: duration (40%), timing regularity (25%), efficiency (20%) and stage balance (15%). It is scored against published guidance, not against other people.", 11f, Ui.MUTED))
                k.comps.filter { it.score != null }.forEach { c ->
                    val s = Math.round(c.score!!).toInt()
                    addView(LinearLayout(a).apply {
                        setPadding(0, Ui.dp(a, 12), 0, Ui.dp(a, 4))
                        addView(Ui.text(a, c.label, 13f, Ui.TEXT, true), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                        addView(Ui.text(a, "$s/100", 13f, scoreColor(s), true))
                    })
                    addView(bar(a, s.toDouble(), scoreColor(s)))
                    addView(Ui.text(a, c.read, 12f, Ui.TEXT).apply { setPadding(0, Ui.dp(a, 4), 0, 0) })
                    addView(Ui.text(a, c.ev, 11f, Ui.MUTED))
                }
            })
            k.flags.forEach { f ->
                col.addView(Ui.card(a).apply {
                    addView(Ui.text(a, f.title, 13f, f.tone, true))
                    addView(Ui.text(a, f.body, 12f, Ui.TEXT).apply { setPadding(0, Ui.dp(a, 4), 0, 0) })
                })
            }
            col.addView(note(a, "These are population-level associations from sleep research, applied to your own tracked numbers — not a diagnosis, a screening result, or medical advice. A wrist tracker estimates sleep stages rather than measuring them. If something here worries you, particularly the blood-oxygen figures, take it to a doctor rather than to a dashboard."))
        }

        years(real, all)?.let { y ->
            col.addView(Ui.heading(a, "Your healthiest year was ${y.winner.year}"))
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, "Each measure normalised across your own years, then weighted. 100 means your best year on that measure — this ranks your years against each other, not against anybody else.", 11f, Ui.MUTED))
                y.rows.sortedByDescending { it.score }.forEach { r ->
                    addView(Ui.divider(a))
                    addView(valueColor(Ui.row(a, "${r.year} · ${r.nights} nights", "${r.score}",
                        y.metrics.joinToString(" · ") { m -> m.label.lowercase(Locale.US) + " " + m.fmt(r.v[m.k]!!) + if (r.norm[m.k] == y.rows.maxOf { it.norm[m.k]!! }) " ★" else "" }), scoreColor(r.score)))
                }
                val d = y.drivers.joinToString(", ") { (m, wv, lv) -> "${m.label.lowercase(Locale.US)} (${m.fmt(wv)} vs ${m.fmt(lv)})" }
                addView(note(a, "★ = your best year on that measure. ${y.winner.year} comes out ahead, mostly on $d. The weakest year was ${y.loser.year}. Ride volume is deliberately left out of this score: Strava only returns your most recent activities, so the earlier years would look artificially quiet and would drag the ranking around for no real reason. Note too that the first and last years on file are partial."))
            })
        }
    }
}
