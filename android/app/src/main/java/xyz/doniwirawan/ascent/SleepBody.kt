package xyz.doniwirawan.ascent

import android.widget.LinearLayout
import org.json.JSONObject
import xyz.doniwirawan.ascent.SleepHealth.corr
import xyz.doniwirawan.ascent.SleepInsights.Night
import xyz.doniwirawan.ascent.SleepInsights.Train
import xyz.doniwirawan.ascent.SleepInsights.clock
import xyz.doniwirawan.ascent.SleepInsights.hm
import xyz.doniwirawan.ascent.SleepInsights.mean
import xyz.doniwirawan.ascent.SleepInsights.next
import java.util.Locale

/**
 * The watch's daily body data joined with Strava, as on the website
 * (js/sleep.js): daily stress, calories and movement, phantom steps from the
 * bike, what a ride does to the next morning, what the night does to the ride,
 * and the patterns between sleep, training time and bedtime. Rows are dated by
 * the morning you woke, so row D carries the night before D and D's own day.
 */
object SleepBody {
    private val AMBER = 0xFFF59E0B.toInt()
    private val YELLOW = 0xFFFBBF24.toInt()
    private fun f1(v: Double) = String.format(Locale.US, "%.1f", v)
    private fun num(v: Double) = String.format(Locale.US, "%,d", Math.round(v))
    private fun sgn(v: Double, d: Int) = String.format(Locale.US, "%.${d}f", Math.abs(v)).let { t -> (if (t.toDouble() == 0.0) "±" else if (v > 0) "+" else "−") + t }
    private fun vals(g: List<Night>, k: String) = g.mapNotNull { it[k] }.filter { !it.isNaN() }

    // ── Daily stress (website _slpStressAnalysis) ───────────────────────────
    class Grp(val n: Int, val v: Double)
    class Tier(val label: String, val n: Int, val stress: Double, val asleep: Double, val deep: Double)
    class Stress(val n: Int, val mean: Double, val bands: List<Pair<String, Int>>, val peakN: Int, val byDow: List<Pair<String, Double>>,
                 val monthly: List<Pair<String, Double>>, val tiers: List<Tier>, val hi: Night, val lo: Night, val spread: Triple<Double, Double, Double>?,
                 val onRide: Grp, val onRest: Grp, val afterRide: Grp, val afterRest: Grp, val rSleep: Double?, val rNext: Double?)

    internal fun stress(allDays: List<Night>, train: Map<String, Train>, byDate: Map<String, Night>): Stress? {
        val g = allDays.filter { it["stress"] != null }
        if (g.size < 40) return null
        fun grp(l: List<Night>) = Grp(l.size, mean(l.map { it["stress"]!! }))
        // band the day's PEAK: Huawei's bands describe one reading, not a day's mean
        val peak = g.filter { it["smax"] != null }
        val bands = listOf(Triple("Relaxed", 0.0, 30.0), Triple("Normal", 30.0, 60.0), Triple("Medium", 60.0, 80.0), Triple("High", 80.0, 101.0))
            .map { (l, lo, hi) -> l to peak.count { it["smax"]!! >= lo && it["smax"]!! < hi } }
        val byDow = listOf(1, 2, 3, 4, 5, 6, 0).map { i -> SleepInsights.DOW[i] to g.filter { SleepInsights.dow(it.date) == i } }
            .filter { it.second.size >= 3 }.map { it.first to mean(it.second.map { n -> n["stress"]!! }) }
        val sleepToday = g.filter { (byDate[it.date]?.asleep ?: 0.0) >= 60 }
        val nextNight = g.mapNotNull { d -> byDate[next(d.date)]?.takeIf { it.asleep >= 60 }?.let { d["stress"]!! to it } }
        val srt = nextNight.sortedBy { it.first }; val t3 = srt.size / 3
        val tiers = if (srt.size >= 30) listOf("Calmest days" to srt.subList(0, t3), "Typical" to srt.subList(t3, 2 * t3), "Most stressed days" to srt.subList(2 * t3, srt.size))
            .map { (l, x) -> Tier(l, x.size, mean(x.map { it.first }), mean(x.map { it.second.asleep }), mean(x.map { it.second.deep })) } else emptyList()
        val monthly = g.groupBy { it.date.take(7) }.toSortedMap().map { (m, q) -> m to mean(q.map { it["stress"]!! }) }
        val ws = g.filter { it["smin"] != null && it["smax"] != null }
        return Stress(g.size, mean(g.map { it["stress"]!! }), bands, peak.size, byDow, monthly, tiers,
            g.maxByOrNull { it["stress"]!! }!!, g.minByOrNull { it["stress"]!! }!!,
            if (ws.isNotEmpty()) Triple(mean(ws.map { it["smin"]!! }), mean(ws.map { it["smax"]!! }), mean(ws.mapNotNull { it["scnt"] })) else null,
            grp(g.filter { train.containsKey(it.date) }), grp(g.filter { !train.containsKey(it.date) }),
            grp(g.filter { train.containsKey(next(it.date, -1)) }), grp(g.filter { !train.containsKey(next(it.date, -1)) }),
            corr(sleepToday.map { byDate[it.date]!!.asleep }, sleepToday.map { it["stress"]!! }), corr(nextNight.map { it.first }, nextNight.map { it.second.asleep }))
    }

