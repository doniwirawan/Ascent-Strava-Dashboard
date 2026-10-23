package xyz.doniwirawan.ascent

import android.content.ContentValues
import android.provider.MediaStore
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import xyz.doniwirawan.ascent.SleepHealth.corr
import xyz.doniwirawan.ascent.SleepInsights.Night
import xyz.doniwirawan.ascent.SleepInsights.Train
import xyz.doniwirawan.ascent.SleepInsights.agg
import xyz.doniwirawan.ascent.SleepInsights.clock
import xyz.doniwirawan.ascent.SleepInsights.mean
import xyz.doniwirawan.ascent.SleepInsights.next

/**
 * The website's sleep export (js/sleep.js slpExport): one row per date joining
 * the watch's nights and daily metrics with that day's Strava rides, as CSV,
 * JSON or SQL in Downloads. And its sleepAiSummary: the same analysis boiled
 * down for the AI Coach, so it can reason about sleep around rides.
 */
object SleepData {
    /** name, SQL type, description — once, so every format stays in step. */
    private val COLS = listOf(
        Triple("date", "TEXT", "calendar date; sleep columns describe the night you woke up ON this date"),
        Triple("weekday", "TEXT", "Mon–Sun"),
        Triple("asleep_min", "INTEGER", "total sleep, minutes"),
        Triple("deep_min", "INTEGER", "deep sleep, minutes"),
        Triple("light_min", "INTEGER", "light sleep, minutes"),
        Triple("rem_min", "INTEGER", "REM sleep, minutes"),
        Triple("awake_min", "INTEGER", "time awake in bed, minutes"),
        Triple("nap_min", "INTEGER", "daytime naps, minutes; excluded from asleep_min"),
        Triple("wakeups", "INTEGER", "number of times you surfaced"),
        Triple("time_in_bed_min", "INTEGER", "minutes between lights out and getting up"),
        Triple("efficiency_pct", "REAL", "asleep_min / time_in_bed_min"),
        Triple("bedtime_h", "REAL", "local decimal hours, negative before midnight (-0.5 = 23:30)"),
        Triple("bedtime", "TEXT", "local clock time"),
        Triple("waketime_h", "REAL", "local decimal hours"),
        Triple("waketime", "TEXT", "local clock time"),
        Triple("midpoint_h", "REAL", "midpoint of the night, decimal hours; the regularity metric"),
        Triple("resting_hr", "INTEGER", "bpm"),
        Triple("hr_min", "INTEGER", "lowest bpm that day"),
        Triple("hr_max", "INTEGER", "highest bpm that day"),
        Triple("hrv", "INTEGER", "ms"),
        Triple("hrv_min", "INTEGER", "ms"),
        Triple("hrv_max", "INTEGER", "ms"),
        Triple("stress_mean", "INTEGER", "day's mean stress score, 0–100"),
        Triple("stress_min", "INTEGER", "day's lowest stress reading"),
        Triple("stress_max", "INTEGER", "day's highest stress reading"),
        Triple("stress_samples", "INTEGER", "how many stress readings were taken"),
        Triple("spo2_avg", "REAL", "average blood oxygen, %"),
        Triple("spo2_min", "REAL", "lowest blood oxygen, %"),
        Triple("calories_active", "INTEGER", "kcal the watch attributes to movement; NOT total daily expenditure"),
        Triple("steps_raw", "INTEGER", "steps as the watch counted them, inflated on riding days"),
        Triple("steps_phantom", "INTEGER", "estimated steps produced by riding rather than walking"),
        Triple("steps_walked", "INTEGER", "steps_raw minus steps_phantom"),
        Triple("walk_distance_m", "INTEGER", "metres, as counted from steps"),
        Triple("active_min", "INTEGER", "minutes the watch counted as active"),
        Triple("floors", "INTEGER", "floors climbed"),
        Triple("mood_happy", "INTEGER", "self-logged mood entries"),
        Triple("mood_peaceful", "INTEGER", "self-logged mood entries"),
        Triple("mood_unhappy", "INTEGER", "self-logged mood entries"),
        Triple("trained", "INTEGER", "1 if Strava recorded an activity on this date"),
        Triple("ride_count", "INTEGER", "activities recorded that day"),
        Triple("ride_min", "REAL", "total moving time, minutes"),
        Triple("ride_km", "REAL", "total distance"),
        Triple("relative_effort", "INTEGER", "Strava's suffer score for the day"),
        Triple("ride_start", "TEXT", "earliest start time that day, local clock"),
    )
    private const val NOTE = "Sleep and body metrics from a Huawei Health (TruSleep) export, joined by date to " +
        "cycling recorded on an iGPSport head unit and synced through Strava. A night is labelled with " +
        "the date you WOKE UP: sleep columns dated D are the sleep BEFORE training on D. Durations are " +
        "minutes; bedtime_h and waketime_h are local decimal hours, negative before midnight. " +
        "calories_active is the watch movement burn, not total daily expenditure. steps_phantom is an " +
        "estimate of the steps a ride produced by shaking the wrist, fitted from your own ride hours."
    private val SHORT_DOW = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

