package xyz.doniwirawan.ascent

import android.content.ContentValues
import android.content.Context
import android.provider.MediaStore
import android.widget.EditText
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import java.util.PriorityQueue

/**
 * More → Chase routes: the website's AI route generator (js/chase-ai.js +
 * js/route-suggest.js). Type the ride you want; the AI (your key, AI → Settings)
 * turns it into a distance and places to ride through, OpenStreetMap finds the
 * places, and the route is worked out on Bali's major roads (the website's
 * data/bali-major-roads.json) in one of three modes: new (never-ridden roads
 * cost less), any, fast. Regency buttons make a loop through that regency's
 * never-ridden roads. The AI only ever sees the request and place names —
 * never the start (home) or any coordinates.
 */
object Chase {
    // ── the road graph ──────────────────────────────────────────────────────
    class Graph(val lat: DoubleArray, val lng: DoubleArray, val adj: Array<IntArray>, val eu: IntArray, val ev: IntArray,
                val len: DoubleArray, val f: DoubleArray, val nw: BooleanArray, private val grid: Map<Long, IntArray>) {
        /** Nearest node of the main network, or -1. */
        fun nearest(la: Double, lo: Double): Int {
            var best = -1; var bd = Double.MAX_VALUE
            var r = 0
            while (r < 6 && best < 0) {
                val i0 = Math.floor(la / G).toInt(); val j0 = Math.floor(lo / G).toInt()
                for (i in i0 - r..i0 + r) for (j in j0 - r..j0 + r) grid[cell(i, j)]?.forEach { n ->
                    val d = (lat[n] - la).let { it * it } + (lng[n] - lo).let { it * it }; if (d < bd) { bd = d; best = n } }
                r++
            }
            return best
        }
        fun other(e: Int, n: Int) = if (eu[e] == n) ev[e] else eu[e]
        companion object { const val G = 0.01; fun cell(i: Int, j: Int) = i.toLong() * 1_000_003L + j }
    }

    private fun kx(la: Double) = Math.cos(Math.toRadians(la))
    internal fun m(p: DoubleArray, q: DoubleArray) = Math.hypot((q[0] - p[0]) * 111320, (q[1] - p[1]) * 111320 * kx(p[0]))

    /** Website rideCoverage: which road pieces your rides went along, in the same direction band (±35°). */
    internal class Coverage(tracks: List<List<DoubleArray>>) {
        private val c = 0.00025
        private val cells = HashMap<Long, Int>()
        private fun key(i: Int, j: Int) = i.toLong() * 1_000_000L + j
        private fun bin(a: Double, b: Double, cc: Double, d: Double): Int { var t = Math.toDegrees(Math.atan2(cc - a, (d - b) * kx(a))); if (t < 0) t += 180; return Math.floor(t / 10).toInt() % 18 }
        init {
            tracks.forEach { t -> for (i in 1 until t.size) {
                val (a, b) = t[i - 1].let { it[0] to it[1] }; val (cc, d) = t[i].let { it[0] to it[1] }
                if (a == cc && b == d) continue
                val bit = 1 shl bin(a, b, cc, d); val n = maxOf(1, Math.ceil(Math.hypot(cc - a, d - b) / 0.0001).toInt())
                for (s in 0..n) { val k = key(Math.floor((a + (cc - a) * s / n) / c).toInt(), Math.floor((b + (d - b) * s / n) / c).toInt()); cells[k] = (cells[k] ?: 0) or bit }
            } }
        }
        private fun near(la: Double, lo: Double, bb: Int): Boolean {
            var mask = 0; for (o in -3..3) mask = mask or (1 shl ((bb + o + 18) % 18))
            val i = Math.floor(la / c).toInt(); val j = Math.floor(lo / c).toInt()
            for (di in -1..1) for (dj in -1..1) if (((cells[key(i + di, j + dj)] ?: 0) and mask) != 0) return true
            return false
        }
        /** Share of the p→q road piece (checked every ≤25 m) that a ride went along. */
        fun riddenShare(p: DoubleArray, q: DoubleArray): Double {
            val k = maxOf(1, Math.ceil(m(p, q) / 25).toInt()); val bb = bin(p[0], p[1], q[0], q[1])
            var n = 0; for (s in 0 until k) { val f = (s + 0.5) / k; if (near(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, bb)) n++ }
            return n.toDouble() / k
        }
    }

