package xyz.doniwirawan.ascent

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * More → Segment gaps, the website's js/segment-gaps.js: stretches of road you
 * ride regularly (3+ rides, 0.5–5 km) that none of your known segments covers —
 * the places a new "A -> B" segment is worth drawing. Known segments are your
 * starred ones plus those found by scanning rides (one Strava request per ride,
 * 50 per tap, like the website). Strava has no segment-creation API, so each gap
 * comes with its start / end and how far into which ride it falls.
 */
object SegmentGaps {
    private const val CELL_M = 25.0      // coverage grid resolution
    private const val DILATE = 2         // ±cells of slack: GPS noise + polyline simplification
    private const val MIN_M = 500.0      // shorter than this isn't worth a segment
    private const val MAX_M = 5000.0     // longer than this is a route, not a segment
    private const val MIN_RIDES = 3      // road you actually use, not a one-off
    private const val JOIN_M = 500.0     // how close a named segment end must be to name a gap
    private const val BATCH = 50

    class Seg(val id: Long, val name: String, val start: DoubleArray?, val end: DoubleArray?, val src: Long?)
    class Gap(val pts: List<DoubleArray>, val len: Double, val start: DoubleArray, val end: DoubleArray, val actId: Long, val actName: String,
              val atStart: Double, val atEnd: Double, val rides: Int, val score: Double, var name: String? = null, var before: String? = null, var after: String? = null)

    // ── geometry ────────────────────────────────────────────────────────────
    private class Grid(refLat: Double) {
        val dLat = CELL_M / 111320
        val dLng = (CELL_M / (111320 * Math.cos(refLat * Math.PI / 180))).let { if (it.isInfinite() || it.isNaN()) CELL_M / 111320 else it }
        fun key(lat: Double, lng: Double) = Math.round(lat / dLat).toString() + ":" + Math.round(lng / dLng)
    }

    internal fun hav(a: DoubleArray, b: DoubleArray): Double {
        val rad = Math.PI / 180; val dy = (b[0] - a[0]) * rad; val dx = (b[1] - a[1]) * rad
        val m = Math.cos((a[0] + b[0]) / 2 * rad)
        return Math.sqrt(dy * dy + dx * dx * m * m) * 6371000
    }

    /** Every cell the path touches plus a halo, sampled every half cell so sparse lines leave no holes. */
    private fun mark(set: HashSet<String>, pts: List<DoubleArray>, g: Grid) {
        for (i in 1 until pts.size) {
            val a = pts[i - 1]; val b = pts[i]
            val n = maxOf(1, Math.ceil(hav(a, b) / (CELL_M / 2)).toInt())
            for (k in 0..n) {
                val t = k.toDouble() / n
                val gy = Math.round((a[0] + (b[0] - a[0]) * t) / g.dLat); val gx = Math.round((a[1] + (b[1] - a[1]) * t) / g.dLng)
                for (dy in -DILATE..DILATE) for (dx in -DILATE..DILATE) set.add((gy + dy).toString() + ":" + (gx + dx))
            }
        }
    }

    /** The part of the parent ride between the segment's ends (website _sliceRouteFromActivity), else a straight line. */
    private fun coords(s: Seg, polyById: Map<Long, String>): List<DoubleArray> {
        val st = s.start; val en = s.end
        if (st == null || en == null) return emptyList()
        polyById[s.src]?.let { poly ->
            val pts = Ui.decodePolyline(poly)
            if (pts.size >= 2) {
                fun d2(p: DoubleArray, ll: DoubleArray) = (p[0] - ll[0]) * (p[0] - ll[0]) + (p[1] - ll[1]) * (p[1] - ll[1])
                fun nearest(ll: DoubleArray) = pts.indices.minByOrNull { d2(pts[it], ll) }!!
                var i0 = nearest(st); var i1 = nearest(en)
                if (i0 > i1) { val t = i0; i0 = i1; i1 = t }
                var seg = pts.subList(i0, i1 + 1)
                if (seg.size >= 2) {
                    if (d2(seg[0], st) > d2(seg.last(), st)) seg = seg.reversed()
                    return seg
                }
            }
        }
        return listOf(st, en)
    }