    /** Numbers print like the website's (JavaScript): 420, not 420.0. */
    internal fun js(v: Any?): String = when (v) {
        null -> ""
        is Double -> if (v % 1 == 0.0 && Math.abs(v) < 1e15) Math.round(v).toString() else v.toString()
        else -> v.toString()
    }

    /** One map per date, website _slpExportRows. Values are Double, Long, Int or String; null = empty. */
    internal fun rows(all: List<Night>, train: Map<String, Train>): List<Map<String, Any?>> {
        val ph = SleepBody.steps(all, train)?.corrected ?: emptyMap()
        fun r2(v: Double?) = v?.takeIf { !it.isNaN() }?.let { Math.round(it * 100) / 100.0 }
        return all.map { n ->
            val t = train[n.date]; val p = ph[n.date]
            val bed = n["bed"]; val up = n["up"]
            mapOf(
                "date" to n.date, "weekday" to SHORT_DOW[SleepInsights.dow(n.date)],
                "asleep_min" to n["asleep"]?.takeIf { it != 0.0 }, "deep_min" to n["deep"]?.takeIf { it != 0.0 },
                "light_min" to n["light"]?.takeIf { it != 0.0 }, "rem_min" to n["rem"]?.takeIf { it != 0.0 },
                "awake_min" to n["wake"], "nap_min" to n["nap"], "wakeups" to n["wakeups"], "time_in_bed_min" to n["tib"],
                "efficiency_pct" to r2(n["eff"]), "bedtime_h" to r2(bed), "bedtime" to bed?.let { clock(it) },
                "waketime_h" to r2(up), "waketime" to up?.let { clock(it) }, "midpoint_h" to r2(if (bed != null && up != null) bed + (up - bed) / 2 else null),
                "resting_hr" to n["rhr"], "hr_min" to n["hrmin"], "hr_max" to n["hrmax"], "hrv" to n["hrv"], "hrv_min" to n["hrvmin"], "hrv_max" to n["hrvmax"],
                "stress_mean" to n["stress"], "stress_min" to n["smin"], "stress_max" to n["smax"], "stress_samples" to n["scnt"],
                "spo2_avg" to n["spo2"], "spo2_min" to n["spo2min"], "calories_active" to n["cal"], "steps_raw" to n["steps"],
                "steps_phantom" to p?.first, "steps_walked" to (p?.second ?: n["steps"]),
                "walk_distance_m" to n["dist"], "active_min" to n["active"], "floors" to n["floors"],
                "mood_happy" to n["mhappy"], "mood_peaceful" to n["mpeace"], "mood_unhappy" to n["mbad"],
                "trained" to (if (t != null) 1 else 0), "ride_count" to (t?.n ?: 0), "ride_min" to t?.let { r2(it.min) }, "ride_km" to t?.let { r2(it.dist / 1000) },
                "relative_effort" to t?.re?.takeIf { it != 0.0 }, "ride_start" to t?.startH?.let { clock(it) },
            )
        }
    }