    /** Website _rsBuild: nodes at every road point, edges with length, trunk-road cost and never-ridden flag; the biggest network kept. */
    internal fun build(roads: List<List<DoubleArray>>, cls: List<Int>, tracks: List<List<DoubleArray>>): Graph {
        val cov = Coverage(tracks)
        val id = HashMap<String, Int>(); val lat = ArrayList<Double>(); val lng = ArrayList<Double>(); val adj = ArrayList<MutableList<Int>>()
        val eu = ArrayList<Int>(); val ev = ArrayList<Int>(); val len = ArrayList<Double>(); val f = ArrayList<Double>(); val nw = ArrayList<Boolean>()
        fun node(p: DoubleArray) = id.getOrPut("${p[0]},${p[1]}") { lat.add(p[0]); lng.add(p[1]); adj.add(ArrayList()); lat.size - 1 }
        roads.forEachIndexed { w, p ->
            val fac = if (cls.getOrElse(w) { 1 } == 0) 1.15 else 1.0
            for (i in 1 until p.size) {
                val u = node(p[i - 1]); val v = node(p[i]); if (u == v) continue
                val e = eu.size; eu += u; ev += v; len += m(p[i - 1], p[i]); f += fac; nw += cov.riddenShare(p[i - 1], p[i]) < 0.5
                adj[u] += e; adj[v] += e
            }
        }
        val comp = IntArray(lat.size) { -1 }; var best = -1; var bestN = 0; var c = 0
        for (s in lat.indices) {
            if (comp[s] >= 0) continue
            var n = 0; val st = ArrayDeque<Int>().apply { add(s) }; comp[s] = c
            while (st.isNotEmpty()) { val x = st.removeLast(); n++; adj[x].forEach { e -> val y = if (eu[e] == x) ev[e] else eu[e]; if (comp[y] < 0) { comp[y] = c; st.add(y) } } }
            if (n > bestN) { bestN = n; best = c }; c++
        }
        val grid = HashMap<Long, MutableList<Int>>()
        for (i in lat.indices) if (comp[i] == best) grid.getOrPut(Graph.cell(Math.floor(lat[i] / Graph.G).toInt(), Math.floor(lng[i] / Graph.G).toInt())) { ArrayList() } += i
        return Graph(lat.toDoubleArray(), lng.toDoubleArray(), adj.map { it.toIntArray() }.toTypedArray(), eu.toIntArray(), ev.toIntArray(),
            len.toDoubleArray(), f.toDoubleArray(), nw.toBooleanArray(), grid.mapValues { it.value.toIntArray() })
    }

    /** A* from a to b; the edge cost depends on the mode, and edges this route already uses cost more, website _caiPath. */
    internal fun path(g: Graph, a: Int, b: Int, used: Map<Int, Int>, mode: String): List<Int>? {
        val n = g.lat.size; val dist = DoubleArray(n) { Double.MAX_VALUE }; val prev = IntArray(n) { -1 }
        val bp = doubleArrayOf(g.lat[b], g.lng[b])
        fun h(x: Int) = m(doubleArrayOf(g.lat[x], g.lng[x]), bp) * 0.55
        fun cost(e: Int): Double { val u = used[e] ?: 0
            return when (mode) { "fast" -> g.len[e] * (if (g.f[e] > 1) 0.8 else 1.1) * (1 + 2 * u); "any" -> g.len[e] * (1 + 4 * u)
                else -> g.len[e] * g.f[e] * (if (g.nw[e] && u == 0) 0.55 else 1.0) * (1 + 4 * u) } }
        val heap = PriorityQueue<DoubleArray>(compareBy { it[0] }); heap.add(doubleArrayOf(h(a), a.toDouble())); dist[a] = 0.0
        while (heap.isNotEmpty()) {
            val (fv, xd) = heap.poll()!!.let { it[0] to it[1] }; val x = xd.toInt()
            if (x == b) break
            if (fv - h(x) > dist[x] + 1e-6) continue
            for (e in g.adj[x]) { val y = g.other(e, x); val c = cost(e)
                if (dist[x] + c < dist[y]) { dist[y] = dist[x] + c; prev[y] = e; heap.add(doubleArrayOf(dist[y] + h(y), y.toDouble())) } }
        }
        if (a != b && prev[b] < 0) return null
        val es = ArrayList<Int>(); var x = b; while (x != a) { val e = prev[x]; es += e; x = g.other(e, x) }
        return es.reversed()
    }