    // ── Calories and movement (website _slpEnergy) ──────────────────────────
    class Day3(val cal: Double, val steps: Double, val active: Double)
    class Energy(val n: Int, val cal: Double, val steps: Double, val dist: Double, val active: Double, val totalCal: Double, val totalSteps: Double,
                 val ride: Day3, val rest: Day3, val monthly: List<Pair<String, Double>>, val topCal: Night, val stepDays: Int, val cross: Triple<Int, Pair<Double, Double>, Double?>?)

    internal fun energy(allDays: List<Night>, train: Map<String, Train>, acts: List<JSONObject>): Energy? {
        val g = allDays.filter { it["cal"] != null && it["steps"] != null }
        if (g.size < 40) return null
        fun d3(l: List<Night>) = Day3(mean(l.map { it["cal"]!! }), mean(l.map { it["steps"]!! }), mean(l.mapNotNull { it["active"] }))
        // the watch's kcal against the power meter's kJ on the same days: two devices, one ride
        val kj = HashMap<String, Double>()
        acts.forEach { a -> val k = a.optDouble("kilojoules", 0.0); val d = a.optString("start_date_local").take(10); if (k > 0 && d.length == 10) kj[d] = (kj[d] ?: 0.0) + k }
        val pair = g.filter { kj.containsKey(it.date) }
        val cross = if (pair.size >= 8) Triple(pair.size, mean(pair.map { kj[it.date]!! }) to mean(pair.map { it["cal"]!! }), corr(pair.map { kj[it.date]!! }, pair.map { it["cal"]!! })) else null
        return Energy(g.size, mean(g.map { it["cal"]!! }), mean(g.map { it["steps"]!! }), mean(g.mapNotNull { it["dist"] }), mean(g.mapNotNull { it["active"] }),
            g.sumOf { it["cal"]!! }, g.sumOf { it["steps"]!! }, d3(g.filter { train.containsKey(it.date) }), d3(g.filter { !train.containsKey(it.date) }),
            g.groupBy { it.date.take(7) }.toSortedMap().map { (m, q) -> m to mean(q.map { it["steps"]!! }) }, g.maxByOrNull { it["cal"]!! }!!, g.count { it["steps"]!! >= 10000 }, cross)
    }

    // ── Phantom steps (website _slpSteps) ───────────────────────────────────
    class Steps(val base: Double, val rideMean: Double, val perHour: Double?, val r: Double?, val rN: Int, val rawMean: Double, val realMean: Double,
                val big: Int, val bigRide: Int, val bigWalk: Int, val bigReal: Int, val worst: Triple<String, Double, Double>)

    internal fun steps(allDays: List<Night>, train: Map<String, Train>): Steps? {
        val g = allDays.filter { it["steps"] != null }
        val tDates = train.keys.sorted()
        if (g.size < 40 || tDates.isEmpty()) return null
        // only inside the Strava window: before it, "no ride" just means no history
        val win = g.filter { it.date >= tDates.first() && it.date <= tDates.last() }
        if (win.size < 30) return null
        val rideDays = win.filter { train.containsKey(it.date) }; val restDays = win.filter { !train.containsKey(it.date) }
        if (rideDays.size < 10 || restDays.size < 10) return null
        // steps booked per riding hour: least squares of steps on hours
        val xs = rideDays.map { train[it.date]!!.min / 60 }; val ys = rideDays.map { it["steps"]!! }
        val mx = mean(xs); val my = mean(ys)
        val den = xs.sumOf { (it - mx) * (it - mx) }
        val perHour = if (den != 0.0) xs.indices.sumOf { (xs[it] - mx) * (ys[it] - my) } / den else null
        fun phantom(d: Night): Double { val t = train[d.date]; return if (t == null || perHour == null || perHour <= 0) 0.0 else maxOf(0.0, minOf(d["steps"]!!, perHour * (t.min / 60))) }
        val big = win.filter { it["steps"]!! >= 10000 }
        val bigRide = big.filter { train.containsKey(it.date) }
        val worst = win.maxByOrNull { Math.round(phantom(it)) }!!
        return Steps(mean(restDays.map { it["steps"]!! }), mean(ys), perHour, corr(xs, ys), xs.size, mean(win.map { it["steps"]!! }),
            mean(win.map { Math.round(it["steps"]!! - phantom(it)).toDouble() }), big.size, bigRide.size, big.size - bigRide.size,
            bigRide.count { it["steps"]!! - phantom(it) >= 10000 }, Triple(worst.date, worst["steps"]!!, Math.round(phantom(worst)).toDouble()))
    }

