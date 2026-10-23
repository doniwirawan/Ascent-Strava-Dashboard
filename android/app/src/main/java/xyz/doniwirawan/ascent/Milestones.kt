package xyz.doniwirawan.ascent

import org.json.JSONObject
import java.time.LocalDate
import java.util.Locale

/**
 * More → Milestones: the website's Trophies & KOMs section (renderMilestones +
 * renderChallenges) — records, Strava's own totals, and badges with tiers.
 * The KOM list needs Strava's /koms, which the API does not serve yet.
 */
object Milestones {
    class Badge(val name: String, val value: String, val unit: String, val tier: Int, val tiers: Int, val next: String?, val pct: Int)

    /** Highest tier reached and the progress to the next, website renderChallenges. */
    internal fun badge(v: Double, unit: String, fmt: (Double) -> String, tiers: List<Pair<Double, String>>): Badge {
        val got = tiers.count { v >= it.first }
        val next = tiers.getOrNull(got)
        return Badge((if (got > 0) tiers[got - 1] else tiers[0]).second, fmt(v), unit, got, tiers.size, next?.second, next?.let { minOf(100, Math.round(v / it.first * 100).toInt()) } ?: 100)
    }

    /** Longest run of consecutive active days in the last two years. */
    private fun streak(days: Set<String>): Int {
        var best = 0; var run = 0; var d = LocalDate.now()
        repeat(730) { if (d.toString() in days) { run++; best = maxOf(best, run) } else run = 0; d = d.minusDays(1) }
        return best
    }