    class Route(val pts: List<DoubleArray>, val total: Double, val nw: Double)

    private fun walk(g: Graph, h0: Int, edges: List<Int>): Route {
        var x = h0; val pts = arrayListOf(doubleArrayOf(g.lat[x], g.lng[x])); var total = 0.0; var nw = 0.0
        edges.forEach { e -> x = g.other(e, x); pts += doubleArrayOf(g.lat[x], g.lng[x]); total += g.len[e]; if (g.nw[e]) nw += g.len[e] }
        return Route(pts, total, nw)
    }

    /** start → stops → end on the graph, website _caiRoute. */
    internal fun route(g: Graph, start: DoubleArray, stops: List<DoubleArray>, end: DoubleArray?, mode: String): Route? {
        val h0 = g.nearest(start[0], start[1]); if (h0 < 0) return null
        val nodes = stops.map { g.nearest(it[0], it[1]) }.filter { it >= 0 }.toMutableList()
        end?.let { g.nearest(it[0], it[1]).takeIf { n -> n >= 0 }?.let { n -> nodes += n } }
        val used = HashMap<Int, Int>(); val all = ArrayList<Int>(); var cur = h0
        for (w in nodes) { if (w == cur) continue
            val es = path(g, cur, w, used, mode) ?: return null
            es.forEach { used[it] = (used[it] ?: 0) + 1; all += it }; cur = w }
        return if (all.isEmpty()) null else walk(g, h0, all)
    }

    private fun d(a: DoubleArray, b: DoubleArray) = Math.hypot(a[0] - b[0], (a[1] - b[1]) * kx(a[0]))

    class Stop(val name: String, val ll: DoubleArray, val named: Boolean)

    /** Nearest-next from the start; one way ends at the named place furthest from the start, website _caiOrder. */
    internal fun order(stops: List<Stop>, from: DoubleArray, oneWay: Boolean): List<Stop> {
        if (stops.size < 2) return stops
        val last = if (oneWay) (stops.filter { it.named }.ifEmpty { stops }).maxByOrNull { d(from, it.ll) } else null
        val rest = stops.filter { it !== last }.toMutableList(); val out = ArrayList<Stop>(); var cur = from
        while (rest.isNotEmpty()) { val s = rest.minByOrNull { d(cur, it.ll) }!!; rest.remove(s); out += s; cur = s.ll }
        return if (last != null) out + last else out
    }

    /** Website _rsSuggest: the best never-ridden loop of about [km] from [home], through three turning points on a circle. */
    internal fun suggest(g: Graph, home: DoubleArray, km: Double): Route? {
        val h0 = g.nearest(home[0], home[1]); if (h0 < 0) return null
        val dd = km * 1000; val k = kx(home[0])
        var best: Pair<Double, Route>? = null
        for (rk in listOf(0.6, 0.75, 0.9)) for (th in 0 until 360 step 30) {
            val r = dd / (2 * Math.PI) * rk; val t = Math.toRadians(th.toDouble())
            val c = doubleArrayOf(home[0] + r / 111320 * Math.cos(t), home[1] + r / (111320 * k) * Math.sin(t))
            val wps = listOf(-90, 0, 90).map { o -> val an = Math.toRadians((th + o).toDouble()); g.nearest(c[0] + r / 111320 * Math.cos(an), c[1] + r / (111320 * k) * Math.sin(an)) }
            if (wps.any { it < 0 }) continue
            val used = HashMap<Int, Int>(); val all = ArrayList<Int>(); var cur = h0; var ok = true
            for (w in wps + h0) { val es = path(g, cur, w, used, "new"); if (es == null) { ok = false; break }; es.forEach { used[it] = (used[it] ?: 0) + 1; all += it }; cur = w }
            if (!ok || all.isEmpty()) continue
            var total = 0.0; var nw = 0.0; var rep = 0.0
            used.forEach { (e, n) -> total += g.len[e] * n; rep += g.len[e] * (n - 1); if (g.nw[e]) nw += g.len[e] }
            val off = maxOf(0.0, Math.abs(total - dd) - 0.1 * dd)
            val score = nw / 1000 - 2.5 * off / 1000 - 0.8 * rep / 1000
            if (best == null || score > best.first) best = score to walk(g, h0, all)
        }
        return best?.second
    }