    // ── What the bike does to the next morning (website _slpBikeBody) ──────
    class Sig(val k: String, val label: String, val unit: String, val cells: List<Double?>, val r: Double?)
    class Bike(val rows: List<Sig>, val groupN: List<Int>, val steps: Pair<Double, Double>?) {
        fun cell(k: String, i: Int) = rows.find { it.k == k }?.cells?.get(i)
    }

    internal fun bike(allDays: List<Night>, train: Map<String, Train>): Bike? {
        val loads = train.values.map { it.load }.filter { it > 0 }.sorted()
        if (loads.size < 20) return null
        val cuts = listOf(loads[(loads.size * 0.33).toInt()], loads[(loads.size * 0.66).toInt()])
        fun label(d: String) = train[d]?.let { if (it.load <= cuts[0]) 1 else if (it.load <= cuts[1]) 2 else 3 } ?: 0
        val groups = List(4) { ArrayList<Night>() }
        allDays.forEach { d ->
            val prev = next(d.date, -1)
            if (!train.containsKey(prev) && !train.containsKey(d.date) && !train.containsKey(next(d.date, -2))) return@forEach
            groups[label(prev)].add(d)
        }
        val rows = listOf(Triple("rhr", "Resting heart rate", "bpm"), Triple("hrv", "HRV", "ms"), Triple("stress", "Stress", ""), Triple("spo2", "Blood oxygen", "%")).map { (k, l, u) ->
            val cells = groups.map { q -> vals(q, k).takeIf { it.size >= 5 }?.average() }
            val pts = allDays.mapNotNull { d -> val t = train[next(d.date, -1)]; if (t != null && t.load > 0 && d[k] != null) t.load to d[k]!! else null }
            Sig(k, l, u, cells, corr(pts.map { it.first }, pts.map { it.second }))
        }.filter { r -> r.cells.any { it != null } }
        val ws = allDays.filter { it["steps"] != null }
        val rs = ws.filter { train.containsKey(it.date) }; val rest = ws.filter { !train.containsKey(it.date) }
        return Bike(rows, groups.map { it.size }, if (rs.size >= 10 && rest.size >= 10) mean(rs.map { it["steps"]!! }) to mean(rest.map { it["steps"]!! }) else null)
    }

    // ── What the night does to the ride (website _slpBodyBike) ─────────────
    /** Least squares with an intercept, Gauss–Jordan with partial pivoting. */
    internal fun ols(x: List<DoubleArray>, y: List<Double>): DoubleArray? {
        val k = x[0].size + 1
        val a = Array(k) { DoubleArray(k) }; val b = DoubleArray(k)
        x.forEachIndexed { i, xi -> val r = doubleArrayOf(1.0, *xi); for (p in 0 until k) { b[p] += r[p] * y[i]; for (q in 0 until k) a[p][q] += r[p] * r[q] } }
        for (i in 0 until k) {
            var m = i; for (r in i + 1 until k) if (Math.abs(a[r][i]) > Math.abs(a[m][i])) m = r
            a[i] = a[m].also { a[m] = a[i] }; b[i] = b[m].also { b[m] = b[i] }
            if (a[i][i] == 0.0) return null
            for (r in 0 until k) if (r != i) { val f = a[r][i] / a[i][i]; for (c in i until k) a[r][c] -= f * a[i][c]; b[r] -= f * b[i] }
        }
        return DoubleArray(k) { b[it] / a[it][it] }
    }

    class Effect(val label: String, val good: Int, val n: Int, val rS: Double, val rH: Double, val sigS: Boolean, val sigH: Boolean,
                 val hiS: Double, val loS: Double, val hiH: Double, val loH: Double, val nHi: Int, val nLo: Int)

