package xyz.doniwirawan.ascent

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.Executors

/**
 * One activity: its map, numbers and AI write-up, all from the dashboard's
 * database. The per-second data (charts, and the map's Speed / Power colours)
 * needs Strava's streams, so it loads only when asked for (one Strava request
 * through the API).
 */
class RideActivity : Activity() {

    private val io = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        actionBar?.hide()
        window.statusBarColor = Ui.BG
        val a = JSONObject(intent.getStringExtra("activity") ?: "{}")
        val id = a.optLong("id")

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = Ui.dp(this@RideActivity, 16)
            setPadding(p, p, p, p)
        }
        col.addView(Ui.text(this, a.optString("name"), 20f, Ui.TEXT, true))
        col.addView(Ui.text(this, Ui.date(a.optString("start_date_local")) + " · " + a.optString("sport_type").ifEmpty { a.optString("type") }, 12f, Ui.MUTED))

        val poly = a.optJSONObject("map")?.optString("summary_polyline")
        val map = if (!poly.isNullOrEmpty()) RideMap(this, poly) else null
        if (map != null) col.addView(map, LinearLayout.LayoutParams(MATCH_PARENT, Ui.dp(this, 340)).apply { topMargin = Ui.dp(this@RideActivity, 12) })

        val t = ArrayList<Pair<String, String>>()
        t += Ui.km(a.optDouble("distance")) to "distance|distance"
        t += Ui.hm(a.optLong("moving_time")) to "moving time|time"
        t += "${Math.round(a.optDouble("total_elevation_gain"))} m" to "climbing|climb"
        if (a.optDouble("average_speed") > 0) t += Ui.kmh(a.optDouble("average_speed")) to "avg speed|speed"
        if (a.optDouble("max_speed") > 0) t += Ui.kmh(Math.min(a.optDouble("max_speed"), 65 / 3.6)) to "max speed|speed"
        if (a.optDouble("average_heartrate") > 0) t += "${Math.round(a.optDouble("average_heartrate"))} bpm" to "avg HR|hr"
        if (a.optDouble("max_heartrate") > 0) t += "${Math.round(a.optDouble("max_heartrate"))} bpm" to "max HR|hr"
        val meter = a.optBoolean("device_watts")
        if (a.optDouble("average_watts") > 0) t += "${Math.round(a.optDouble("average_watts"))} W" to if (meter) "avg power|power" else "avg power (est.)|power"
        if (meter && a.optDouble("weighted_average_watts") > 0) t += "${Math.round(a.optDouble("weighted_average_watts"))} W" to "normalized power|power"
        if (meter && a.optDouble("max_watts") > 0) t += "${Math.round(a.optDouble("max_watts"))} W" to "max power|power"
        if (a.optDouble("kilojoules") > 0) t += String.format(Locale.US, "%,d kJ", Math.round(a.optDouble("kilojoules"))) to "energy|energy"
        if (a.optDouble("average_cadence") > 0) t += "${Math.round(a.optDouble("average_cadence"))}" to "cadence|cadence"
        if (a.optDouble("suffer_score") > 0) t += "${Math.round(a.optDouble("suffer_score"))}" to "relative effort|effort"
        col.addView(Ui.heading(this, "Numbers"))
        col.addView(Ui.tiles(this, t))

        // the AI write-up the dashboard saved for this ride (database)
        val aiBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(aiBox)
        fun showAi(list: JSONObject?) {
            val arr = list?.optJSONArray("activities") ?: return
            val row = (0 until arr.length()).map { arr.getJSONObject(it) }.firstOrNull { it.optString("activity_id") == id.toString() } ?: return
            aiBox.removeAllViews()
            aiBox.addView(Ui.heading(this, "AI analysis"))
            aiBox.addView(Ui.card(this).apply {
                row.optString("caption_desc").takeIf { it.isNotEmpty() && it != "null" }?.let { addView(Ui.text(this@RideActivity, it, 13f)) }
                row.optString("analysis").takeIf { it.isNotEmpty() && it != "null" }?.let {
                    addView(Ui.text(this@RideActivity, it, 12f, Ui.MUTED).apply { setPadding(0, Ui.dp(this@RideActivity, 8), 0, 0) })
                }
            })
        }
        showAi(Api.cached(this, "ai"))
        io.execute { val fresh = try { Api.get(this, "ai") } catch (e: Exception) { null }; ui.post { showAi(fresh) } }

        val charts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val load = button(if (map != null) "Load ride data: charts + speed & power on the map" else "Show speed, heart rate & power charts")
        load.setOnClickListener {
            load.isEnabled = false; load.text = "Loading charts…"
            io.execute {
                val path = "activities/$id?streams=time,distance,latlng,velocity_smooth,heartrate,watts,altitude"
                val r = try { Api.cached(this, path) ?: Api.get(this, path) } catch (e: Exception) { load.post { load.text = e.message; load.isEnabled = true }; null }
                val st = r?.optJSONObject("streams") ?: return@execute
                ui.post {
                    col.removeView(load)
                    if (map != null) map.setStreams(mapPoints(st), st.has("watts") && a.optBoolean("device_watts"))
                    fun series(k: String, scale: Double = 1.0): DoubleArray? {
                        val d = st.optJSONObject(k)?.optJSONArray("data") ?: return null
                        val n = d.length(); val step = Math.max(1, n / 400)          // ~400 points is plenty on a phone
                        return DoubleArray((n + step - 1) / step) { val v = d.optDouble(it * step, Double.NaN); if (v.isNaN()) v else v * scale }
                    }
                    listOf(Triple("velocity_smooth", "Speed", 3.6) to (Ui.ORANGE to " km/h"), Triple("heartrate", "Heart rate", 1.0) to (Ui.RED to " bpm"),
                        Triple("watts", "Power", 1.0) to (Ui.PURPLE to " W"), Triple("altitude", "Elevation", 1.0) to (Ui.BLUE to " m")).forEach { (k, look) ->
                        val s = series(k.first, k.third) ?: return@forEach
                        charts.addView(Ui.heading(this, k.second))
                        charts.addView(Ui.card(this).apply {
                            addView(LineChart(this@RideActivity).apply { set(s, look.first, look.second) }, LinearLayout.LayoutParams(MATCH_PARENT, Ui.dp(this@RideActivity, 130)))
                        })
                    }
                    // time in zones (website bands) and per-km splits
                    val time = st.optJSONObject("time")?.optJSONArray("data")
                    val ftp = Zones.ftp(this)
                    val watts = st.optJSONObject("watts")?.optJSONArray("data")
                    if (watts != null && ftp > 0 && a.optBoolean("device_watts")) {
                        charts.addView(Ui.heading(this, "Power zones · FTP ${Math.round(ftp)} W"))
                        charts.addView(Zones.view(this, Zones.POWER, ftp, "W", Zones.timeIn(Zones.POWER, ftp, watts, time)))
                    }
                    val lthr = Zones.lthr(this)
                    val hr = st.optJSONObject("heartrate")?.optJSONArray("data")
                    if (hr != null && lthr > 0) {
                        charts.addView(Ui.heading(this, "Heart-rate zones · threshold ${Math.round(lthr)} bpm"))
                        charts.addView(Zones.view(this, Zones.HEART, lthr, "bpm", Zones.timeIn(Zones.HEART, lthr, hr, time)))
                    }
                    Zones.splits(this, st)?.let { charts.addView(Ui.heading(this, "Splits per km")); charts.addView(it) }
                }
            }
        }
        if (id > 0) { col.addView(load); col.addView(charts) }

        col.addView(button("Open on Strava").apply {
            setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.strava.com/activities/$id"))) }
        })

        col.addView(android.view.View(this), LinearLayout.LayoutParams(MATCH_PARENT, Ui.dp(this, 16)))
        setContentView(ScrollView(this).apply {
            setBackgroundColor(Ui.BG)
            addView(col, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        })
    }

    private fun button(label: String) = Button(this).apply {
        text = label
        isAllCaps = false
        layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = Ui.dp(this@RideActivity, 12) }
    }

    /** [[lat, lng, speed, 10-s power], …] at full resolution, for the map's colours and peaks. */
    private fun mapPoints(st: JSONObject): org.json.JSONArray {
        val ll = st.optJSONObject("latlng")?.optJSONArray("data") ?: return org.json.JSONArray()
        val v = st.optJSONObject("velocity_smooth")?.optJSONArray("data")
        val w = st.optJSONObject("watts")?.optJSONArray("data")
        val out = org.json.JSONArray()
        var sum = 0.0
        for (i in 0 until ll.length()) {
            val p = ll.optJSONArray(i) ?: continue
            val row = org.json.JSONArray().put(p.optDouble(0)).put(p.optDouble(1)).put(v?.optDouble(i, 0.0) ?: 0.0)
            if (w != null) {
                sum += w.optDouble(i, 0.0)
                if (i >= 10) sum -= w.optDouble(i - 10, 0.0)
                row.put(Math.round(sum / Math.min(i + 1, 10)))
            }
            out.put(row)
        }
        return out
    }
}