    /** Where most rides start (~200 m clusters) — kept on the phone, never sent anywhere. */
    internal fun home(acts: List<JSONObject>): DoubleArray? {
        val c = HashMap<String, MutableList<DoubleArray>>()
        acts.forEach { a -> a.optJSONArray("start_latlng")?.takeIf { it.length() == 2 }?.let { s ->
            val p = doubleArrayOf(s.getDouble(0), s.getDouble(1)); c.getOrPut("${Math.round(p[0] / 0.002)},${Math.round(p[1] / 0.002)}") { ArrayList() } += p } }
        val top = c.values.maxByOrNull { it.size } ?: return null
        return doubleArrayOf(top.map { it[0] }.average(), top.map { it[1] }.average())
    }

    internal fun encode(pts: List<DoubleArray>): String {
        val sb = StringBuilder(); var pl = 0; var pn = 0
        fun e(v0: Int) { var v = if (v0 < 0) (v0 shl 1).inv() else v0 shl 1; while (v >= 0x20) { sb.append(((0x20 or (v and 0x1f)) + 63).toChar()); v = v shr 5 }; sb.append((v + 63).toChar()) }
        pts.forEach { p -> val a = Math.round(p[0] * 1e5).toInt(); val o = Math.round(p[1] * 1e5).toInt(); e(a - pl); e(o - pn); pl = a; pn = o }
        return sb.toString()
    }

    // ── network helpers ─────────────────────────────────────────────────────
    private fun get(url: String) = (URL(url).openConnection() as HttpURLConnection).run {
        setRequestProperty("User-Agent", "Ascent-Android/personal (ascent-analytics.doniwirawan.xyz)"); setRequestProperty("Accept", "application/json")
        connectTimeout = 15_000; readTimeout = 30_000
        try { inputStream.bufferedReader().use { it.readText() } } finally { disconnect() }
    }

    /** A place name → coordinates, OpenStreetMap search bounded to Bali (≤ 1 request a second). */
    private fun geocode(name: String): DoubleArray? {
        val q = if (Regex("bali", RegexOption.IGNORE_CASE).containsMatchIn(name)) name else "$name, Bali"
        val j = JSONArray(get("https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1&viewbox=114.40,-8.04,115.75,-8.90&q=" + URLEncoder.encode(q, "UTF-8")))
        Thread.sleep(1100)
        return j.optJSONObject(0)?.let { doubleArrayOf(it.getString("lat").toDouble(), it.getString("lon").toDouble()) }
    }

    /** ~100 points along the route → elevation from Open-Meteo → climb (±3 m noise ignored), website _caiElevation. */
    private fun elevation(pts: List<DoubleArray>): Pair<List<Double>, Double>? = runCatching {
        val cum = DoubleArray(pts.size); for (i in 1 until pts.size) cum[i] = cum[i - 1] + m(pts[i - 1], pts[i])
        val total = cum.last(); val n = minOf(100, maxOf(2, pts.size)); var i = 0
        val samp = (0 until n).map { k -> val dd = total * k / (n - 1); while (i < cum.size - 2 && cum[i + 1] < dd) i++; pts[i] }
        val j = JSONObject(get("https://api.open-meteo.com/v1/elevation?latitude=" + samp.joinToString(",") { String.format(Locale.US, "%.5f", it[0]) } +
            "&longitude=" + samp.joinToString(",") { String.format(Locale.US, "%.5f", it[1]) }))
        val e = j.getJSONArray("elevation").let { a -> (0 until a.length()).map { a.getDouble(it) } }
        var climb = 0.0; var ref = e[0]
        e.forEach { v -> if (v > ref + 3) { climb += v - ref; ref = v } else if (v < ref - 3) ref = v }
        e to climb
    }.getOrNull()