    internal fun bodyBike(allDays: List<Night>, acts: List<JSONObject>): Pair<List<Effect>, Int>? {
        val idx = allDays.withIndex().associate { it.value.date to it.index }
        fun base(i: Int, k: String) = allDays.subList(maxOf(0, i - 30), i).mapNotNull { it[k] }.takeIf { it.size >= 10 }?.average()
        class Row(val spd: Double, val hr: Double, val epk: Double, val ld: Double, val dev: Map<String, Double?>) { var rs = 0.0; var rh = 0.0 }
        val rows = acts.mapNotNull { a ->
            if (!Screens.isRide(a) || a.optString("sport_type") == "VirtualRide" || a.optBoolean("trainer") || a.optDouble("moving_time", 0.0) < 1800 ||
                a.optDouble("average_heartrate", 0.0) <= 0 || a.optDouble("distance", 0.0) <= 0) return@mapNotNull null
            val i = idx[a.optString("start_date_local").take(10)] ?: return@mapNotNull null
            val n = allDays[i]                                  // the night that ended that morning
            if (n.asleep < 180) return@mapNotNull null
            val km = a.optDouble("distance") / 1000
            Row(a.optDouble("average_speed") * 3.6, a.optDouble("average_heartrate"), a.optDouble("total_elevation_gain", 0.0) / km, Math.log(km),
                listOf("hrv" to "hrv", "rhr" to "rhr", "asleep" to "sleep").associate { (k, o) -> val b = base(i, k); o to (if (n[k] != null && b != null) n[k]!! - b else null) })
        }
        if (rows.size < 20) return null
        val bs = ols(rows.map { doubleArrayOf(it.epk, it.ld) }, rows.map { it.spd }) ?: return null
        val bh = ols(rows.map { doubleArrayOf(it.spd, it.epk) }, rows.map { it.hr }) ?: return null
        rows.forEach { it.rs = it.spd - (bs[0] + bs[1] * it.epk + bs[2] * it.ld); it.rh = it.hr - (bh[0] + bh[1] * it.spd + bh[2] * it.epk) }
        val out = listOf(Triple("hrv", "HRV", 1), Triple("rhr", "Resting heart rate", -1), Triple("sleep", "Sleep length", 1)).mapNotNull { (k, l, good) ->
            val r = rows.filter { it.dev[k] != null }
            if (r.size < 20) return@mapNotNull null
            val hi = r.filter { it.dev[k]!! > 0 }; val lo = r.filter { it.dev[k]!! <= 0 }
            val rS = corr(r.map { it.dev[k]!! }, r.map { it.rs }) ?: return@mapNotNull null
            val rH = corr(r.map { it.dev[k]!! }, r.map { it.rh }) ?: return@mapNotNull null
            val thr = 2 / Math.sqrt(r.size.toDouble())
            Effect(l, good, r.size, rS, rH, Math.abs(rS) >= thr, Math.abs(rH) >= thr, mean(hi.map { it.rs }), mean(lo.map { it.rs }), mean(hi.map { it.rh }), mean(lo.map { it.rh }), hi.size, lo.size)
        }
        return if (out.isEmpty()) null else out to rows.size
    }

    // ── Patterns: sleep → the day, training time → the body, bedtime → tomorrow (website _slpPatterns) ──
    class Stat(val v: Double, val n: Int, val sd: Double)
    class PRow(val k: String, val label: String, val n: Int, val s: Map<String, Stat?>)
    class Finding(val text: String)
    class Patterns(val sleep: List<PRow>, val time: List<PRow>, val bed: List<PRow>, val findings: List<Finding>)