    private fun splitName(name: String) = name.split(Regex("\\s*(?:→|->|⇒|=>)\\s*")).takeIf { it.size == 2 }?.map { it.trim() }

    /** The nearest place named by a "P -> Q" segment end within JOIN_M: its start is P, its end Q. */
    private fun nearestPlace(ll: DoubleArray, segs: List<Seg>): Pair<String, String>? {
        var best: Pair<String, String>? = null; var bd = JOIN_M
        for (s in segs) {
            val parts = splitName(s.name) ?: continue
            s.start?.let { val d = hav(it, ll); if (d < bd) { bd = d; best = parts[0] to s.name } }
            s.end?.let { val d = hav(it, ll); if (d < bd) { bd = d; best = parts[1] to s.name } }
        }
        return best
    }

    // ── the scan (website computeSegmentGaps) ───────────────────────────────
    internal fun compute(acts: List<JSONObject>, segs: List<Seg>): List<Gap> {
        val rides = acts.filter { it.optJSONObject("map")?.optString("summary_polyline").orEmpty().isNotEmpty() }
        if (rides.isEmpty()) return emptyList()
        val starts = rides.mapNotNull { it.optJSONArray("start_latlng")?.takeIf { a -> a.length() > 0 }?.optDouble(0) }
        val g = Grid(if (starts.isNotEmpty()) starts.sum() / starts.size else 0.0)
        val polyById = rides.associate { it.optLong("id") to it.getJSONObject("map").getString("summary_polyline") }
        val covered = HashSet<String>()
        for (s in segs) { val c = coords(s, polyById); if (c.size > 1) mark(covered, c, g) }

        class Run(val actId: Long, val actName: String, val pts: List<DoubleArray>, val len: Double, val atStart: Double, val atEnd: Double, val cells: Set<String>)
        val runs = ArrayList<Run>()
        for (a in rides) {
            val pts = Ui.decodePolyline(a.getJSONObject("map").getString("summary_polyline"))
            if (pts.size < 2) continue
            // distance along the simplified track, rescaled to the ride's real distance (Strava's slider)
            val cum = DoubleArray(pts.size); for (i in 1 until pts.size) cum[i] = cum[i - 1] + hav(pts[i - 1], pts[i])
            val polyLen = cum.last().takeIf { it > 0 } ?: 1.0
            val scale = a.optDouble("distance", 0.0).let { if (it > 0) it / polyLen else 1.0 }
            var start = -1
            for (i in 0..pts.size) {
                val inGap = i < pts.size && !covered.contains(g.key(pts[i][0], pts[i][1]))
                if (inGap && start < 0) start = i
                if (!inGap && start >= 0) {
                    val slice = pts.subList(start, i)
                    val len = cum[i - 1] - cum[start]
                    if (slice.size > 1 && len >= MIN_M && len <= MAX_M)
                        runs.add(Run(a.optLong("id"), a.optString("name"), slice, len, cum[start] * scale, cum[i - 1] * scale, slice.map { g.key(it[0], it[1]) }.toSet()))
                    start = -1
                }
            }
        }
        // merge runs that trace the same road (most cells shared)
        class Group(val runs: ArrayList<Run>, val cells: HashSet<String>, var best: Run)
        val groups = ArrayList<Group>()
        for (r in runs) {
            val hit = groups.firstOrNull { grp -> r.cells.count { grp.cells.contains(it) }.toDouble() / minOf(r.cells.size, grp.cells.size) > 0.5 }
            if (hit != null) { hit.runs.add(r); hit.cells.addAll(r.cells); if (r.len > hit.best.len) hit.best = r }
            else groups.add(Group(arrayListOf(r), HashSet(r.cells), r))
        }
        return groups.map { grp ->
            val b = grp.best; val n = grp.runs.map { it.actId }.toSet().size
            Gap(b.pts, b.len, b.pts.first(), b.pts.last(), b.actId, b.actName, b.atStart, b.atEnd, n, n * (b.len / 1000)).apply {
                val pa = nearestPlace(start, segs); val pb = nearestPlace(end, segs)
                before = pa?.second; after = pb?.second
                name = when { pa != null && pb != null && pa.first != pb.first -> "${pa.first} -> ${pb.first}"; pa != null && pb != null -> "${pa.first} loop"
                    pa != null -> "${pa.first} -> ?"; pb != null -> "? -> ${pb.first}"; else -> null }
            }
        }.filter { it.rides >= MIN_RIDES }.sortedByDescending { it.score }
    }