    private fun json(text: String, open: Char, close: Char) = text.substring(maxOf(0, text.indexOf(open)), text.lastIndexOf(close) + 1)

    // ── the page ────────────────────────────────────────────────────────────
    private var graph: Graph? = null
    private var graphKey = ""
    private var busy = false
    private var status = ""
    private var pick = 0
    private var mode = "new"
    private var lastText = ""; private var lastStart = ""; private var lastEnd = ""

    private fun histFile(ctx: Context) = File(ctx.filesDir, "chase_routes.json")
    private fun history(ctx: Context) = runCatching { JSONArray(histFile(ctx).readText()) }.getOrElse { JSONArray() }
    private fun save(ctx: Context, o: JSONObject) {
        val h = history(ctx); val out = JSONArray().put(o)
        for (i in 0 until minOf(49, h.length())) out.put(h.get(i))
        histFile(ctx).writeText(out.toString())
    }

    private fun graphFor(ctx: Context, acts: List<JSONObject>): Graph {
        val rides = acts.filter { Screens.isRide(it) && it.optJSONObject("map")?.optString("summary_polyline").orEmpty().isNotEmpty() }
        val key = "${rides.size}:${rides.firstOrNull()?.optLong("id")}"
        graph?.takeIf { graphKey == key }?.let { return it }
        val f = File(ctx.filesDir, "bali-major-roads.json")
        if (!f.exists()) f.writeText(get("https://ascent-analytics.doniwirawan.xyz/data/bali-major-roads.json"))
        val d = JSONObject(f.readText()); val ways = d.getJSONArray("ways")
        val roads = (0 until ways.length()).map { Ui.decodePolyline(ways.getJSONArray(it).getString(1)) }
        val cls = (0 until ways.length()).map { ways.getJSONArray(it).getInt(0) }
        return build(roads, cls, rides.map { Ui.decodePolyline(it.getJSONObject("map").getString("summary_polyline")) }).also { graph = it; graphKey = key }
    }