    internal fun csv(rows: List<Map<String, Any?>>): String {
        // RFC 4180: quote anything containing a comma, quote or newline
        fun q(v: Any?) = js(v).let { s -> if (Regex("[\",\n]").containsMatchIn(s)) "\"" + s.replace("\"", "\"\"") + "\"" else s }
        return (listOf(COLS.joinToString(",") { it.first }) + rows.map { r -> COLS.joinToString(",") { q(r[it.first]) } }).joinToString("\n")
    }

    internal fun json(rows: List<Map<String, Any?>>, generated: String): String = JSONObject()
        .put("generated", generated).put("note", NOTE)
        .put("columns", JSONObject().apply { COLS.forEach { put(it.first, it.third) } })
        .put("days", rows.size)
        .put("data", JSONArray(rows.map { r -> JSONObject().apply { COLS.forEach { c -> put(c.first, r[c.first] ?: JSONObject.NULL) } } }))
        .toString(2)

    internal fun sql(rows: List<Map<String, Any?>>): String {
        fun lit(v: Any?) = when (v) { null -> "NULL"; is Number -> js(v); else -> "'" + v.toString().replace("'", "''") + "'" }
        val l = ArrayList<String>()
        // the note as a wrapped comment, then a table that SQLite, Postgres and MySQL all accept
        l.add(Regex("(.{1,96})(\\s|$)").findAll(NOTE).joinToString("\n") { "-- " + it.groupValues[1] })
        l.addAll(listOf("", "DROP TABLE IF EXISTS health_daily;", "CREATE TABLE health_daily ("))
        l.add(COLS.mapIndexed { i, c -> "  ${c.first} ${c.second}" + (if (i == 0) " PRIMARY KEY" else "") + (if (i < COLS.size - 1) "," else "") + "  -- ${c.third}" }.joinToString("\n"))
        l.addAll(listOf(");", ""))
        rows.chunked(100).forEach { chunk ->
            l.add("INSERT INTO health_daily (" + COLS.joinToString(", ") { it.first } + ") VALUES")
            l.add(chunk.joinToString(",\n") { r -> "  (" + COLS.joinToString(", ") { lit(r[it.first]) } + ")" } + ";")
            l.add("")
        }
        return l.joinToString("\n")
    }