    // ── known segments: starred + scanned rides, kept on the phone ──────────
    private fun store(ctx: Context) = runCatching { JSONObject(Repo.prefs(ctx).getString("gap_scan", "{}")!!) }.getOrDefault(JSONObject())
    private fun ll(a: JSONArray?) = a?.takeIf { it.length() == 2 }?.let { doubleArrayOf(it.getDouble(0), it.getDouble(1)) }

    internal fun known(ctx: Context, starred: JSONArray?): List<Seg> {
        val byId = LinkedHashMap<Long, Seg>()
        val scanned = store(ctx).optJSONObject("segs") ?: JSONObject()
        for (i in 0 until (starred?.length() ?: 0)) {
            val s = starred!!.getJSONObject(i); val id = s.optLong("id")
            byId[id] = Seg(id, s.optString("name"), ll(s.optJSONArray("start_latlng")), ll(s.optJSONArray("end_latlng")), scanned.optJSONObject(id.toString())?.optLong("src"))
        }
        scanned.keys().forEach { k ->
            val s = scanned.getJSONObject(k); val id = k.toLong()
            if (!byId.containsKey(id)) byId[id] = Seg(id, s.optString("name"), ll(s.optJSONArray("s")), ll(s.optJSONArray("e")), s.optLong("src"))
        }
        return byId.values.toList()
    }

    /** Reads up to BATCH not-yet-scanned activities' segment efforts. Stops at Strava's rate limit. Network. */
    private fun scan(ctx: Context, acts: List<JSONObject>, progress: (Int, Int) -> Unit): String {
        val st = store(ctx); val ids = st.optJSONArray("ids") ?: JSONArray(); val segs = st.optJSONObject("segs") ?: JSONObject()
        val done = (0 until ids.length()).map { ids.getLong(it) }.toHashSet()
        val todo = acts.map { it.optLong("id") }.filter { it > 0 && it !in done }.take(BATCH)
        var n = 0; var note = ""
        for (id in todo) {
            val d = try { Api.get(ctx, "activities/$id?detail=1") } catch (e: Exception) {
                note = if ((e.message ?: "").contains("429")) " Strava's request limit was reached — try again in 15 minutes." else " Stopped: ${e.message}"; break
            }
            val eff = d.optJSONObject("detail")?.optJSONArray("segment_efforts") ?: JSONArray()
            for (i in 0 until eff.length()) {
                val e = eff.getJSONObject(i); val sid = e.optLong("segment_id")
                if (sid <= 0 || segs.has(sid.toString())) continue
                segs.put(sid.toString(), JSONObject().put("name", e.optString("name")).put("s", e.optJSONArray("start_latlng")).put("e", e.optJSONArray("end_latlng")).put("src", id))
            }
            ids.put(id); n++; progress(n, todo.size)
        }
        Repo.prefs(ctx).edit().putString("gap_scan", st.put("ids", ids).put("segs", segs).toString()).apply()
        return "Scanned $n ride${if (n == 1) "" else "s"}.$note"
    }

    // ── page ────────────────────────────────────────────────────────────────
    private var cache: Pair<String, List<Gap>>? = null
    private var status = ""
    private var busy = false
    private var shown = -1