    /** Builds a route from a request (or for a regency) and keeps it; runs off the main thread. */
    private fun generate(a: AppActivity, acts: List<JSONObject>, text: String, startTxt: String, endTxt: String, regency: String?, oneWay: Boolean) {
        busy = true; status = "Planning your ride…"; a.show("more:chase")
        Thread {
            val res = runCatching {
                fun say(s: String) { status = s; a.ui.post { a.show("more:chase") } }
                var km: Double? = null; var loop = !oneWay; var summary = ""
                val planned = ArrayList<Stop>()
                if (regency == null) {
                    val sys = "You plan road-cycling rides in Bali, Indonesia, from a request. The ride starts and ends at a start point you never know — never guess or mention it. The rider usually rides under 100 km. " +
                        "Turn the request into the places to ride through, in riding order: real, mappable Bali places (villages, towns, landmarks, temples, beaches, lakes) on or next to a proper road. " +
                        "If the request only describes a theme (climbing, coast, rice fields, waterfalls, lakes, quiet roads…), add 1–2 well-known places in Bali that fit it, close to each other. If it names places, use those (fix spelling). Never add a place just as a starting point. " +
                        "named = true only for places the rider actually asked for; false for ones you added for the theme. km = the distance asked for, as a number (a maximum), or null. loop = false only if the rider clearly wants one way. " +
                        "Reply ONLY with JSON: {\"km\": number|null, \"loop\": true|false, \"places\": [{\"name\": \"Place, Regency\", \"named\": true|false}, …], \"summary\": \"one short sentence describing the plan\"}. Max 4 places."
                    val j = JSONObject(json(Coach.once(a, sys, text, 400), '{', '}'))
                    km = j.optDouble("km", Double.NaN).takeIf { !it.isNaN() && it > 0 }?.let { minOf(300.0, it) }
                    loop = !oneWay && j.optBoolean("loop", true); summary = j.optString("summary")
                    val ps = j.optJSONArray("places") ?: JSONArray()
                    for (i in 0 until minOf(4, ps.length())) {
                        val p = ps.opt(i); val name = if (p is JSONObject) p.optString("name") else p.toString(); val named = (p as? JSONObject)?.optBoolean("named", true) ?: true
                        if (name.isBlank()) continue
                        say("Finding ${name.substringBefore(',')} on the map…")
                        geocode(name)?.let { planned += Stop(name.substringBefore(','), it, named) }
                    }
                }
                say("Loading roads…")
                val g = graphFor(a, acts)
                val start = if (startTxt.isNotBlank()) (geocode(startTxt) ?: error("Couldn't find \"$startTxt\" on the map.")) else home(acts) ?: error("No usual start found in your rides — type a start place.")
                val end = if (endTxt.isNotBlank()) (geocode(endTxt) ?: error("Couldn't find \"$endTxt\" on the map.")) else if (loop) start else null
                say("Working out the route…")
                var stops: List<Stop> = planned
                var r: Route?
                var usedMode = mode
                if (regency != null) {
                    val reg = Destinations.regencies(a)?.firstOrNull { it.name == regency } ?: error("Could not load Bali's regencies.")
                    val pts = (g.eu.indices).filter { g.nw[it] }.map { e -> doubleArrayOf((g.lat[g.eu[e]] + g.lat[g.ev[e]]) / 2, (g.lng[g.eu[e]] + g.lng[g.ev[e]]) / 2) }
                        .filter { Destinations.regencyOf(it[0], it[1], listOf(reg)) != null }
                    if (pts.size < 3) error("No never-ridden major roads left in $regency — nice!")
                    fun ang(p: DoubleArray) = Math.atan2(p[0] - start[0], (p[1] - start[1]) * kx(start[0]))
                    val byNear = pts.sortedBy { d(start, it) }; var pool = byNear; var best: Pair<Route, List<Stop>>? = null
                    for (k in 0 until 4) {
                        if (pool.size < 3) break
                        val sub = pool.sortedBy { ang(it) }
                        val st = listOf(0.2, 0.5, 0.8).map { q -> Stop(regency, sub[minOf(sub.size - 1, (q * sub.size).toInt())], true) }
                        val rr = route(g, start, order(st, start, false).map { it.ll }, start, "new")
                        if (rr != null && (best == null || rr.total < best.first.total)) best = rr to st
                        if (rr != null && rr.total <= 110_000) break
                        pool = byNear.take(maxOf(3, pool.size / 2))
                    }
                    r = best?.first; stops = best?.second.orEmpty(); usedMode = "new"; loop = true
                } else if (stops.isEmpty()) {
                    if (km == null) error("Say where you want to go or how far — e.g. \"60 km loop via Tabanan\".")
                    r = suggest(g, start, km); usedMode = "new"; loop = true
                } else {
                    stops = order(stops, start, end == null)
                    r = route(g, start, stops.map { it.ll }, end, mode)
                    val max = km?.let { it * 1100 }
                    // too long: drop the places the AI added for the theme (never ones you named), best fit first
                    while (r != null && max != null && r.total > max && stops.any { !it.named }) {
                        var bestDrop: Pair<Route, List<Stop>>? = null
                        stops.forEachIndexed { k, s -> if (s.named) return@forEachIndexed
                            val rest = order(stops.filterIndexed { x, _ -> x != k }, start, end == null)
                            val r2 = if (rest.isEmpty()) null else route(g, start, rest.map { it.ll }, end, mode)
                            if (r2 != null && (bestDrop == null || Math.abs(r2.total - km!! * 1000) < Math.abs(bestDrop!!.first.total - km!! * 1000))) bestDrop = r2 to rest }
                        if (bestDrop == null) break
                        r = bestDrop!!.first; stops = bestDrop!!.second
                    }
                    // still over the max while chasing new roads: the direct roads may fit
                    if (r != null && max != null && r.total > max && mode == "new") route(g, start, stops.map { it.ll }, end, "any")?.let { r2 -> if (r2.total < r.total * 0.95) { r = r2; usedMode = "any" } }
                }
                val route = r ?: error("No route found on the major roads for that — try another place.")
                say("Measuring the climbing…")
                val elev = elevation(route.pts)
                say("Naming the route…")
                val facts = JSONObject().put("request", regency?.let { "never-ridden roads in $it" } ?: text).put("kind", if (loop) "loop (back to the start)" else "one way")
                    .put("total_km", Math.round(route.total / 1000)).put("never_ridden_km", Math.round(route.nw / 1000)).putOpt("climb_m", elev?.second?.let { Math.round(it) })
                    .put("through", JSONArray(stops.map { it.name }.distinct())).put("mode", usedMode)
                val nm = runCatching { JSONObject(json(Coach.once(a, "You name a planned road-cycling ride in Bali. Give a short catchy title (max 6 words) and one sentence on why it is worth riding, using only the facts given (say \"loop\" only if kind is a loop). Never mention where the ride starts. Reply ONLY with JSON: {\"title\":\"…\",\"desc\":\"…\"}", facts.toString(), 200), '{', '}')) }.getOrNull()
                val o = JSONObject().put("title", nm?.optString("title")?.takeIf { it.isNotBlank() } ?: stops.map { it.name }.distinct().joinToString(" · ").ifEmpty { "${Math.round(route.total / 1000)} km loop" })
                    .put("desc", nm?.optString("desc")?.takeIf { it.isNotBlank() } ?: summary).put("request", regency?.let { "Regency: $it" } ?: text)
                    .put("km", Math.round(route.total / 1000)).put("nw_km", Math.round(route.nw / 1000)).put("loop", loop).put("mode", usedMode)
                    .put("over", km != null && route.total > km * 1100).put("want_km", km ?: JSONObject.NULL).put("pe", encode(route.pts)).put("at", System.currentTimeMillis())
                elev?.let { (e, c) -> o.put("climb", Math.round(c)).put("elev", JSONArray(e.map { Math.round(it) })) }
                save(a, o)
                ""
            }
            status = res.exceptionOrNull()?.message ?: ""
            if (res.isSuccess) pick = 0
            busy = false
            a.ui.post { a.show("more:chase") }
        }.start()
    }