    internal fun patterns(allDays: List<Night>, train: Map<String, Train>): Patterns? {
        val byDay = allDays.associateBy { it.date }
        fun stat(g: List<Night>, k: String): Stat? { val v = vals(g, k); if (v.size < 5) return null; val m = v.average(); return Stat(m, v.size, Math.sqrt(v.map { (it - m) * (it - m) }.average())) }
        fun diff(a: Stat?, b: Stat?): Pair<Double, Boolean>? {
            if (a == null || b == null) return null
            val se = Math.sqrt(a.sd * a.sd / a.n + b.sd * b.sd / b.n).let { if (it == 0.0 || it.isNaN()) 1.0 else it }
            return (a.v - b.v) to (Math.abs(a.v - b.v) > 2 * se)
        }
        val sleepRows = listOf(Triple("lt6", "Under 6 h", 60.0 to 360.0), Triple("6to7", "6–7 h", 360.0 to 420.0), Triple("7to8", "7–8 h", 420.0 to 480.0), Triple("8p", "8 h or more", 480.0 to 1e9)).map { (k, l, r) ->
            val g = allDays.filter { it.asleep >= r.first && it.asleep < r.second }
            PRow(k, l, g.size, listOf("stress", "hrv", "rhr", "steps").associateWith { stat(g, it) })
        }.filter { it.n >= 5 }
        val tDates = train.keys.sorted()
        val tb = linkedMapOf("morning" to ArrayList<Night>(), "midday" to ArrayList(), "evening" to ArrayList(), "rest" to ArrayList())
        if (tDates.isNotEmpty()) allDays.forEach { d ->
            if (d.date < tDates.first() || d.date > tDates.last()) return@forEach
            val h = train[d.date]?.startH
            tb[if (h == null) "rest" else if (h < 10) "morning" else if (h < 15) "midday" else "evening"]!!.add(d)
        }
        val tl = mapOf("morning" to "Morning (before 10:00)", "midday" to "Midday (10:00–15:00)", "evening" to "Afternoon / evening (15:00+)", "rest" to "Rest day")
        val timeRows = tb.map { (k, g) ->
            val nxt = g.mapNotNull { byDay[next(it.date)] }; val slept = nxt.filter { it.asleep >= 60 }
            PRow(k, tl[k]!!, g.size, mapOf("stress" to stat(g, "stress"), "asleep" to stat(slept, "asleep"), "bed" to stat(slept, "bed"), "hrvNext" to stat(nxt, "hrv"), "rhrNext" to stat(nxt, "rhr")))
        }.filter { it.n >= 5 }
        val bedRows = listOf(Triple("early", "Before 22:30", -99.0 to -1.5), Triple("mid", "22:30–23:30", -1.5 to -0.5), Triple("late", "After 23:30", -0.5 to 99.0)).map { (k, l, r) ->
            val g = allDays.filter { it.asleep >= 60 && it["bed"] != null && it["bed"]!! >= r.first && it["bed"]!! < r.second }
            PRow(k, l, g.size, listOf("asleep", "stress", "hrv", "rhr").associateWith { stat(g, it) })
        }.filter { it.n >= 5 }

        fun fmt(k: String, s: Stat) = when (k) { "bed" -> clock(s.v); "asleep" -> hm(s.v); "steps" -> num(s.v); else -> "${Math.round(s.v)}" }
        val texts = mapOf(
            "sleep" to mapOf("stress" to "After a night under 6 h your stress that day averages %1, against %2 after 7 h or more — %3.",
                "hrv" to "After a night under 6 h your HRV reads %1 ms, against %2 ms after 7 h or more — %3.",
                "rhr" to "After a night under 6 h your resting heart rate is %1 bpm, against %2 bpm after 7 h or more — %3.",
                "steps" to "After a night under 6 h you walk %1 steps, against %2 after 7 h or more — %3. Short nights tend to come with busy days."),
            "time" to mapOf("stress" to "On days you train in the morning your stress averages %1, against %2 when you train in the afternoon or evening — %3.",
                "stressRest" to "Morning-training days run at stress %1, against %2 on rest days — %3.",
                "bed" to "After an afternoon or evening session you go to bed around %1, against %2 after a morning one — %3.",
                "asleep" to "You sleep %1 after an afternoon or evening session, against %2 after a morning one — %3.",
                "hrvNext" to "The morning after a morning session your HRV reads %1 ms, against %2 ms after an evening one — %3."),
            "bed" to mapOf("stress" to "After going to bed past 23:30 your stress the next day averages %1, against %2 after an earlier night — %3.",
                "hrv" to "After a bedtime past 23:30 your HRV reads %1 ms, against %2 ms after an earlier night — %3.",
                "asleep" to "Going to bed past 23:30 gets you %1 of sleep, against %2 on earlier nights — %3."))
        class F(val w: Double, val text: String)
        val found = ArrayList<F>(); val none = ArrayList<F>()
        fun add(a: Stat?, b: Stat?, min: Double, k: String, grp: String) {
            val d = diff(a, b) ?: return
            if (Math.abs(d.first) < min) return
            val t = texts[grp]!![k]!!.replace("%1", fmt(k, a!!)).replace("%2", fmt(k, b!!)).replace("%3", if (d.second) "a clear difference" else "a slight difference, could be chance")
            found.add(F(Math.abs(d.first) / min * (if (d.second) 2 else 1), t))
        }
        fun flat(a: Stat?, b: Stat?, min: Double, grp: String) {
            val d = diff(a, b) ?: return
            if (Math.abs(d.first) >= min) return
            none.add(F(0.0, (if (grp == "sleep") "A short night barely moves your stress: %1 after under 6 h, %2 after 7 h or more."
                else "When you train barely moves your stress: %1 on morning-training days, %2 on afternoon or evening ones.").replace("%1", fmt("stress", a!!)).replace("%2", fmt("stress", b!!))))
        }
        fun s(k: String) = sleepRows.find { it.k == k }
        fun t(k: String) = timeRows.find { it.k == k }
        fun b(k: String) = bedRows.find { it.k == k }
        val short = s("lt6"); val good = s("7to8") ?: s("8p")
        if (short != null && good != null) {
            add(short.s["stress"], good.s["stress"], 2.0, "stress", "sleep"); add(short.s["hrv"], good.s["hrv"], 2.0, "hrv", "sleep")
            add(short.s["rhr"], good.s["rhr"], 1.0, "rhr", "sleep"); add(short.s["steps"], good.s["steps"], 800.0, "steps", "sleep")
        }
        val mo = t("morning"); val ev = t("evening"); val rest = t("rest")
        if (mo != null && ev != null) {
            add(mo.s["stress"], ev.s["stress"], 2.0, "stress", "time"); add(ev.s["bed"], mo.s["bed"], 0.25, "bed", "time")
            add(ev.s["asleep"], mo.s["asleep"], 10.0, "asleep", "time"); add(mo.s["hrvNext"], ev.s["hrvNext"], 2.0, "hrvNext", "time")
        }
        if (mo != null && rest != null) add(mo.s["stress"], rest.s["stress"], 2.0, "stressRest", "time")
        val late = b("late"); val early = b("early") ?: b("mid")
        if (late != null && early != null) {
            add(late.s["stress"], early.s["stress"], 2.0, "stress", "bed"); add(late.s["hrv"], early.s["hrv"], 2.0, "hrv", "bed")
            add(late.s["asleep"], early.s["asleep"], 10.0, "asleep", "bed")
        }
        // the questions people ask most deserve an answer even when it's "not really"
        if (short != null && good != null) flat(short.s["stress"], good.s["stress"], 2.0, "sleep")
        if (mo != null && ev != null) flat(mo.s["stress"], ev.s["stress"], 2.0, "time")
        if (sleepRows.isEmpty() && timeRows.isEmpty() && bedRows.isEmpty()) return null
        return Patterns(sleepRows, timeRows, bedRows, (found.sortedByDescending { it.w }.take(6) + none).map { Finding(it.text) })
    }