    private fun save(a: AppActivity, name: String, mime: String, text: String) = runCatching {
        val v = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, name); put(MediaStore.Downloads.MIME_TYPE, mime) }
        val uri = a.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v)!!
        a.contentResolver.openOutputStream(uri)!!.use { it.write(text.toByteArray()) }
        "Saved $name to Downloads."
    }.getOrElse { "Couldn't save: ${it.message}" }

    private var status = ""

    fun draw(a: AppActivity, col: LinearLayout, all: List<Night>, train: Map<String, Train>) {
        if (all.isEmpty()) return
        col.addView(Ui.heading(a, "Take your data with you"))
        col.addView(Ui.card(a).apply {
            addView(Ui.text(a, "${all.size} days × ${COLS.size} columns in one table — every sleep stage, body signal and daily total from the watch, joined by date to the ride Strava recorded that day. Built on the phone; nothing is uploaded.", 12f, Ui.TEXT))
            val base = "ascent-health-" + java.time.LocalDate.now()
            listOf("csv" to "Save CSV", "json" to "Save JSON", "sql" to "Save SQL").forEach { (f, l) ->
                addView(a.button(l) {
                    val rows = rows(all, train)
                    status = when (f) {
                        "csv" -> save(a, "$base.csv", "text/csv", csv(rows))
                        "json" -> save(a, "$base.json", "application/json", json(rows, java.time.Instant.now().toString()))
                        else -> save(a, "$base.sql", "application/sql", sql(rows))
                    }
                    a.show(a.currentPage())
                })
            }
            if (status.isNotEmpty()) addView(Ui.text(a, status, 12f, Ui.GREEN, true))
            addView(Ui.text(a, "CSV opens straight in Excel, Sheets or pandas. JSON carries a column dictionary describing every field and its units. SQL drops and recreates a health_daily table, so it loads into SQLite or Postgres as-is. All three share the same columns and the same night-labelling rule: a night is dated by the morning you woke up, so sleep dated D is the sleep before you rode on D.", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 8), 0, 0) })
        })
    }

    // ── For the AI Coach (website sleepAiSummary) ───────────────────────────
    private fun r1(v: Double?): Any = v?.takeIf { !it.isNaN() }?.let { Math.round(it * 10) / 10.0 } ?: JSONObject.NULL
    /** Website _slpAgg's wake is NaN when any night lacks it, so it goes out as null. */
    private fun grp(g: List<Night>): JSONObject { val x = agg(g)
        return JSONObject().put("nights", x.n).put("asleep_min", r1(x.asleep)).put("deep_min", r1(x.deep)).put("rem_min", r1(x.rem)).put("light_min", r1(x.light))
            .put("wake_min", r1(if (g.any { it["wake"] == null }) Double.NaN else mean(g.map { it["wake"]!! }))) }

    fun summary(all: List<Night>, acts: List<JSONObject>): JSONObject? {
        val real = all.filter { it.asleep >= 60 }
        if (real.isEmpty()) return null
        val train = SleepInsights.trainingDays(acts)
        val byDate = real.associateBy { it.date }
        val tDates = train.keys.sorted()
        val days = if (tDates.isEmpty()) emptyList() else generateSequence(tDates.first()) { next(it) }.takeWhile { it <= tDates.last() }.toList()
        // the night after training vs rest, and by the day's load in quarters
        val aT = ArrayList<Night>(); val aR = ArrayList<Night>()
        val loads = train.values.map { it.load }.filter { it > 0 }.sorted()
        val cuts = listOf(0.25, 0.5, 0.75).map { loads.getOrElse((loads.size * it).toInt()) { 0.0 } }
        val buckets = linkedMapOf("rest" to ArrayList<Night>(), "easy" to ArrayList(), "moderate" to ArrayList(), "hard" to ArrayList(), "vhard" to ArrayList())
        days.forEach { d ->
            val nn = byDate[next(d)] ?: return@forEach
            val t = train[d]
            (if (t != null) aT else aR).add(nn)
            buckets[if (t == null) "rest" else if (t.load <= cuts[0]) "easy" else if (t.load <= cuts[1]) "moderate" else if (t.load <= cuts[2]) "hard" else "vhard"]!!.add(nn)
        }
        // day of week, inside the window where both sources exist
        val win = if (tDates.isEmpty()) real else real.filter { it.date >= tDates.first() && it.date <= next(tDates.last()) }
        val wLo = win.firstOrNull()?.date; val wHi = win.lastOrNull()?.date
        val dow = JSONArray(listOf(1, 2, 3, 4, 5, 6, 0).map { i ->
            val x = agg(win.filter { SleepInsights.dow(it.date) == i })
            JSONObject().put("day", SHORT_DOW[i]).put("nights", x.n).put("asleep_min", r1(x.asleep)).put("deep_min", r1(x.deep))
                .put("training_days", train.keys.count { wLo != null && it >= wLo && it <= wHi!! && SleepInsights.dow(it) == i })
        })
        class Start(val h: Double, val sleep: Double, val hours: Double)
        val starts = train.mapNotNull { (d, t) -> val n = byDate[d]; if (n != null && t.startH != null) Start(t.startH!!, n.asleep, t.min / 60) else null }
        val dawn = starts.filter { it.h < 6 }; val later = starts.filter { it.h >= 6 }
        val bigDays = train.keys.filter { train[it]!!.min >= 120 }.sorted()
        val bp = real.filter { it["bed"] != null && it["up"] != null }
        var bedSlope: Double? = null
        if (bp.size > 50) {
            val mx = mean(bp.map { it["bed"]!! }); val my = mean(bp.map { it["up"]!! })
            val den = bp.sumOf { (it["bed"]!! - mx) * (it["bed"]!! - mx) }
            if (den != 0.0) bedSlope = bp.sumOf { (it["bed"]!! - mx) * (it["up"]!! - my) } / den
        }
        val all7 = agg(real)
        val withBed = real.filter { it["bed"] != null }
        val sameDay = train.mapNotNull { (d, t) -> byDate[d]?.let { t to it } }
        val perRide = tDates.filter { byDate.containsKey(it) || byDate.containsKey(next(it)) }.takeLast(30).map { d ->
            val t = train[d]!!; val b = byDate[d]; val af = byDate[next(d)]
            JSONObject().put("date", d).put("start_time", t.startH?.let { clock(it) } ?: JSONObject.NULL).put("moving_h", r1(t.min / 60)).put("km", r1(t.dist / 1000))
                .put("relative_effort", if (t.re > 0) t.re else JSONObject.NULL)
                .put("sleep_before_min", b?.get("asleep") ?: JSONObject.NULL).put("deep_before_min", b?.get("deep") ?: JSONObject.NULL)
                .put("bedtime_before", b?.get("bed")?.let { clock(it) } ?: JSONObject.NULL).put("woke_before", b?.get("up")?.let { clock(it) } ?: JSONObject.NULL)
                .put("sleep_after_min", af?.get("asleep") ?: JSONObject.NULL).put("deep_after_min", af?.get("deep") ?: JSONObject.NULL).put("rem_after_min", af?.get("rem") ?: JSONObject.NULL)
        }
        val pt = SleepBody.patterns(all, train)
        fun v(s: SleepBody.Stat?) = s?.let { JSONObject().put("mean", r1(it.v)).put("days", it.n) } ?: JSONObject.NULL
        val last = real.last().date
        return JSONObject()
            .put("_README", "Personal sleep from a Huawei Health TruSleep export, joined to Strava. A night is labelled with the date you WOKE UP: the night dated D is the sleep BEFORE training on D, " +
                "and the night dated D+1 is the recovery sleep AFTER training on D. All durations are MINUTES. Bedtimes/wake times are local clock strings. Treat correlations with |r| < 0.2 as weak and say so; " +
                "always respect the sample sizes given and never claim a causal effect the numbers do not support.")
            .put("coverage", JSONObject().put("nights", real.size).put("first", real.first().date).put("last", last)
                .put("note", "Sleep tracking ends $last. Any training after that date has no sleep to pair with — say so rather than guessing."))
            .put("baseline", grp(real).put("efficiency_pct", r1(all7.eff)).put("typical_bedtime", clock(all7.bed)).put("typical_waketime", clock(mean(real.mapNotNull { it["up"] })))
                .put("nights_under_6h_pct", Math.round(100.0 * real.count { it.asleep < 360 } / real.size)).put("nights_over_7h_pct", Math.round(100.0 * real.count { it.asleep >= 420 } / real.size)))
            .put("night_after_training_vs_rest", JSONObject().put("after_training", grp(aT)).put("after_rest", grp(aR)))
            .put("next_night_by_training_load", JSONObject().apply { buckets.filter { it.value.isNotEmpty() }.forEach { (k, g) -> put(k, grp(g)) } })
            .put("by_day_of_week", dow)
            .put("ride_start_time", JSONObject()
                .put("before_0600", JSONObject().put("rides", dawn.size).put("sleep_min", r1(mean(dawn.map { it.sleep }))).put("avg_ride_h", r1(mean(dawn.map { it.hours }))))
                .put("from_0600", JSONObject().put("rides", later.size).put("sleep_min", r1(mean(later.map { it.sleep }))).put("avg_ride_h", r1(mean(later.map { it.hours })))))
            .put("recovery_arc_around_2h_plus_days", JSONObject().put("days", bigDays.size).put("nights", JSONArray(listOf(-1L, 0L, 1L, 2L).map { k ->
                grp(bigDays.mapNotNull { byDate[next(it, k)] }).put("offset", k).put("label", if (k == 0L) "night of the ride" else if (k < 0) "night before" else "night after") })))
            .put("bedtime_regression", bedSlope?.let { JSONObject().put("nights", bp.size).put("wake_shift_per_hour_later_to_bed", r1(it)).put("minutes_of_sleep_lost_per_hour_later", Math.round(60 * (1 - it))) } ?: JSONObject.NULL)
            .put("stage_mix_by_year", JSONArray(real.groupBy { it.date.take(4) }.toSortedMap().map { (y, g) -> val x = agg(g); val tot = x.deep + x.rem + x.light
                JSONObject().put("year", y).put("nights", x.n).put("asleep_min", r1(x.asleep)).put("deep_pct", r1(100 * x.deep / tot)).put("rem_pct", r1(100 * x.rem / tot)).put("light_pct", r1(100 * x.light / tot)) }))
            .put("correlations", JSONObject()
                .put("bedtime_vs_total_sleep", corr(withBed.map { it["bed"]!! }, withBed.map { it.asleep }) ?: JSONObject.NULL)
                .put("bedtime_vs_rem", corr(withBed.map { it["bed"]!! }, withBed.map { it.rem }) ?: JSONObject.NULL)
                .put("bedtime_vs_deep", corr(withBed.map { it["bed"]!! }, withBed.map { it.deep }) ?: JSONObject.NULL)
                .put("ride_start_hour_vs_sleep_that_morning", corr(starts.map { it.h }, starts.map { it.sleep }) ?: JSONObject.NULL)
                .put("ride_duration_vs_start_hour", corr(starts.map { it.h }, starts.map { it.hours }) ?: JSONObject.NULL)
                .put("sleep_that_morning_vs_ride_duration", corr(sameDay.map { it.second.asleep }, sameDay.map { it.first.min / 60 }) ?: JSONObject.NULL))
            .put("recent_rides_with_sleep", JSONArray(perRide))
            .put("patterns", pt?.let { p -> JSONObject()
                .put("_note", "Group means. Row D = the night before D + that day's stats. bed is hours from midnight (−1.5 = 22:30). Differences under ~2× their SE are chance.")
                .put("last_night_sleep_to_that_day", JSONArray(p.sleep.map { r -> JSONObject().put("slept", r.label).put("stress", v(r.s["stress"])).put("hrv_ms", v(r.s["hrv"])).put("rhr_bpm", v(r.s["rhr"])).put("steps", v(r.s["steps"])) }))
                .put("training_time_to_body", JSONArray(p.time.map { r -> JSONObject().put("trained", r.label).put("stress_that_day", v(r.s["stress"])).put("bed_that_night", v(r.s["bed"])).put("sleep_min_that_night", v(r.s["asleep"])).put("hrv_next_morning", v(r.s["hrvNext"])).put("rhr_next_morning", v(r.s["rhrNext"])) }))
                .put("bedtime_to_next_day", JSONArray(p.bed.map { r -> JSONObject().put("bed", r.label).put("sleep_min", v(r.s["asleep"])).put("stress", v(r.s["stress"])).put("hrv_ms", v(r.s["hrv"])).put("rhr_bpm", v(r.s["rhr"])) }))
            } ?: JSONObject.NULL)
    }
}