    private fun gpx(a: AppActivity, o: JSONObject) = runCatching {
        val pts = Ui.decodePolyline(o.optString("pe"))
        val name = o.optString("title") + " — ${o.optInt("km")} km"
        val text = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<gpx version=\"1.1\" creator=\"Ascent\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n<trk><name>" +
            name.replace(Regex("[<&>]"), "") + "</name><trkseg>\n" + pts.joinToString("\n") { "<trkpt lat=\"${it[0]}\" lon=\"${it[1]}\"/>" } + "\n</trkseg></trk></gpx>\n"
        val v = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, "chase-${o.optInt("km")}km-${o.optLong("at")}.gpx"); put(MediaStore.Downloads.MIME_TYPE, "application/gpx+xml") }
        val uri = a.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v)!!
        a.contentResolver.openOutputStream(uri)!!.use { it.write(text.toByteArray()) }
        "Saved to Downloads."
    }.getOrElse { "Couldn't save the GPX: ${it.message}" }

    fun page(a: AppActivity): Unit = a.load(listOf("activities?limit=500")) { r ->
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities"))
        val col = a.page()
        More.back(a, col, "Chase routes")
        col.addView(Ui.text(a, "Type the ride you want — \"70 km loop via Bedugul, lots of climbing\", \"out to Amed along the coast\". The AI only sees your words and the place names, never where you start.", 12f, Ui.MUTED))
        fun field(hint: String, v: String) = EditText(a).apply { this.hint = hint; setText(v); setTextColor(Ui.TEXT); setHintTextColor(Ui.MUTED) }
        val text = field("The ride you want", lastText); val start = field("Start (empty = your usual start)", lastStart); val end = field("End (empty = back to the start)", lastEnd)
        listOf(text, start, end).forEach { col.addView(it) }
        col.addView(LinearLayout(a).apply {
            listOf("new" to "Never-ridden roads", "any" to "Any roads", "fast" to "Fastest").forEach { (k, l) ->
                addView(Ui.text(a, l, 13f, if (k == mode) Ui.ORANGE else Ui.MUTED, true).apply { setPadding(0, Ui.dp(a, 8), Ui.dp(a, 16), Ui.dp(a, 8)); setOnClickListener { mode = k; lastText = text.text.toString(); a.show("more:chase") } })
            }
        })
        fun remember() { lastText = text.text.toString().trim(); lastStart = start.text.toString().trim(); lastEnd = end.text.toString().trim() }
        if (!busy) col.addView(a.button("Make the route") { remember(); if (lastText.isEmpty()) { status = "Type the ride you want first."; a.show("more:chase") } else generate(a, acts, lastText, lastStart, lastEnd, null, false) })
        if (status.isNotEmpty()) col.addView(Ui.text(a, status, 13f, if (busy) Ui.MUTED else Ui.RED, true))
        Destinations.regencies(a)?.let { regs ->
            col.addView(Ui.text(a, "Or a loop through a regency's never-ridden roads:", 12f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 8), 0, 0) })
            col.addView(android.widget.HorizontalScrollView(a).apply { isHorizontalScrollBarEnabled = false
                addView(LinearLayout(a).apply { regs.forEach { g -> addView(Ui.text(a, g.name, 13f, Ui.ORANGE, true).apply {
                    setPadding(0, Ui.dp(a, 8), Ui.dp(a, 16), Ui.dp(a, 8)); setOnClickListener { if (!busy) { remember(); generate(a, acts, "", lastStart, "", g.name, false) } } }) } }) })
        }

        val h = history(a)
        if (h.length() == 0) return@load
        val o = h.optJSONObject(pick.coerceIn(0, h.length() - 1)) ?: return@load
        col.addView(Ui.heading(a, o.optString("title")))
        col.addView(Ui.card(a).apply {
            if (o.optString("desc").isNotEmpty()) addView(Ui.text(a, o.optString("desc"), 13f, Ui.TEXT))
            addView(Ui.row(a, "${o.optInt("km")} km" + if (o.optBoolean("loop")) " loop" else " one way", if (o.has("climb")) "↑ ${o.optInt("climb")} m" else "",
                "${o.optInt("nw_km")} km never ridden · " + mapOf("new" to "never-ridden roads", "any" to "any roads", "fast" to "fastest")[o.optString("mode")] + " · " + o.optString("request")))
            if (o.optBoolean("over")) addView(Ui.text(a, "Over the ${o.optInt("want_km")} km you asked for. Try fewer places, or make it one way.", 12f, 0xFFFB923C.toInt(), true))
            addView(RideMap(a, o.optString("pe")), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Ui.dp(a, 320)).apply { topMargin = Ui.dp(a, 8) })
            o.optJSONArray("elev")?.let { e -> addView(Ui.text(a, "Elevation", 12f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 8), 0, 0) })
                addView(LineChart(a).apply { set(DoubleArray(e.length()) { e.optDouble(it) }, Ui.BLUE, " m") }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Ui.dp(a, 90))) }
            addView(a.button("Save GPX to Downloads") { status = gpx(a, o); a.show("more:chase") })
            if (o.optBoolean("over") && o.optBoolean("loop") && !busy && !o.optString("request").startsWith("Regency:"))
                addView(a.button("Make it one way") { generate(a, acts, o.optString("request"), lastStart, "", null, true) })
            addView(a.button("Delete this route") {
                val out = JSONArray(); for (i in 0 until h.length()) if (i != pick) out.put(h.get(i)); histFile(a).writeText(out.toString()); pick = 0; a.show("more:chase") })
        })
        if (h.length() > 1) {
            col.addView(Ui.heading(a, "Your routes · ${h.length()}"))
            col.addView(Ui.card(a).apply {
                for (i in 0 until h.length()) { val x = h.getJSONObject(i)
                    if (i > 0) addView(Ui.divider(a))
                    addView(Ui.row(a, x.optString("title"), "${x.optInt("km")} km", x.optString("request").take(60) + (if (x.has("climb")) " · ↑ ${x.optInt("climb")} m" else "")).apply {
                        if (i == pick) ((getChildAt(0) as LinearLayout).getChildAt(0) as android.widget.TextView).setTextColor(Ui.ORANGE)
                        setOnClickListener { pick = i; a.show("more:chase") } }) }
            })
        }
    }
}
