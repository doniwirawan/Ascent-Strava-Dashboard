package xyz.doniwirawan.ascent

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URL

/**
 * More → Destinations: the website's "Ride destinations by regency" (js/regency-map.js).
 * Each ride counts in the Bali regency holding its destination — the route point
 * furthest from the start; a loop that never gets 2 km away counts where it stayed.
 * The boundaries are the website's public data/bali-regencies.json, kept on the phone.
 */
object Destinations {
    class Regency(val name: String, val polys: List<List<List<DoubleArray>>>)   // polygons → rings → [lng, lat]

    internal fun parse(geo: JSONObject): List<Regency> {
        val fs = geo.optJSONArray("features") ?: return emptyList()
        fun ring(a: JSONArray) = (0 until a.length()).map { a.getJSONArray(it).let { p -> doubleArrayOf(p.getDouble(0), p.getDouble(1)) } }
        fun poly(a: JSONArray) = (0 until a.length()).map { ring(a.getJSONArray(it)) }
        return (0 until fs.length()).map { i ->
            val f = fs.getJSONObject(i); val g = f.getJSONObject("geometry"); val c = g.getJSONArray("coordinates")
            Regency(f.getJSONObject("properties").optString("name"), if (g.optString("type") == "MultiPolygon") (0 until c.length()).map { poly(c.getJSONArray(it)) } else listOf(poly(c)))
        }
    }

    /** Ray casting on [lng, lat] rings: the first ring is the outline, the rest are holes. */
    private fun inRing(lng: Double, lat: Double, r: List<DoubleArray>): Boolean {
        var inside = false; var j = r.size - 1
        for (i in r.indices) { val (xi, yi) = r[i].let { it[0] to it[1] }; val (xj, yj) = r[j].let { it[0] to it[1] }
            if ((yi > lat) != (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside; j = i }
        return inside
    }
    internal fun regencyOf(lat: Double, lng: Double, regs: List<Regency>) =
        regs.firstOrNull { r -> r.polys.any { p -> inRing(lng, lat, p[0]) && p.drop(1).none { inRing(lng, lat, it) } } }?.name

    private fun km(a: DoubleArray, b: DoubleArray): Double {
        val r = Math.PI / 180; val dLat = (b[0] - a[0]) * r; val dLng = (b[1] - a[1]) * r
        val h = Math.sin(dLat / 2).let { it * it } + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2).let { it * it }
        return 12742 * Math.asin(Math.sqrt(h))
    }

    /** The ride's destination [lat, lng]: furthest from the start, or the start when it never got 2 km away. */
    internal fun destination(a: JSONObject): DoubleArray? {
        val pts = Ui.decodePolyline(a.optJSONObject("map")?.optString("summary_polyline").orEmpty())
        if (pts.isEmpty()) return null
        val home = a.optJSONArray("start_latlng")?.takeIf { it.length() == 2 }?.let { doubleArrayOf(it.getDouble(0), it.getDouble(1)) } ?: pts[0]
        val far = pts.maxByOrNull { km(home, it) }!!
        return if (km(home, far) >= 2) far else home
    }

    private fun file(ctx: Context) = File(ctx.filesDir, "bali-regencies.json")
    private const val URL_GEO = "https://ascent-analytics.doniwirawan.xyz/data/bali-regencies.json"
    private var regs: List<Regency>? = null
    private var pick: String? = null

    fun page(a: AppActivity): Unit = a.load(listOf("activities?limit=500")) { r ->
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities"))
        val col = a.page()
        More.back(a, col, "Destinations")
        val geo = regs ?: file(a).takeIf { it.exists() }?.let { runCatching { parse(JSONObject(it.readText())) }.getOrNull() }?.also { regs = it }
        if (geo == null) {
            col.addView(Ui.text(a, "Loading Bali's regency boundaries…", 13f, Ui.MUTED))
            Thread { runCatching { file(a).writeText(URL(URL_GEO).readText()) }; a.ui.post { a.show("more:destinations") } }.start()
            return@load
        }
        val by = LinkedHashMap<String, MutableList<JSONObject>>(); var outside = 0
        acts.forEach { x -> destination(x)?.let { d -> regencyOf(d[0], d[1], geo)?.let { by.getOrPut(it) { ArrayList() }.add(x) } ?: outside++ } }
        if (by.isEmpty()) { col.addView(Ui.text(a, "No rides with a route in Bali yet.", 13f, Ui.MUTED)); return@load }
        val rows = by.entries.sortedByDescending { it.value.size }
        col.addView(Ui.text(a, "Where each ride turned around, on Bali's regencies. Loops count where they stayed. Tap a regency for its rides.", 12f, Ui.MUTED))
        col.addView(Ui.card(a).apply {
            rows.forEachIndexed { i, (name, l) ->
                if (i > 0) addView(Ui.divider(a))
                val top = l.mapNotNull { it.optJSONObject("route_places")?.optString("furthest_place")?.takeIf { p -> p.isNotEmpty() && p != "null" } }.groupingBy { it }.eachCount().maxByOrNull { it.value }
                addView(Ui.row(a, name, "${l.size}", Ui.km(l.sumOf { it.optDouble("distance") }) + (top?.let { " · mostly ${it.key}" } ?: "")).apply {
                    if (name == pick) ((getChildAt(0) as android.widget.LinearLayout).getChildAt(0) as android.widget.TextView).setTextColor(Ui.ORANGE)
                    setOnClickListener { pick = if (pick == name) null else name; a.show("more:destinations") }
                })
            }
            if (outside > 0) addView(Ui.text(a, "$outside outside Bali", 11f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
        })
        pick?.let { by[it] }?.let { l ->
            col.addView(Ui.heading(a, "$pick · ${l.size} rides"))
            col.addView(Ui.card(a).apply {
                l.sortedByDescending { it.optString("start_date") }.forEachIndexed { i, x ->
                    if (i > 0) addView(Ui.divider(a))
                    addView(Ui.row(a, x.optString("name"), Ui.km(x.optDouble("distance")), Ui.date(x.optString("start_date_local")) +
                        (x.optJSONObject("route_places")?.optString("furthest_place")?.takeIf { it.isNotEmpty() && it != "null" }?.let { " · $it" } ?: "")).apply { setOnClickListener { a.openRide(x) } })
                }
            })
        }
    }
}