    // ── Drawing ─────────────────────────────────────────────────────────────
    private fun note(a: AppActivity, s: String) = Ui.text(a, s, 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 8), 0, 0) }
    private fun sub(a: AppActivity, s: String) = Ui.text(a, s, 11f, Ui.MUTED)
    private fun table(a: AppActivity, card: LinearLayout, title: String, rows: List<Pair<String, String>>) {
        card.addView(Ui.text(a, title, 13f, Ui.TEXT, true).apply { setPadding(0, Ui.dp(a, 12), 0, 0) })
        rows.forEach { (l, s) -> card.addView(Ui.divider(a)); card.addView(Ui.row(a, l, "", s)) }
    }

    fun draw(a: AppActivity, col: LinearLayout, all: List<Night>, real: List<Night>, train: Map<String, Train>, acts: List<JSONObject>) {
        val byDate = real.associateBy { it.date }

        stress(all, train, byDate)?.let { s ->
            val dRide = s.onRide.v - s.onRest.v
            col.addView(Ui.heading(a, "Daily stress"))
            col.addView(sub(a, "${s.n} days measured. The watch samples a stress score through the day — about ${Math.round(s.spread?.third ?: 0.0)} readings a day — and the export keeps the day’s mean, low and high."))
            col.addView(Ui.tiles(a, listOf(
                "${Math.round(s.mean)}" to ("Average day" + (s.spread?.let { " · ${Math.round(it.first)} low · ${Math.round(it.second)} high" } ?: "")),
                "${Math.round(s.lo["stress"]!!)}" to "Calmest day · ${Ui.date(s.lo.date)}",
                "${Math.round(s.hi["stress"]!!)}" to "Most stressed day · ${Ui.date(s.hi.date)}",
                (if (dRide >= 0) "+" else "−") + f1(Math.abs(dRide)) to "Riding days vs rest · ${f1(s.onRide.v)} vs ${f1(s.onRest.v)}",
            )))
            col.addView(Ui.card(a).apply {
                if (s.peakN > 0) {
                    addView(Ui.text(a, "How high the day’s stress peaked", 13f, Ui.TEXT, true))
                    addView(Ui.text(a, s.bands.joinToString("  ·  ") { (l, n) -> "$l ${Math.round(100.0 * n / s.peakN)}%" }, 12f, Ui.TEXT).apply { setPadding(0, Ui.dp(a, 4), 0, Ui.dp(a, 8)) })
                }
                val months = s.monthly.takeLast(24)
                if (months.size >= 2) {
                    addView(Ui.text(a, "Average stress per month", 13f, Ui.TEXT, true))
                    addView(Screens.chart(a, BarChart(a).apply { color = YELLOW; set(months.map { it.second }.toDoubleArray(), months.map { it.first.takeLast(2) }) }, 120))
                }
                if (s.byDow.isNotEmpty()) table(a, this, "By day of the week", s.byDow.map { (d, v) -> d to "stress ${f1(v)}" })
                if (s.tiers.isNotEmpty()) table(a, this, "Stress that day → the next night", s.tiers.map { t -> "${t.label} · ${t.n} days" to "stress ${f1(t.stress)} · slept ${hm(t.asleep)} · deep ${Math.round(t.deep)}m" })
                addView(note(a, "Stress on a riding day runs ${f1(s.onRide.v)} against ${f1(s.onRest.v)} on a rest day, and the morning AFTER a ride sits at ${f1(s.afterRide.v)} against ${f1(s.afterRest.v)}. Against last night’s sleep the correlation is r = ${s.rSleep}, and against the night that follows r = ${s.rNext} — both weak, so treat this as a mood-and-load barometer rather than something that predicts your sleep. This is also the join the Huawei app cannot make: it never sees the rides, because they come off the head unit into Strava."))
            })
        }

        energy(all, train, acts)?.let { e ->
            col.addView(Ui.heading(a, "Calories and movement"))
            col.addView(sub(a, "${e.n} days of the watch’s own daily totals. These are ACTIVE calories — the burn the watch attributes to movement — not a full daily energy expenditure: the export carries no height or age, so there is no honest way to build a resting rate from it."))
            col.addView(Ui.tiles(a, listOf(
                num(e.cal) to "Active kcal a day · ${num(e.totalCal)} in total", num(e.steps) to "Steps a day · ${e.stepDays} days over 10k",
                "${Math.round(e.active)}m" to "Active minutes a day · ${f1(e.dist / 1000)} km walked", num(e.topCal["cal"]!!) to "Biggest burn · ${Ui.date(e.topCal.date)}",
            )))
            col.addView(Ui.card(a).apply {
                val months = e.monthly.takeLast(24)
                if (months.size >= 2) {
                    addView(Ui.text(a, "Steps a day, per month", 13f, Ui.TEXT, true))
                    addView(Screens.chart(a, BarChart(a).apply { color = Ui.BLUE; set(months.map { it.second }.toDoubleArray(), months.map { it.first.takeLast(2) }) }, 120))
                }
                table(a, this, "Riding days against rest days", listOf(
                    "Active kcal" to "${num(e.ride.cal)} vs ${num(e.rest.cal)} (+${num(e.ride.cal - e.rest.cal)})",
                    "Steps" to "${num(e.ride.steps)} vs ${num(e.rest.steps)} (+${num(e.ride.steps - e.rest.steps)})",
                    "Active minutes" to "${Math.round(e.ride.active)} vs ${Math.round(e.rest.active)} (+${Math.round(e.ride.active - e.rest.active)})"))
                e.cross?.let { (n, kw, r) ->
                    val ratio = kw.second / kw.first
                    addView(note(a, "Two devices that have never spoken to each other, measuring the same rides: on the $n days your power meter recorded work, the iGPSport logged ${num(kw.first)} kJ of mechanical work while the watch counted ${num(kw.second)} active kcal — a ratio of ${String.format(Locale.US, "%.2f", ratio)} to 1, correlating at r = $r. Cycling runs at roughly 22–25% gross efficiency, which is why kJ of work and kcal burned are expected to land near 1:1. " +
                        if (Math.abs(ratio - 1) < 0.25) "Yours land close to it, so the two devices genuinely corroborate each other." else "Yours do not, so treat the watch’s calorie figure as its own rough estimate rather than a measurement — the bike’s power data is the more trustworthy of the two."))
                }
                addView(note(a, "Across ${e.n} tracked days the watch counted ${num(e.totalCal)} active kcal and ${num(e.totalSteps)} steps. Read the calories as a relative measure — good for comparing your months against each other, not for balancing against food."))
            })
        }

        steps(all, train)?.let { p ->
            col.addView(Ui.heading(a, "Your step count is lying to you"))
            col.addView(sub(a, "Big step days, checked against Strava to see whether you were actually walking"))
            col.addView(Ui.tiles(a, listOf(
                "${Math.round(100.0 * p.bigRide / maxOf(1, p.big))}%" to "of 10k+ days were ride days · ${p.bigRide} of ${p.big}",
                (p.perHour?.let { num(it) } ?: "—") to "phantom steps per riding hour · r = ${p.r} across ${p.rN} ride days",
                num(p.rawMean) to "Steps the watch claims · daily average", num(p.realMean) to "Steps you actually walked · ${Math.round(100 * (1 - p.realMean / p.rawMean))}% lower",
            )))
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, "Your rides are recorded on an iGPSport head unit and reach this dashboard through Strava — the watch on your wrist never learns the ride happened, so it books four hours of road buzz as walking. On rest days you average ${num(p.base)} steps; on riding days ${num(p.rideMean)}. That gap tracks riding time closely enough (${p.perHour?.let { num(it) } ?: "—"} steps per hour on the bike, r = ${p.r}) that it can be subtracted out.", 12f, Ui.TEXT))
                addView(note(a, "Corrected, only ${p.bigReal + p.bigWalk} of your ${p.big} ten-thousand-step days were genuinely spent on your feet, and your real daily walking average is ${num(p.realMean)} rather than the ${num(p.rawMean)} on the watch face. Your biggest phantom day was ${Ui.date(p.worst.first)}: ${num(p.worst.second)} steps recorded, an estimated ${num(p.worst.third)} of them from the bike."))
            })
        }

        bike(all, train)?.let { b ->
            val names = listOf("Rest day", "Easy", "Moderate", "Hard")
            col.addView(Ui.heading(a, "What the bike does to your body the next morning"))
            col.addView(Ui.card(a).apply {
                addView(sub(a, "Every body signal the watch recorded, read on the morning AFTER a ride and grouped by how hard that ride was"))
                b.rows.forEach { r ->
                    table(a, this, r.label + (r.r?.let { " · r = $it vs load" } ?: ""), names.indices.map { i ->
                        "${names[i]} · ${b.groupN[i]} days" to (r.cells[i]?.let { (if (r.k == "spo2") f1(it) else "${Math.round(it)}") + if (r.unit.isNotEmpty()) " ${r.unit}" else "" } ?: "—")
                    })
                }
                val rr = b.cell("rhr", 0); val rh = b.cell("rhr", 3); val sr = b.cell("stress", 0); val sh = b.cell("stress", 3)
                addView(note(a, if (rr != null && rh != null) "The morning after your hardest third of rides your resting heart rate reads ${Math.round(rh)} bpm against ${Math.round(rr)} after a rest day — a ${sgn(rh - rr, 1)} bpm cost that clears within a day. " +
                    (if (sr != null && sh != null) "Stress follows the same shape, ${Math.round(sh)} against ${Math.round(sr)}. " else "") + "This is the whole point of joining the two sources: Strava knows what you did, the watch knows what it cost, and neither app can see the other half."
                    else "Strava knows what you did and the watch knows what it cost — joining them is the only way to see the price of a hard day."))
                b.steps?.let { (ride, rest) -> addView(note(a, "Worth reading alongside the step correction above: you record ${num(ride)} steps on riding days against ${num(rest)} on rest days, and most of that gap is the bike shaking your wrist rather than extra walking.")) }
            })
        }

        bodyBike(all, acts)?.let { (sigs, n) ->
            col.addView(Ui.heading(a, "What your night does to the ride"))
            col.addView(Ui.card(a).apply {
                addView(sub(a, "Ride speed and heart rate, corrected for climbing and distance, after nights above vs below your own 30-night baseline"))
                sigs.forEach { s ->
                    addView(Ui.divider(a))
                    addView(Ui.row(a, "${s.label} · ${s.n} rides", "r ${String.format(Locale.US, "%.2f", s.rS)}${if (s.sigS) " ✓" else ""}",
                        "above baseline ${sgn(s.hiS, 1)} km/h, ${sgn(s.hiH, 1)} bpm (n ${s.nHi}) · below ${sgn(s.loS, 1)} km/h, ${sgn(s.loH, 1)} bpm (n ${s.nLo}) · HR r ${String.format(Locale.US, "%.2f", s.rH)}${if (s.sigH) " ✓" else ""}"))
                }
                val real2 = sigs.filter { it.sigS || it.sigH }
                addView(Ui.text(a, if (real2.isNotEmpty()) real2.joinToString(" ") { s ->
                    val helps = (if (s.sigS) Math.signum(s.rS) else -Math.signum(s.rH)) * s.good > 0
                    if (helps) "${s.label} matters for you: a better night before shows up as a better ride." else "${s.label} runs against expectation for you — rides after a “better” night were no better, often worse."
                } else "No clear effect yet: across these rides, last night’s HRV, resting HR and sleep don’t predict how fast or at what heart rate you ride. Your pace is set more by the route and how hard you choose to go than by recovery — so the Readiness score is a guide for how hard to go, not a forecast of your speed.", 12f, Ui.TEXT).apply { setPadding(0, Ui.dp(a, 8), 0, 0) })
                addView(note(a, "✓ = beyond chance (|r| ≥ 2/√n). Positive km/h = faster than usual for that route; negative bpm = lower heart rate than usual for that speed. $n rides with heart rate matched to a night."))
            })
        }

        patterns(all, train)?.let { p ->
            fun r(s: Stat?, f: (Double) -> String) = s?.let { f(it.v) } ?: "—"
            col.addView(Ui.heading(a, "Patterns in your body"))
            col.addView(Ui.card(a).apply {
                addView(sub(a, "How last night’s sleep, the time you train and your bedtime show up in stress, HRV and resting heart rate — joining the watch with Strava"))
                if (p.findings.isEmpty()) addView(note(a, "No difference big enough to call out yet — more nights will sharpen this."))
                p.findings.forEach { addView(Ui.text(a, "•  " + it.text, 13f, Ui.TEXT).apply { setPadding(0, Ui.dp(a, 4), 0, Ui.dp(a, 2)) }) }
                if (p.sleep.isNotEmpty()) table(a, this, "Last night’s sleep → that day", p.sleep.map { x ->
                    "${x.label} · ${x.n} days" to "stress ${r(x.s["stress"]) { "${Math.round(it)}" }} · HRV ${r(x.s["hrv"]) { "${Math.round(it)} ms" }} · resting HR ${r(x.s["rhr"]) { "${Math.round(it)} bpm" }} · ${r(x.s["steps"]) { num(it) }} steps" })
                if (p.time.isNotEmpty()) table(a, this, "When you train → the body", p.time.map { x ->
                    "${x.label} · ${x.n} days" to "stress ${r(x.s["stress"]) { "${Math.round(it)}" }} · bed ${r(x.s["bed"]) { clock(it) }} · slept ${r(x.s["asleep"]) { hm(it) }} · next morning HRV ${r(x.s["hrvNext"]) { "${Math.round(it)} ms" }}, resting HR ${r(x.s["rhrNext"]) { "${Math.round(it)} bpm" }}" })
                if (p.bed.isNotEmpty()) table(a, this, "Bedtime → the next day", p.bed.map { x ->
                    "${x.label} · ${x.n} days" to "slept ${r(x.s["asleep"]) { hm(it) }} · stress ${r(x.s["stress"]) { "${Math.round(it)}" }} · HRV ${r(x.s["hrv"]) { "${Math.round(it)} ms" }} · resting HR ${r(x.s["rhr"]) { "${Math.round(it)} bpm" }}" })
                addView(note(a, "These are your own averages, not causes: a short night and a stressful day can both come from the same busy week. Clear means the gap is more than twice its uncertainty; slight means it could be chance."))
            })
        }
    }
}