    fun page(a: AppActivity): Unit = a.load(listOf("activities?limit=500", "segments")) { r ->
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities"))
        val segs = known(a, r["segments"]?.optJSONArray("segments"))
        val col = a.page()
        More.back(a, col, "Segment gaps")
        col.addView(Ui.text(a, "Road you've ridden $MIN_RIDES+ times that no segment covers — where a new segment is worth drawing. Strava can't create segments from an app, so each gap tells you where to draw it on Strava.", 12f, Ui.MUTED))
        if (acts.isEmpty()) { col.addView(Ui.text(a, "Load your activities first.", 13f, Ui.MUTED)); return@load }
        val scannedN = store(a).optJSONArray("ids")?.length() ?: 0
        col.addView(a.button(if (busy) "Scanning…" else "Scan ${minOf(BATCH, maxOf(0, acts.size - scannedN))} more rides for segments ($scannedN of ${acts.size} scanned)") {
            if (busy) return@button
            busy = true; status = "Reading your rides' segments…"; a.show("more:gaps")
            Thread {
                val msg = scan(a, acts) { n, t -> a.ui.post { status = "Reading your rides' segments… $n / $t" } }
                a.ui.post { busy = false; status = msg; cache = null; if (a.currentPage() == "more:gaps") a.show("more:gaps") }
            }.start()
        })
        if (status.isNotEmpty()) col.addView(Ui.text(a, status, 12f, if (busy) Ui.MUTED else Ui.TEXT, true))
        if (segs.isEmpty()) { col.addView(Ui.text(a, "No segments known yet — scan some rides (or star segments on Strava) first.", 13f, Ui.MUTED)); return@load }
        val sig = "${acts.size}:${segs.size}:${acts.firstOrNull()?.optLong("id")}"
        val c = cache
        if (c == null || c.first != sig) {
            col.addView(Ui.text(a, "Comparing your rides against ${segs.size} segments…", 13f, Ui.MUTED))
            Thread {
                val gaps = runCatching { compute(acts, segs) }.getOrDefault(emptyList())
                a.ui.post { cache = sig to gaps; if (a.currentPage() == "more:gaps") a.show("more:gaps") }
            }.start()
            return@load
        }
        draw(a, col, c.second)
    }

    private fun draw(a: AppActivity, col: LinearLayout, gaps: List<Gap>) {
        if (gaps.isEmpty()) { col.addView(Ui.text(a, "No gaps found — every stretch you ride at least $MIN_RIDES times is already covered by a segment. Scan more rides to widen the search.", 13f, Ui.MUTED)); return }
        col.addView(Ui.heading(a, "${gaps.size} gap${if (gaps.size > 1) "s" else ""} · ranked by rides × length"))
        fun c5(p: DoubleArray) = String.format(Locale.US, "%.5f, %.5f", p[0], p[1])
        fun open(u: String) = a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)))
        gaps.forEachIndexed { i, x ->
            col.addView(Ui.card(a).apply {
                addView(Ui.text(a, x.name ?: "Unnamed stretch", 15f, Ui.TEXT, true))
                if (x.before != null || x.after != null) addView(Ui.text(a, "between ${x.before ?: "—"} and ${x.after ?: "—"}", 12f, Ui.MUTED))
                addView(Ui.row(a, "Length", String.format(Locale.US, "%.2f km", x.len / 1000)))
                addView(Ui.row(a, "Ridden", "${x.rides}×"))
                listOf("Start" to x.start, "End" to x.end).forEach { (l, p) ->
                    addView(Ui.row(a, l, c5(p), "tap to copy").apply { setOnClickListener {
                        (a.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(l, c5(p)))
                        android.widget.Toast.makeText(a, "Copied", android.widget.Toast.LENGTH_SHORT).show()
                    } })
                }
                addView(Ui.text(a, String.format(Locale.US, "Create it from %s — drag the slider from %.2f to %.2f km into the ride.", x.actName.ifEmpty { "this ride" }, x.atStart / 1000, x.atEnd / 1000), 12f, Ui.TEXT).apply { setPadding(0, Ui.dp(a, 6), 0, 0) })
                if (shown == i) addView(RideMap(a, Chase.encode(x.pts)), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Ui.dp(a, 240)).apply { topMargin = Ui.dp(a, 8) })
                addView(LinearLayout(a).apply {
                    listOf((if (shown == i) "Hide map" else "Map") to { shown = if (shown == i) -1 else i; a.show("more:gaps") },
                        "Open ride" to { open("https://www.strava.com/activities/${x.actId}") },
                        "Google Maps" to { open("https://www.google.com/maps/dir/" + String.format(Locale.US, "%.5f,%.5f/%.5f,%.5f", x.start[0], x.start[1], x.end[0], x.end[1])) },
                    ).forEach { (l, f) -> addView(Ui.text(a, l, 13f, Ui.ORANGE, true).apply { setPadding(0, Ui.dp(a, 10), Ui.dp(a, 18), 0); setOnClickListener { f() } }) }
                })
            })
        }
    }
}
