package xyz.doniwirawan.ascent

import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale

/**
 * The five native screens. Each one is a pure function of the API responses it
 * names, so AppActivity.load can draw it from the saved copy and again from the
 * fresh one. Power numbers follow the web dashboard (js/utils.js ridePower):
 * power-meter rides only, NP = Strava's weighted average, IF/TSS from FTP.
 */
object Screens {

    private val RIDE_TYPES = setOf("Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide")
    internal fun isRide(a: JSONObject) = (a.optString("sport_type").ifEmpty { a.optString("type") }) in RIDE_TYPES
    internal fun list(arr: JSONArray?): List<JSONObject> = if (arr == null) emptyList() else (0 until arr.length()).map { arr.getJSONObject(it) }
    internal fun chart(a: AppActivity, v: android.view.View, h: Int) =
        v.apply { layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, Ui.dp(a, h)) }

    // ── Home ────────────────────────────────────────────────────────────────
    fun home(a: AppActivity): Unit = a.load(listOf("stats", "activities?limit=300")) { r ->
        val s = r["stats"] ?: return@load
        val col = a.page()
        fun tot(o: JSONObject?) = o ?: JSONObject()
        val w = tot(s.optJSONObject("last_7_days")); val m = tot(s.optJSONObject("last_30_days")); val y = tot(s.optJSONObject("ytd"))

        Repo.cached(a)?.let { snap ->
            val c = Ui.card(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val ring = RecoveryActivity.RingView(a).apply { label = "RECOVERY" }
            ring.set(snap.recovery / 100f, "${snap.recovery}%", Repo.recoveryBandLabel(snap.recovery), Repo.recoveryBandColor(snap.recovery))
            c.addView(ring, LinearLayout.LayoutParams(Ui.dp(a, 120), Ui.dp(a, 120)))
            val t = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(Ui.dp(a, 14), 0, 0, 0) }
            t.addView(Ui.text(a, String.format(Locale.US, "Strain %.1f of 21", snap.strain), 15f, Ui.TEXT, true))
            t.addView(Ui.text(a, when {
                snap.recovery >= 67 -> "Well recovered. Good day to go hard."
                snap.recovery >= 34 -> "Partly recovered. Moderate training is fine."
                else -> "Fatigue is high. Take it easy or rest."
            }, 12f, Ui.MUTED))
            c.addView(t, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
            c.setOnClickListener { a.startActivity(android.content.Intent(a, RecoveryActivity::class.java)) }
            col.addView(c)
        }

        col.addView(Ui.heading(a, "Last 7 days"))
        col.addView(Ui.tiles(a, listOf(
            String.format(Locale.US, "%.1f km", w.optDouble("distance_km")) to "distance|distance",
            String.format(Locale.US, "%.1f h", w.optDouble("moving_hours")) to "moving|time",
            "${w.optInt("elevation_m")} m" to "climbing|climb",
            "${w.optInt("activities")}" to "activities|rides",
        )))

        s.optJSONObject("fitness")?.let { f ->
            col.addView(Ui.heading(a, "Fitness & form"))
            col.addView(Ui.tiles(a, listOf(
                "${f.optInt("ctl")}" to "fitness (CTL)|effort", "${f.optInt("atl")}" to "fatigue (ATL)|energy",
                String.format(Locale.US, "%+d", f.optInt("tsb")) to "form · ${f.optString("form")}", String.format(Locale.US, "%+d", f.optInt("ramp")) to "ramp / week",
            )))
        }

        s.optJSONObject("fitness")?.optJSONArray("last_90_days")?.let { arr ->
            val days = list(arr)
            if (days.size > 1) {
                col.addView(Ui.heading(a, "Fitness & form, 90 days"))
                col.addView(Ui.card(a).apply {
                    addView(chart(a, FitnessChart(a).apply {
                        set(days.map { it.optDouble("ctl") }.toDoubleArray(), days.map { it.optDouble("tsb") }.toDoubleArray(), days.map { Ui.date(it.optString("date")).substringBeforeLast(' ') })
                    }, 160))
                    addView(Ui.text(a, "Orange line: fitness (CTL). Bars: form (TSB) — green fresh, red fatigued.", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
                })
            }
        }

        s.optJSONObject("calendar")?.let { cal ->
            val km = list(cal.optJSONArray("days")).associate { it.optString("date") to it.optDouble("km") }
            col.addView(Ui.heading(a, "Last 12 months · ${km.size} active days"))
            col.addView(Ui.card(a).apply {
                addView(chart(a, CalendarHeat(a).apply { set(cal.optString("from"), km, cal.optString("to")) }, 64))
            })
        }

        s.optJSONObject("latest_ride")?.let { l ->
            col.addView(Ui.heading(a, "Latest ride"))
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, l.optString("name"), 15f, Ui.TEXT, true))
                addView(Ui.text(a, Ui.date(l.optString("date")) + String.format(Locale.US, " · %.1f km · %d m · %d min · %.1f km/h",
                    l.optDouble("distance_km"), l.optInt("elevation_m"), l.optInt("moving_minutes"), l.optDouble("avg_kmh")), 12f, Ui.MUTED))
            })
        }

        col.addView(Ui.heading(a, "This year"))
        col.addView(Ui.tiles(a, listOf(
            String.format(Locale.US, "%,.0f km", y.optDouble("distance_km")) to "distance|distance",
            String.format(Locale.US, "%,d m", y.optInt("elevation_m")) to "climbing|climb",
            String.format(Locale.US, "%.0f h", y.optDouble("moving_hours")) to "moving|time",
            "${y.optInt("activities")}" to "activities|rides",
        )))
        s.optJSONObject("streak")?.let { st ->
            col.addView(Ui.tiles(a, listOf("${st.optInt("weeks")} wk" to "active streak", "${st.optInt("active_days_this_year")}" to "active days")))
        }
        // Strava's own all-time ride totals, and the website's fun comparisons
        s.optJSONObject("all_time")?.let { t ->
            col.addView(Ui.heading(a, "All time · rides"))
            col.addView(Ui.tiles(a, listOf(
                String.format(Locale.US, "%,d km", t.optInt("distance_km")) to "distance|distance",
                String.format(Locale.US, "%,d m", t.optInt("elevation_m")) to "climbing|climb",
                String.format(Locale.US, "%,d h", t.optInt("moving_hours")) to "moving|time",
                String.format(Locale.US, "%,d", t.optInt("rides")) to "rides|rides",
            )))
        }
        s.optJSONObject("fun")?.let { f ->
            col.addView(Ui.card(a).apply {
                addView(Ui.row(a, "Everests climbed", String.format(Locale.US, "%.1f×", f.optDouble("everests"))))
                addView(Ui.divider(a))
                addView(Ui.row(a, "Around the Earth", "${f.optInt("around_the_earth_pct")}%"))
                addView(Ui.divider(a))
                addView(Ui.row(a, "Days in the saddle", String.format(Locale.US, "%.1f", f.optDouble("days_in_the_saddle"))))
                addView(Ui.divider(a))
                addView(Ui.row(a, "Babi guling burned this year", "${f.optInt("babi_guling_this_year")}", String.format(Locale.US, "%,d kcal on the bike", f.optInt("kcal_this_year"))))
            })
        }

        val months = list(s.optJSONArray("by_month")).takeLast(12)
        if (months.isNotEmpty()) {
            col.addView(Ui.heading(a, "Distance per month"))
            col.addView(Ui.card(a).apply {
                addView(chart(a, BarChart(a).apply {
                    set(months.map { it.optDouble("distance_km") }.toDoubleArray(), months.map { it.optString("month").takeLast(2) })
                    highlight = months.size - 1
                }, 150))
            })
        }
        s.optJSONObject("bests")?.let { b ->
            col.addView(Ui.heading(a, "Bests"))
            col.addView(Ui.card(a).apply {
                addView(Ui.row(a, "Longest ride", String.format(Locale.US, "%.1f km", b.optDouble("longest_ride_km"))))
                addView(Ui.row(a, "Biggest climb", "${b.optInt("biggest_climb_m")} m"))
                addView(Ui.row(a, "Fastest average", String.format(Locale.US, "%.1f km/h", b.optDouble("fastest_avg_kmh"))))
                addView(Ui.row(a, "Longest time moving", String.format(Locale.US, "%.1f h", b.optDouble("longest_moving_hours"))))
            })
        }
        // Eddington (website: render-overview.js): the largest E with E rides of ≥ E km
        val rideKm = list(r["activities?limit=300"]?.optJSONArray("activities")).filter { isRide(it) }.map { it.optDouble("distance") / 1000 }
        if (rideKm.isNotEmpty()) {
            val sorted = rideKm.sortedDescending()
            var e = 0; while (e < sorted.size && sorted[e] >= e + 1) e++
            col.addView(Ui.heading(a, "Eddington number"))
            col.addView(Ui.card(a).apply {
                addView(LinearLayout(a).apply {
                    orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                    addView(Ui.text(a, "$e", 40f, Ui.ORANGE, true))
                    addView(Ui.text(a, "$e rides of at least $e km", 13f, Ui.MUTED).apply { setPadding(Ui.dp(a, 14), 0, 0, 0) })
                })
                (e + 1..e + 3).forEach { t ->
                    val have = rideKm.count { it >= t }
                    addView(Ui.divider(a))
                    addView(Ui.row(a, "E = $t", "${maxOf(0, t - have)} more", "rides of ≥ $t km · have $have of $t"))
                }
            })
        }
        list(s.optJSONArray("bikes")).takeIf { it.isNotEmpty() }?.let { bikes ->
            col.addView(Ui.heading(a, "Bikes"))
            col.addView(Ui.card(a).apply {
                bikes.forEachIndexed { i, b ->
                    if (i > 0) addView(Ui.divider(a))
                    addView(Ui.row(a, b.optString("name"), String.format(Locale.US, "%,.0f km", b.optDouble("distance_km"))))
                }
            })
        }

        col.addView(Ui.text(a, "From your dashboard's database · synced ${Ui.date(s.optString("synced_at"))}", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 10), 0, 0) })
    }

    // ── Rides ───────────────────────────────────────────────────────────────
    private var rideFilter = "all"
    private var rideQuery = ""

    fun rides(a: AppActivity): Unit = a.load(listOf("activities?limit=300")) { r ->
        val all = list(r["activities?limit=300"]?.optJSONArray("activities"))
        val col = a.page()

        col.addView(a.button("Map of all routes") { a.startActivity(android.content.Intent(a, RoutesActivity::class.java)) })
        val search = android.widget.EditText(a).apply {
            hint = "Search rides by name or place"
            setText(rideQuery)
            setSingleLine(true)
            setTextColor(Ui.TEXT); setHintTextColor(Ui.MUTED)
        }
        col.addView(search, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = Ui.dp(a, 6) })

        val chips = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL }
        col.addView(android.widget.HorizontalScrollView(a).apply { isHorizontalScrollBarEnabled = false; addView(chips) })
        val sport = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
        col.addView(sport)
        val count = Ui.text(a, "", 11f, Ui.MUTED)
        col.addView(count)
        val box = Ui.card(a)
        col.addView(box)

        fun place(act: JSONObject) = act.optJSONObject("route_places")?.let { rp ->
            listOf("furthest_landmark", "furthest_place").map { rp.optString(it) }.firstOrNull { it.isNotEmpty() && it != "null" }
        }.orEmpty()

        fun fill() {
            val q = rideQuery.trim().lowercase(Locale.ROOT)
            val shown = all.filter {
                (rideFilter == "all" || sportOf(it) == rideFilter) &&
                    (q.isEmpty() || it.optString("name").lowercase(Locale.ROOT).contains(q) || place(it).lowercase(Locale.ROOT).contains(q))
            }
            sport.removeAllViews()
            if (rideFilter != "all" && q.isEmpty()) sportPage(a, sport, shown, rideFilter)
            count.text = "${shown.size} activities" + if (shown.isNotEmpty()) " · " + Ui.km(shown.sumOf { it.optDouble("distance") }) else ""
            box.removeAllViews()
            if (shown.isEmpty()) box.addView(Ui.text(a, "Nothing matches.", 13f, Ui.MUTED))
            shown.take(200).forEachIndexed { i, act ->
                if (i > 0) box.addView(Ui.divider(a))
                val watts = act.optDouble("average_watts", 0.0)
                val value = when {
                    act.optBoolean("device_watts") && watts > 0 -> "${Math.round(watts)} W"
                    isRide(act) -> Ui.kmh(act.optDouble("average_speed"))
                    else -> Ui.hm(act.optLong("moving_time"))
                }
                val where = place(act).takeIf { it.isNotEmpty() }?.let { " · $it" }.orEmpty()
                box.addView(Ui.row(a, act.optString("name"), value,
                    Ui.date(act.optString("start_date_local")) + " · " + Ui.km(act.optDouble("distance")) + " · " + Ui.hm(act.optLong("moving_time")) +
                        " · ${Math.round(act.optDouble("total_elevation_gain"))} m" + where).apply { setOnClickListener { a.openRide(act) } })
            }
        }

        fun drawChips() {
            chips.removeAllViews()
            val have = all.map { sportOf(it) }.toSet()
            listOf("all" to "All", "ride" to "Rides", "run" to "Runs", "walk" to "Walks", "swim" to "Swims", "other" to "Other").filter { it.first == "all" || it.first in have }.forEach { (id, label) ->
                chips.addView(Ui.text(a, label, 13f, if (id == rideFilter) Ui.ORANGE else Ui.MUTED, true).apply {
                    setPadding(0, Ui.dp(a, 10), Ui.dp(a, 18), Ui.dp(a, 8))
                    setOnClickListener { rideFilter = id; drawChips(); fill() }
                })
            }
        }
        drawChips()
        search.addTextChangedListener(object : android.text.TextWatcher {
            override fun afterTextChanged(e: android.text.Editable?) { rideQuery = e?.toString().orEmpty(); fill() }
            override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, af: Int) {}
            override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
        })
        fill()
    }

    // ── Sport pages ─────────────────────────────────────────────────────────
    // The website's Cycling / Running / Walking / Swimming / Other sections
    // (js/render-charts.js), shown above the list when a sport chip is picked.
    private val RUNS = setOf("Run", "VirtualRun", "TrailRun")
    internal fun sportOf(a: JSONObject): String {
        val t = a.optString("type").ifEmpty { a.optString("sport_type") }
        return when { isRide(a) -> "ride"; t in RUNS -> "run"; t == "Walk" || t == "Hike" -> "walk"; t == "Swim" || t == "OpenWaterSwim" -> "swim"; else -> "other" }
    }

    internal fun sportPage(a: AppActivity, col: LinearLayout, list: List<JSONObject>, key: String) {
        if (list.isEmpty()) return
        val byDist = key != "other"
        val word = mapOf("ride" to "ride", "run" to "run", "walk" to "walk", "swim" to "swim")[key] ?: "session"
        // pace: min per km, per 100 m for swims
        fun pace(ms: Double) = if (ms <= 0) "—" else Math.round(if (key == "swim") 100 / ms else 1000 / ms).let { String.format(Locale.US, "%d:%02d", it / 60, it % 60) }
        val paceU = if (key == "swim") " /100m" else " /km"
        fun speedOrPace(x: JSONObject) = if (key == "ride") Ui.kmh(x.optDouble("average_speed")) else pace(x.optDouble("average_speed")) + paceU
        fun sub(x: JSONObject, extra: String) = Ui.date(x.optString("start_date_local")) + " · " + extra
        fun hero(c: LinearLayout, label: String, value: String, x: JSONObject, extra: String) =
            c.addView(Ui.row(a, label, value, x.optString("name") + " · " + sub(x, extra)).apply { setOnClickListener { a.openRide(x) } })
        val size = { x: JSONObject -> if (byDist) x.optDouble("distance") else x.optDouble("moving_time") }
        val longest = list.maxByOrNull(size)!!
        val fastest = list.filter { it.optDouble("average_speed") > 0 && it.optDouble("distance") > 0 }.maxByOrNull { it.optDouble("average_speed") }
        val typeOf = { x: JSONObject -> x.optString("sport_type").ifEmpty { x.optString("type") }.ifEmpty { "Workout" }.replace(Regex("([a-z])([A-Z])"), "$1 $2") }

        col.addView(Ui.heading(a, mapOf("ride" to "Cycling", "run" to "Running", "walk" to "Walking & hiking", "swim" to "Swimming")[key] ?: "Other sports"))
        col.addView(Ui.card(a).apply {
            when {
                key == "ride" -> {
                    list.maxByOrNull { it.optDouble("max_speed") }?.let { hero(this, "Fastest speed (max)", Ui.kmh(it.optDouble("max_speed")), it, Ui.km(it.optDouble("distance"))) }
                    addView(Ui.divider(a))
                    fastest?.let { hero(this, "Best average speed", Ui.kmh(it.optDouble("average_speed")), it, Ui.km(it.optDouble("distance"))) }
                    addView(Ui.divider(a))
                    hero(this, "Longest ride", Ui.km(longest.optDouble("distance")), longest, Ui.hm(longest.optLong("moving_time")))
                }
                byDist -> {
                    fastest?.let { hero(this, "Best pace", pace(it.optDouble("average_speed")) + paceU, it, Ui.km(it.optDouble("distance"))); addView(Ui.divider(a)) }
                    hero(this, "Longest $word", Ui.km(longest.optDouble("distance")), longest, Ui.hm(longest.optLong("moving_time")))
                }
                else -> {
                    hero(this, "Longest session", Ui.hm(longest.optLong("moving_time")), longest, typeOf(longest))
                    val types = list.groupingBy(typeOf).eachCount().toList().sortedByDescending { it.second }
                    addView(Ui.divider(a))
                    addView(Ui.row(a, "Most played", types[0].first, types.joinToString(" · ") { "${it.first} ${it.second}×" }))
                }
            }
        })

        val hr = list.map { it.optDouble("average_heartrate", 0.0) }.filter { it > 0 }
        col.addView(Ui.tiles(a, listOf(
            "${list.size}" to "${word}s|rides",
            (if (byDist) Ui.km(list.sumOf { it.optDouble("distance") }) else "${list.maxOf { it.optInt("max_heartrate") }.takeIf { it > 0 } ?: "—"} bpm") to (if (byDist) "distance|distance" else "max heart rate|hr"),
            String.format(Locale.US, "%.1f h", list.sumOf { it.optDouble("moving_time") } / 3600) to "moving|time",
            (if (hr.isEmpty()) "—" else "${Math.round(hr.average())} bpm") to "average heart rate|hr",
        )))

        // rides: the last 4 weeks against the 4 before
        if (key == "ride") {
            val now = System.currentTimeMillis(); val day = 86_400_000L
            fun within(from: Int, to: Int) = list.filter { parse(it.optString("start_date")).let { t -> t >= now - from * day && t < now - to * day } }
            val cur = within(28, 0); val prev = within(56, 28)
            fun delta(x: Double, y: Double) = if (y <= 0) "" else Math.round((x - y) / y * 100).let { p -> if (p == 0L) " · no change" else (if (p > 0) " · ▲ " else " · ▼ ") + Math.abs(p) + "%" }
            fun dist(l: List<JSONObject>) = l.sumOf { it.optDouble("distance") }
            fun climb(l: List<JSONObject>) = l.sumOf { it.optDouble("total_elevation_gain") }
            fun spd(l: List<JSONObject>) = l.sumOf { it.optDouble("moving_time") }.let { t -> if (t > 0) dist(l) / t else 0.0 }
            col.addView(Ui.heading(a, "Last 4 weeks vs the 4 before"))
            col.addView(Ui.card(a).apply {
                addView(Ui.row(a, "Rides", "${cur.size}", "was ${prev.size}" + delta(cur.size.toDouble(), prev.size.toDouble())))
                addView(Ui.divider(a)); addView(Ui.row(a, "Distance", Ui.km(dist(cur)), "was " + Ui.km(dist(prev)) + delta(dist(cur), dist(prev))))
                addView(Ui.divider(a)); addView(Ui.row(a, "Climbing", "${Math.round(climb(cur))} m", "was ${Math.round(climb(prev))} m" + delta(climb(cur), climb(prev))))
                addView(Ui.divider(a)); addView(Ui.row(a, "Average speed", Ui.kmh(spd(cur)), "was " + Ui.kmh(spd(prev)) + delta(spd(cur), spd(prev))))
            })
        }

        // top 5: fastest pace for runs, the longest for the rest
        val top = if (key == "run") list.filter { it.optDouble("average_speed") > 0 }.sortedByDescending { it.optDouble("average_speed") } else list.sortedByDescending(size)
        col.addView(Ui.heading(a, if (key == "run") "Top 5 fastest pace" else "Top 5 longest ${word}s"))
        col.addView(Ui.card(a).apply {
            top.take(5).forEachIndexed { i, x ->
                if (i > 0) addView(Ui.divider(a))
                val value = if (key == "run") pace(x.optDouble("average_speed")) + paceU else if (byDist) Ui.km(x.optDouble("distance")) else Ui.hm(x.optLong("moving_time"))
                val extra = if (key == "run") Ui.km(x.optDouble("distance")) else if (byDist) Ui.hm(x.optLong("moving_time")) + (if (x.optDouble("average_speed") > 0) " · " + speedOrPace(x) else "") else typeOf(x)
                addView(Ui.row(a, "${i + 1}. " + x.optString("name"), value, sub(x, extra)).apply { setOnClickListener { a.openRide(x) } })
            }
        })

        // the last 20: speed for rides, pace for runs, distance (or minutes) for the rest
        val last = list.sortedBy { it.optString("start_date") }.takeLast(20)
        col.addView(Ui.heading(a, when (key) { "ride" -> "Average speed"; "run" -> "Pace (min/km)"; "other" -> "Minutes"; else -> "Distance (km)" } + ", last ${last.size} ${word}s"))
        col.addView(Ui.card(a).apply {
            addView(chart(a, BarChart(a).apply {
                when (key) {
                    "ride" -> format = { String.format(Locale.US, "%.0f", it) }
                    "run" -> format = { s -> Math.round(s * 60).let { String.format(Locale.US, "%d:%02d", it / 60, it % 60) } }
                    else -> format = { String.format(Locale.US, if (byDist) "%.1f" else "%.0f", it) }
                }
                set(last.map {
                    val v = it.optDouble("average_speed")
                    when (key) { "ride" -> v * 3.6; "run" -> if (v > 0) 1000 / v / 60 else 0.0; "other" -> it.optDouble("moving_time") / 60; else -> it.optDouble("distance") / 1000 }
                }.toDoubleArray(), last.map { Ui.date(it.optString("start_date_local")).substringBefore(' ') })
            }, 150))
        })

        if (key == "ride" || key == "run") {
            val (edges, labels) = if (key == "ride") listOf(0, 20, 40, 60, 80, 100, 150, 200) to listOf("<20", "20-40", "40-60", "60-80", "80-100", "100-150", "150-200", "200+")
                else listOf(0, 5, 10, 15, 21, 30, 42) to listOf("<5", "5-10", "10-15", "15-21", "21-30", "30-42", "42+")
            val counts = DoubleArray(labels.size)
            list.forEach { x -> val km = x.optDouble("distance") / 1000; counts[edges.indexOfLast { km >= it }.coerceAtLeast(0)]++ }
            col.addView(Ui.heading(a, "${word.replaceFirstChar { it.uppercase() }} distance spread (km)"))
            col.addView(Ui.card(a).apply { addView(chart(a, BarChart(a).apply { set(counts, labels) }, 130)) })
        } else {
            // hours per month, the last 12 months
            val months = (11 downTo 0).map { back -> Calendar.getInstance().apply { add(Calendar.MONTH, -back) }.let { String.format(Locale.US, "%04d-%02d", it.get(Calendar.YEAR), it.get(Calendar.MONTH) + 1) } }
            col.addView(Ui.heading(a, "Hours per month"))
            col.addView(Ui.card(a).apply {
                addView(chart(a, BarChart(a).apply {
                    format = { String.format(Locale.US, "%.1f", it) }
                    set(months.map { m -> list.filter { it.optString("start_date_local").startsWith(m) }.sumOf { it.optDouble("moving_time") } / 3600 }.toDoubleArray(), months.map { it.takeLast(2) })
                    highlight = months.size - 1
                }, 130))
            })
        }
        col.addView(Ui.heading(a, "All ${word}s"))
    }

    // ── Power ───────────────────────────────────────────────────────────────
    class Pw(val a: JSONObject, val avg: Double, val np: Double, val max: Double, val ifac: Double, val tss: Double, val vi: Double, val wkg: Double)

    fun power(a: AppActivity): Unit = a.load(listOf("activities?limit=300", "me")) { r ->
        val acts = list(r["activities?limit=300"]?.optJSONArray("activities")).filter { isRide(it) && it.optBoolean("device_watts") && it.optDouble("average_watts") > 0 }
        val me = r["me"]
        val col = a.page()
        val kg = me?.optDouble("weight", 0.0)?.takeIf { it > 0 } ?: 78.0
        val bestNp = acts.filter { it.optLong("moving_time") >= 1200 }.maxOfOrNull { it.optDouble("weighted_average_watts", it.optDouble("average_watts")) } ?: 0.0
        val ftp = me?.optDouble("ftp", 0.0)?.takeIf { it > 0 } ?: Math.round(bestNp * 0.95).toDouble()
        val rows = acts.map {
            val avg = it.optDouble("average_watts"); val np = it.optDouble("weighted_average_watts", 0.0)
            val f = if (np > 0 && ftp > 0) np / ftp else 0.0
            Pw(it, avg, np, it.optDouble("max_watts", 0.0), f, if (f > 0) it.optLong("moving_time") * np * f / (ftp * 3600) * 100 else 0.0, if (np > 0) np / avg else 0.0, avg / kg)
        }
        if (rows.isEmpty()) {
            col.addView(Ui.card(a).apply { addView(Ui.text(a, "No rides with a power meter yet. Once you ride with one, FTP, normalized power, intensity and TSS show up here.", 13f, Ui.MUTED)) })
            return@load
        }
        col.addView(Ui.heading(a, "Power"))
        col.addView(Ui.tiles(a, listOf(
            "${Math.round(ftp)} W" to if (me?.optDouble("ftp", 0.0) ?: 0.0 > 0) "FTP (Strava)|power" else "FTP (estimated)|power",
            String.format(Locale.US, "%.2f", ftp / kg) to "W/kg at ${Ui.n0(kg)} kg",
            "${Math.round(rows.maxOf { it.max })} W" to "max power|power",
            "${Math.round(rows.maxOf { it.np })} W" to "best NP ride",
        )))
        val since = System.currentTimeMillis() - 28L * 86_400_000
        val recentKj = rows.filter { parse(it.a.optString("start_date")) >= since }.sumOf { it.a.optDouble("kilojoules", 0.0) }
        col.addView(Ui.tiles(a, listOf("${rows.size}" to "power-meter rides", String.format(Locale.US, "%,.0f kJ", recentKj) to "work, 28 days")))

        val last = rows.take(20).reversed()
        col.addView(Ui.heading(a, "Normalized power, last ${last.size} rides"))
        col.addView(Ui.card(a).apply {
            addView(chart(a, BarChart(a).apply {
                color = Ui.PURPLE
                set(last.map { if (it.np > 0) it.np else it.avg }.toDoubleArray(), last.map { Ui.date(it.a.optString("start_date_local")).substringBefore(' ') })
            }, 150))
        })
        col.addView(Ui.heading(a, "Rides with power"))
        val c = Ui.card(a)
        rows.take(40).forEachIndexed { i, p ->
            if (i > 0) c.addView(Ui.divider(a))
            c.addView(Ui.row(a, p.a.optString("name"), if (p.np > 0) "${Math.round(p.np)} W NP" else "${Math.round(p.avg)} W",
                Ui.date(p.a.optString("start_date_local")) + String.format(Locale.US, " · avg %d W · %.2f W/kg", Math.round(p.avg), p.wkg) +
                    (if (p.ifac > 0) String.format(Locale.US, " · IF %.2f · TSS %d", p.ifac, Math.round(p.tss)) else "") +
                    (if (p.vi > 0) String.format(Locale.US, " · VI %.2f", p.vi) else "")).apply { setOnClickListener { a.openRide(p.a) } })
        }
        col.addView(c)
        // training zones (website Training Zones card): what each zone means in watts / bpm
        col.addView(Ui.heading(a, "Training zones"))
        col.addView(Ui.card(a).apply {
            addView(Ui.text(a, "Power · FTP ${Math.round(ftp)} W", 13f, Ui.TEXT, true))
            Zones.POWER.forEachIndexed { i, z -> addView(Ui.row(a, z.name, Zones.range(Zones.POWER, i, ftp) + " W").apply { (getChildAt(0) as LinearLayout).getChildAt(0).let { (it as android.widget.TextView).setTextColor(z.color) } }) }
            val lthr = Zones.lthr(a)
            if (lthr > 0) {
                addView(Ui.text(a, "Heart rate · threshold ${Math.round(lthr)} bpm", 13f, Ui.TEXT, true).apply { setPadding(0, Ui.dp(a, 14), 0, 0) })
                Zones.HEART.forEachIndexed { i, z -> addView(Ui.row(a, z.name, Zones.range(Zones.HEART, i, lthr) + " bpm").apply { (getChildAt(0) as LinearLayout).getChildAt(0).let { (it as android.widget.TextView).setTextColor(z.color) } }) }
            }
            addView(Ui.text(a, "Easy rides belong in Z2. Sweet spot and Z4 build FTP; keep them to 1–2 sessions a week.", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 8), 0, 0) })
        })

        col.addView(Ui.text(a, "NP = normalized power · IF = NP ÷ FTP · TSS = training stress (100 ≈ an hour at FTP) · VI = NP ÷ average. Set your own FTP on the web dashboard's Power page.", 11f, Ui.MUTED))
    }

    internal fun parse(iso: String): Long = try {
        java.time.Instant.parse(iso).toEpochMilli()
    } catch (e: Exception) { 0L }

    // ── Sleep ───────────────────────────────────────────────────────────────
    fun sleep(a: AppActivity): Unit = a.load(listOf("sleep")) { r ->
        val s = r["sleep"]
        if (s == null) { a.page().apply { addView(Watch.card(a)); addView(a.healthCard()) }; return@load }
        val cols = s.optJSONArray("cols")
        val idx = HashMap<String, Int>(); for (i in 0 until (cols?.length() ?: 0)) idx[cols!!.getString(i)] = i
        val rowsArr = s.optJSONArray("rows") ?: JSONArray()
        val nights = (0 until rowsArr.length()).map { rowsArr.getJSONArray(it) }.filter { it.optDouble(idx["asleep"] ?: 1, 0.0) > 0 }
        val col = a.page()
        col.addView(Watch.card(a))
        col.addView(a.healthCard())
        if (nights.isEmpty()) { col.addView(Ui.text(a, "No sleep data yet — import it on the web dashboard's Sleep page.", 13f, Ui.MUTED)); return@load }
        fun v(n: JSONArray, k: String) = idx[k]?.let { n.optDouble(it, Double.NaN) } ?: Double.NaN
        fun avg(list: List<JSONArray>, k: String) = list.map { v(it, k) }.filter { !it.isNaN() && it > 0 }.let { if (it.isEmpty()) Double.NaN else it.average() }
        val week = nights.takeLast(7); val month = nights.takeLast(30)
        fun hmMin(m: Double) = if (m.isNaN()) "—" else "${(m / 60).toInt()}h ${(m % 60).toInt()}m"
        col.addView(Ui.heading(a, "Last 7 nights · average"))
        col.addView(Ui.tiles(a, listOf(
            hmMin(avg(week, "asleep")) to "asleep|sleep", hmMin(avg(week, "deep")) to "deep",
            hmMin(avg(week, "rem")) to "REM", avg(week, "hrv").let { if (it.isNaN()) "—" else "${Math.round(it)} ms" } to "HRV",
            avg(week, "rhr").let { if (it.isNaN()) "—" else "${Math.round(it)} bpm" } to "resting HR|hr",
            avg(week, "eff").let { if (it.isNaN()) "—" else String.format(Locale.US, "%.0f%%", it) } to "efficiency",
        )))
        col.addView(Ui.text(a, "30-night average asleep: " + hmMin(avg(month, "asleep")), 12f, Ui.MUTED))
        col.addView(Ui.heading(a, "Hours asleep, last ${month.size} nights"))
        col.addView(Ui.card(a).apply {
            addView(chart(a, BarChart(a).apply {
                color = Ui.BLUE
                format = { String.format(Locale.US, "%.1f", it) }
                set(month.map { v(it, "asleep") / 60 }.toDoubleArray(), month.map { it.optString(0).takeLast(2) })
            }, 150))
        })
        col.addView(Ui.heading(a, "Nights"))
        val c = Ui.card(a)
        nights.takeLast(21).reversed().forEachIndexed { i, n ->
            if (i > 0) c.addView(Ui.divider(a))
            val hrv = v(n, "hrv")
            c.addView(Ui.row(a, Ui.date(n.optString(0)), hmMin(v(n, "asleep")),
                "deep " + hmMin(v(n, "deep")) + " · REM " + hmMin(v(n, "rem")) +
                    (if (!v(n, "eff").isNaN()) String.format(Locale.US, " · %.0f%%", v(n, "eff")) else "") +
                    (if (!hrv.isNaN()) " · HRV ${Math.round(hrv)}" else "")))
        }
        col.addView(c)
    }

    // ── Bike care ───────────────────────────────────────────────────────────
    // The website's maintenance reminders (js/gear-maint.js): Strava has no
    // service data, so "Serviced" saves the bike's odometer on this phone and
    // the distance since is measured against a typical interval.
    private class Part(val key: String, val name: String, val km: Int)
    private val PARTS = listOf(Part("chain", "Chain", 4000), Part("tire", "Tires", 5000), Part("brake", "Brake pads", 2500), Part("wax", "Wax / lube", 250))

    private fun bikeCare(a: AppActivity, col: LinearLayout, me: JSONObject) {
        val bikes = list(me.optJSONArray("bikes")).filter { !it.optBoolean("retired") }
        if (bikes.isEmpty()) return
        val prefs = Repo.prefs(a)
        col.addView(Ui.heading(a, "Bike care"))
        bikes.forEach { b ->
            val id = b.optString("id")
            val odo = b.optDouble("distance", 0.0)
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, b.optString("nickname").ifEmpty { b.optString("name") }, 14f, Ui.TEXT, true))
                addView(Ui.text(a, String.format(Locale.US, "%,.0f km on Strava", odo / 1000), 11f, Ui.MUTED))
                PARTS.forEach { part ->
                    val k = "care_${id}_${part.key}"
                    val since = if (prefs.contains(k)) (odo - prefs.getFloat(k, 0f)) / 1000 else null
                    val (label, color) = when {
                        since == null -> "not tracked" to Ui.MUTED
                        since >= part.km -> "overdue" to Ui.RED
                        since >= part.km * 0.8 -> "due soon" to Ui.ORANGE
                        else -> "OK" to Ui.GREEN
                    }
                    addView(Ui.divider(a))
                    addView(Ui.row(a, part.name, label,
                        (since?.let { String.format(Locale.US, "%,.0f of %,d km since service", maxOf(0.0, it), part.km) } ?: "every ~${part.km} km") + " · tap when serviced").apply {
                        ((getChildAt(1)) as android.widget.TextView).setTextColor(color)
                        setOnClickListener {
                            android.app.AlertDialog.Builder(a)
                                .setTitle("${part.name} serviced?")
                                .setMessage(String.format(Locale.US, "Counts from today's odometer, %,.0f km.", odo / 1000))
                                .setPositiveButton("Serviced now") { _, _ -> prefs.edit().putFloat(k, odo.toFloat()).apply(); a.show("money") }
                                .setNeutralButton("Stop tracking") { _, _ -> prefs.edit().remove(k).apply(); a.show("money") }
                                .setNegativeButton("Cancel", null)
                                .show()
                        }
                    })
                }
            })
        }
        col.addView(Ui.text(a, "Kept on this phone. Strava's odometer updates after each upload.", 11f, Ui.MUTED))
    }

    // ── Money ───────────────────────────────────────────────────────────────
    fun money(a: AppActivity): Unit = a.load(listOf("purchases", "bikes", "me")) { r ->
        val items = list(r["purchases"]?.optJSONArray("items")).sortedByDescending { it.optString("date") }
        val col = a.page()
        val now = Calendar.getInstance()
        val year = String.format(Locale.US, "%04d", now.get(Calendar.YEAR))
        val month = year + String.format(Locale.US, "-%02d", now.get(Calendar.MONTH) + 1)
        fun sum(l: List<JSONObject>) = l.sumOf { it.optDouble("paid", 0.0) }
        val thisYear = items.filter { it.optString("date").startsWith(year) }
        col.addView(Ui.heading(a, "Spending"))
        col.addView(Ui.tiles(a, listOf(
            Ui.rp(sum(items.filter { it.optString("date").startsWith(month) })) to "this month",
            Ui.rp(sum(thisYear)) to "this year",
            Ui.rp(sum(thisYear.filter { it.optString("category") == "Cycling" })) to "cycling, this year",
            "${items.size}" to "purchases",
        )))

        val months = (11 downTo 0).map { back -> Calendar.getInstance().apply { add(Calendar.MONTH, -back) }.let { String.format(Locale.US, "%04d-%02d", it.get(Calendar.YEAR), it.get(Calendar.MONTH) + 1) } }
        col.addView(Ui.heading(a, "Per month"))
        col.addView(Ui.card(a).apply {
            addView(chart(a, BarChart(a).apply {
                format = { if (it >= 1e6) String.format(Locale.US, "%.1fjt", it / 1e6) else String.format(Locale.US, "%.0frb", it / 1e3) }
                set(months.map { m -> sum(items.filter { it.optString("date").startsWith(m) }) }.toDoubleArray(), months.map { it.takeLast(2) })
                highlight = months.size - 1
            }, 150))
        })

        val byCat = thisYear.groupBy { it.optString("category").ifEmpty { "Other" } }.mapValues { sum(it.value) }.toList().sortedByDescending { it.second }
        if (byCat.isNotEmpty()) {
            col.addView(Ui.heading(a, "By category, $year"))
            col.addView(Ui.card(a).apply { byCat.forEachIndexed { i, (k, v) -> if (i > 0) addView(Ui.divider(a)); addView(Ui.row(a, k, Ui.rp(v))) } })
        }

        list(r["bikes"]?.optJSONArray("bikes")).takeIf { it.isNotEmpty() }?.let { bikes ->
            col.addView(Ui.heading(a, "Bikes"))
            col.addView(Ui.card(a).apply {
                bikes.forEachIndexed { i, b ->
                    if (i > 0) addView(Ui.divider(a))
                    addView(Ui.row(a, b.optString("name"), Ui.rp(b.optDouble("spent")), "${b.optString("kind")} · ${b.optJSONArray("parts")?.length() ?: 0} parts"))
                }
            })
        }

        r["me"]?.let { bikeCare(a, col, it) }

        col.addView(Ui.heading(a, "Latest purchases"))
        val c = Ui.card(a)
        items.take(30).forEachIndexed { i, p ->
            if (i > 0) c.addView(Ui.divider(a))
            c.addView(Ui.row(a, p.optString("item").take(70), Ui.rp(p.optDouble("paid")),
                Ui.date(p.optString("date")) + " · " + p.optString("category") + (p.optString("shop").takeIf { it.isNotEmpty() }?.let { " · $it" } ?: "")))
        }
        col.addView(c)
    }
}