    fun page(a: AppActivity): Unit = a.load(listOf("activities?limit=500", "strava-stats")) { r ->
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities"))
        val st = r["strava-stats"]
        val col = a.page()
        More.back(a, col, "Milestones")
        if (acts.isEmpty()) { col.addView(Ui.text(a, "No activities yet.", 13f, Ui.MUTED)); return@load }
        val rides = acts.filter { Screens.isRide(it) }
        val set = rides.ifEmpty { acts }
        fun JSONObject.d(k: String) = optDouble(k, 0.0)
        fun rec(label: String, x: JSONObject?, value: (JSONObject) -> String) = Triple(label, x, x?.let(value) ?: "—")

        col.addView(Ui.tiles(a, listOf(
            String.format(Locale.US, "%,d", acts.sumOf { it.optInt("achievement_count") }) to "achievements",
            String.format(Locale.US, "%,d", acts.sumOf { it.optInt("pr_count") }) to "PRs",
            String.format(Locale.US, "%,d", acts.sumOf { it.optInt("kudos_count") }) to "kudos",
            "${acts.size}" to "activities loaded|rides",
        )))

        val byMonth = set.groupBy { it.optString("start_date_local").take(7) }.mapValues { (_, l) -> l.sumOf { it.d("distance") } }.maxByOrNull { it.value }
        val first = set.minByOrNull { it.optString("start_date") }
        val records = listOf(
            rec("Longest ride", set.maxByOrNull { it.d("distance") }) { Ui.km(it.d("distance")) },
            rec("Most elevation", set.maxByOrNull { it.d("total_elevation_gain") }) { "${Math.round(it.d("total_elevation_gain"))} m" },
            rec("Fastest average", set.filter { it.d("average_speed") > 0 }.maxByOrNull { it.d("average_speed") }) { Ui.kmh(it.d("average_speed")) },
            rec("Top speed", set.filter { it.d("max_speed") > 0 }.maxByOrNull { it.d("max_speed") }) { Ui.kmh(it.d("max_speed")) },
            rec("Highest average heart rate", set.filter { it.d("average_heartrate") > 0 }.maxByOrNull { it.d("average_heartrate") }) { "${Math.round(it.d("average_heartrate"))} bpm" },
            rec("Most kudos", set.filter { it.optInt("kudos_count") > 0 }.maxByOrNull { it.optInt("kudos_count") }) { "${it.optInt("kudos_count")} kudos" },
            rec("Most PRs in a ride", set.filter { it.optInt("pr_count") > 0 }.maxByOrNull { it.optInt("pr_count") }) { "${it.optInt("pr_count")} PRs" },
            rec("First ride", first) { Ui.date(it.optString("start_date_local")) },
        )
        col.addView(Ui.heading(a, "Records"))
        col.addView(Ui.card(a).apply {
            records.forEachIndexed { i, (l, x, v) ->
                if (i > 0) addView(Ui.divider(a))
                addView(Ui.row(a, l, v, x?.optString("name")).apply { x?.let { act -> setOnClickListener { a.openRide(act) } } })
            }
            addView(Ui.divider(a))
            addView(Ui.row(a, "Centuries", "${set.count { it.d("distance") >= 100_000 }}", "rides of 100+ km"))
            byMonth?.let { addView(Ui.row(a, "Biggest month", Ui.km(it.value), Ui.date(it.key + "-01").substringAfter(' '))) }
        })

        // Strava's own totals
        val all = st?.optJSONObject("all_ride_totals"); val ytd = st?.optJSONObject("ytd_ride_totals"); val recent = st?.optJSONObject("recent_ride_totals")
        fun totals(t: JSONObject?, title: String) = t?.takeIf { it.optInt("count") > 0 }?.let {
            col.addView(Ui.heading(a, title))
            col.addView(Ui.tiles(a, listOf(
                "${it.optInt("count")}" to "rides|rides", String.format(Locale.US, "%,.0f km", it.d("distance") / 1000) to "distance|distance",
                String.format(Locale.US, "%,.0f h", it.d("moving_time") / 3600) to "moving|time", String.format(Locale.US, "%,.0f m", it.d("elevation_gain")) to "climbing|climb",
            )))
        }
        totals(all, "All time · Strava"); totals(ytd, "${LocalDate.now().year} · year to date"); totals(recent, "Last 4 weeks")

        // badges
        val ltDist = all?.d("distance")?.div(1000)?.takeIf { it > 0 } ?: rides.sumOf { it.d("distance") } / 1000
        val ltElev = all?.d("elevation_gain")?.takeIf { it > 0 } ?: acts.sumOf { it.d("total_elevation_gain") }
        val biggest = (st?.d("biggest_ride_distance") ?: 0.0).div(1000).takeIf { it > 0 } ?: (rides.maxOfOrNull { it.d("distance") } ?: 0.0) / 1000
        val climb = st?.d("biggest_climb_elevation_gain") ?: 0.0
        val hours = Math.round((all?.d("moving_time") ?: 0.0) / 3600).toDouble()
        fun hour(x: JSONObject) = x.optString("start_date_local").drop(11).take(2).toIntOrNull() ?: 12
        val longestRun = acts.filter { it.optString("type").contains("Run") }.maxOfOrNull { it.d("distance") }?.div(1000) ?: 0.0
        val n0 = { v: Double -> String.format(Locale.US, "%,d", Math.round(v)) }
        val badges = listOfNotNull(
            badge(ltDist, "km total", n0, listOf(1000.0 to "1,000 km Club", 5000.0 to "5,000 km Club", 10000.0 to "10,000 km Club", 25000.0 to "25,000 km Club")),
            badge(biggest, "km longest ride", { String.format(Locale.US, "%.1f", it) }, listOf(100.0 to "Century Rider", 200.0 to "Double Century", 1500.0 to "Bentang Jawa")),
            badge(ltElev, "m climbed", n0, listOf(8848.0 to "Everest Climber", 44240.0 to "5× Everest", 88480.0 to "10× Everest")),
            badge(climb, "m biggest climb", n0, listOf(1000.0 to "1,000 m Climb", 2000.0 to "2,000 m Climb", 3000.0 to "3,000 m Climb")),
            badge((all?.optInt("count")?.takeIf { it > 0 } ?: rides.size).toDouble(), "rides", n0, listOf(100.0 to "100 Rides", 500.0 to "500 Rides", 1000.0 to "1,000 Rides")),
            badge(hours, "hours moved", n0, listOf(100.0 to "100 Hours", 500.0 to "500 Hours", 1000.0 to "1,000 Hours")),
            badge(streak(acts.map { it.optString("start_date_local").take(10) }.toSet()).toDouble(), "days in a row", n0, listOf(7.0 to "7-Day Streak", 14.0 to "14-Day Streak", 30.0 to "30-Day Streak")),
            badge(acts.count { hour(it) in 3..5 }.toDouble(), "pre-6am starts", n0, listOf(10.0 to "Early Bird", 50.0 to "Dawn Patrol", 100.0 to "Sunrise Regular")),
            badge(acts.count { hour(it) >= 21 || hour(it) < 3 }.toDouble(), "after-9pm starts", n0, listOf(10.0 to "Night Owl", 50.0 to "Night Rider", 100.0 to "Nocturnal")),
            if (longestRun > 0) badge(longestRun, "km longest run", { String.format(Locale.US, "%.1f", it) }, listOf(21.1 to "Half Marathoner", 42.195 to "Marathoner")) else null,
        ).sortedByDescending { it.tier > 0 }
        col.addView(Ui.heading(a, "Badges"))
        col.addView(Ui.card(a).apply {
            badges.forEachIndexed { i, b ->
                if (i > 0) addView(Ui.divider(a))
                addView(Ui.row(a, (if (b.tier > 0) "★ " else "☆ ") + b.name, "${b.value} ${b.unit}",
                    "tier ${b.tier} of ${b.tiers}" + (b.next?.let { " · next: $it, ${b.pct}%" } ?: " · all tiers done")).apply {
                    ((getChildAt(0) as android.widget.LinearLayout).getChildAt(0) as android.widget.TextView).setTextColor(if (b.tier > 0) Ui.ORANGE else Ui.MUTED)
                })
            }
        })
    }
}
