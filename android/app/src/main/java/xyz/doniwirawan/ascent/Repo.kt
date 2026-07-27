package xyz.doniwirawan.ascent

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.Locale

/**
 * Talks to Strava on the phone's behalf.
 *
 * The client secret stays on Vercel: we POST the refresh token to the web app's
 * /api/strava-token and get a short-lived access token back, then call Strava
 * directly. Results are cached in SharedPreferences so the widget can draw
 * instantly (and offline) before any network work happens.
 */
object Repo {

    private const val PREFS = "ascent"
    private const val ACTIVITIES = "https://www.strava.com/api/v3/athlete/activities"
    private const val PAGE_SIZE = 200
    private const val MAX_PAGES = 5

    fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // ── Public state ────────────────────────────────────────────────────────

    class Bucket {
        var km = 0.0
        var seconds = 0L
        var elevation = 0.0
        var count = 0
    }

    class Snapshot(
        val week: Bucket,
        val month: Bucket,
        val ytd: Bucket,
        /** km per day for the last 7 days, oldest → newest. */
        val days: DoubleArray,
        val lastName: String?,
        val syncedAt: Long,
        /** 1–99. WHOOP-style readiness, from training-load balance. */
        val recovery: Int = 50,
        /** Today's load on a 0–21 scale. */
        val strain: Double = 0.0,
        val ctl: Double = 0.0,
        val atl: Double = 0.0,
    ) {
        val tsb: Double get() = ctl - atl
    }

    fun refreshToken(ctx: Context): String =
        prefs(ctx).getString("refresh_token", null)?.takeIf { it.isNotBlank() }
            ?: BuildConfig.DEFAULT_REFRESH_TOKEN

    fun setRefreshToken(ctx: Context, token: String) {
        // A new refresh token invalidates any cached access token.
        prefs(ctx).edit()
            .putString("refresh_token", token.trim())
            .remove("access_token")
            .remove("expires_at")
            .apply()
    }

    fun lastError(ctx: Context): String? = prefs(ctx).getString("last_error", null)

    /** Last successful snapshot, or null if we have never fetched one. */
    fun cached(ctx: Context): Snapshot? {
        val raw = prefs(ctx).getString("snapshot", null) ?: return null
        return try {
            fromJson(JSONObject(raw))
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Fetches this year's activities and recomputes the snapshot.
     * Throws with a human-readable message on failure; callers show it verbatim.
     */
    fun refresh(ctx: Context): Snapshot {
        try {
            val token = accessToken(ctx)
            val snapshot = compute(fetchThisYear(token))
            prefs(ctx).edit()
                .putString("snapshot", toJson(snapshot).toString())
                .remove("last_error")
                .apply()
            return snapshot
        } catch (e: Exception) {
            prefs(ctx).edit().putString("last_error", message(e)).apply()
            throw e
        }
    }

    private fun message(e: Exception) = e.message?.takeIf { it.isNotBlank() } ?: e.javaClass.simpleName

    // ── Auth ────────────────────────────────────────────────────────────────

    private fun accessToken(ctx: Context): String {
        val p = prefs(ctx)
        val nowSec = System.currentTimeMillis() / 1000
        val cached = p.getString("access_token", null)
        // Refresh a couple of minutes early so a token can't expire mid-request.
        if (cached != null && p.getLong("expires_at", 0L) > nowSec + 120) return cached

        val refresh = refreshToken(ctx)
        if (refresh.isBlank()) throw IllegalStateException("No refresh token. Open Ascent Widget and paste one.")

        val res = postJson(BuildConfig.TOKEN_ENDPOINT, JSONObject().put("refresh_token", refresh))
        val access = res.optString("access_token")
        if (access.isNullOrEmpty()) {
            val why = res.optString("message").ifEmpty { res.optString("error").ifEmpty { "token refresh failed" } }
            throw IllegalStateException("Strava sign-in failed: $why")
        }

        val edit = p.edit()
            .putString("access_token", access)
            .putLong("expires_at", res.optLong("expires_at", nowSec + 3600))
        // Strava sometimes rotates the refresh token — keep the newest one.
        res.optString("refresh_token").takeIf { it.isNotEmpty() && it != refresh }
            ?.let { edit.putString("refresh_token", it) }
        edit.apply()
        return access
    }

    // ── HTTP ────────────────────────────────────────────────────────────────

    private fun open(url: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 15_000
            instanceFollowRedirects = true
        }

    private fun postJson(url: String, body: JSONObject): JSONObject {
        val c = open(url)
        return try {
            c.requestMethod = "POST"
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            JSONObject(readBody(c))
        } finally {
            c.disconnect()
        }
    }

    private fun getArray(url: String, token: String): JSONArray {
        val c = open(url)
        return try {
            c.setRequestProperty("Authorization", "Bearer $token")
            val text = readBody(c)
            if (c.responseCode == 429) throw IllegalStateException("Strava rate limit hit — try again later.")
            if (c.responseCode !in 200..299) throw IllegalStateException("Strava error ${c.responseCode}")
            JSONArray(text)
        } finally {
            c.disconnect()
        }
    }

    private fun readBody(c: HttpURLConnection): String {
        val stream = if (c.responseCode in 200..299) c.inputStream else c.errorStream
        return stream?.bufferedReader()?.use { it.readText() } ?: ""
    }

    /**
     * Activities since Jan 1 — or 180 days back if that is earlier, so the
     * 42-day fitness average has warmed up before we report a recovery score.
     * In January, "since Jan 1" alone would leave CTL near zero and make every
     * recovery reading look artificially good.
     */
    private fun fetchThisYear(token: String): List<JSONObject> {
        val startOfYear = Calendar.getInstance().apply {
            set(Calendar.MONTH, Calendar.JANUARY)
            set(Calendar.DAY_OF_MONTH, 1)
            zeroTime()
        }.timeInMillis / 1000
        val halfYearAgo = Calendar.getInstance().apply {
            zeroTime(); add(Calendar.DAY_OF_MONTH, -180)
        }.timeInMillis / 1000
        val jan1 = minOf(startOfYear, halfYearAgo)

        val out = ArrayList<JSONObject>()
        for (page in 1..MAX_PAGES) {
            val arr = getArray("$ACTIVITIES?after=$jan1&per_page=$PAGE_SIZE&page=$page", token)
            for (i in 0 until arr.length()) out.add(arr.getJSONObject(i))
            if (arr.length() < PAGE_SIZE) break
        }
        return out
    }

    // ── Aggregation ─────────────────────────────────────────────────────────

    private fun Calendar.zeroTime() {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }

    private fun dayKey(c: Calendar) = String.format(
        Locale.US, "%04d-%02d-%02d",
        c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH)
    )

    /**
     * Buckets by calendar day. Strava's `start_date_local` is wall-clock time
     * with a misleading 'Z', so the first 10 characters are the athlete's own
     * date — compared as strings, which needs no timezone maths at all.
     */
    private fun compute(activities: List<JSONObject>): Snapshot {
        val today = Calendar.getInstance().apply { zeroTime() }
        val todayKey = dayKey(today)

        val monthKey = todayKey.substring(0, 7)
        val yearKey = todayKey.substring(0, 4)

        val weekStart = (today.clone() as Calendar).apply {
            // Monday-first week, regardless of the device's locale default.
            val shift = (get(Calendar.DAY_OF_WEEK) - Calendar.MONDAY + 7) % 7
            add(Calendar.DAY_OF_MONTH, -shift)
        }
        val weekStartKey = dayKey(weekStart)

        // The 7 day-keys ending today, oldest first.
        val recent = (6 downTo 0).map { back ->
            dayKey((today.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, -back) })
        }

        val week = Bucket(); val month = Bucket(); val ytd = Bucket()
        val perDay = HashMap<String, Double>()
        var lastName: String? = null
        var lastKey = ""

        for (a in activities) {
            val local = a.optString("start_date_local").ifEmpty { a.optString("start_date") }
            if (local.length < 10) continue
            val key = local.substring(0, 10)

            val km = a.optDouble("distance", 0.0) / 1000.0
            val secs = a.optLong("moving_time", 0L)
            val elev = a.optDouble("total_elevation_gain", 0.0)

            fun add(b: Bucket) { b.km += km; b.seconds += secs; b.elevation += elev; b.count++ }

            if (key.startsWith(yearKey)) add(ytd)
            if (key.startsWith(monthKey)) add(month)
            if (key >= weekStartKey && key <= todayKey) add(week)
            if (key in recent) perDay[key] = (perDay[key] ?: 0.0) + km

            if (key >= lastKey) {
                lastKey = key
                lastName = a.optString("name").takeIf { it.isNotEmpty() }
            }
        }

        val p = pmc(activities, todayKey)
        return Snapshot(
            week, month, ytd,
            days = DoubleArray(7) { perDay[recent[it]] ?: 0.0 },
            lastName = lastName,
            syncedAt = System.currentTimeMillis(),
            recovery = recoveryFor(p.ctl - p.atl),
            strain = strainFor(p.todayLoad),
            ctl = p.ctl,
            atl = p.atl,
        )
    }


    /* ── Training load → Recovery & Strain ───────────────────────────────────
       A port of the web dashboard's PMC model (js/training.js) so the widget
       agrees with the site. Per-activity load prefers Strava's Relative Effort
       (suffer_score, already an HR-TRIMP), then an HR-TRIMP of our own, then
       duration. The app has no FTP, so the power branch the website uses first
       is not available here — for most activities Strava supplies a suffer
       score anyway, so the two agree in practice.

       CTL = 42-day EWMA of daily load, ATL = 7-day, TSB = CTL − ATL. */

    private class Pmc(val ctl: Double, val atl: Double, val todayLoad: Double)

    private fun activityLoad(a: JSONObject, hrMax: Double): Double {
        val dur = (a.optLong("moving_time").takeIf { it > 0 } ?: a.optLong("elapsed_time")).toDouble()
        if (dur <= 0) return 0.0

        val suffer = a.optDouble("suffer_score", 0.0)
        if (suffer > 0) return suffer

        val hr = a.optDouble("average_heartrate", 0.0)
        val hrRest = 60.0                       // the API exposes no resting HR
        if (hr > 0 && hrMax > hrRest) {
            val hrr = ((hr - hrRest) / (hrMax - hrRest)).coerceIn(0.0, 1.0)
            val trimp = (dur / 60) * hrr * 0.64 * Math.exp(1.92 * hrr)
            return trimp * 0.6
        }
        return (dur / 3600) * 50                // moderate-intensity fallback
    }

    /** Walks every day from the first activity to today, decaying CTL and ATL. */
    private fun pmc(activities: List<JSONObject>, todayKey: String): Pmc {
        val hrMax = activities.fold(0.0) { m, a -> maxOf(m, a.optDouble("max_heartrate", 0.0)) }

        val byDay = HashMap<String, Double>()
        var earliest: String? = null
        for (a in activities) {
            val local = a.optString("start_date_local").ifEmpty { a.optString("start_date") }
            if (local.length < 10) continue
            val key = local.substring(0, 10)
            byDay[key] = (byDay[key] ?: 0.0) + activityLoad(a, hrMax)
            if (earliest == null || key < earliest!!) earliest = key
        }
        val start = earliest ?: return Pmc(0.0, 0.0, 0.0)

        val kC = 1 - Math.exp(-1.0 / 42)
        val kA = 1 - Math.exp(-1.0 / 7)
        var ctl = 0.0; var atl = 0.0
        var key = start
        var guard = 0
        while (key <= todayKey && guard++ < 4000) {
            val load = byDay[key] ?: 0.0
            ctl += (load - ctl) * kC
            atl += (load - atl) * kA
            key = nextDay(key)
        }
        return Pmc(ctl, atl, byDay[todayKey] ?: 0.0)
    }

    private fun nextDay(key: String): String {
        val c = Calendar.getInstance()
        c.set(key.substring(0, 4).toInt(), key.substring(5, 7).toInt() - 1, key.substring(8, 10).toInt())
        c.zeroTime()
        c.add(Calendar.DAY_OF_MONTH, 1)
        return dayKey(c)
    }

    /** Logistic curve over TSB: 0 -> 50%, -30 -> ~8%, +25 -> ~89%. */
    fun recoveryFor(tsb: Double): Int =
        (100 / (1 + Math.exp(-tsb / 12))).toInt().coerceIn(1, 99)

    /** WHOOP's 0-21 strain scale is logarithmic, so early effort counts most. */
    fun strainFor(load: Double): Double =
        (6.5 * Math.log(1 + load / 12)).coerceIn(0.0, 21.0)

    fun recoveryBandColor(recovery: Int): Int = when {
        recovery >= 67 -> 0xFF16EC8B.toInt()
        recovery >= 34 -> 0xFFFFDE00.toInt()
        else           -> 0xFFFF0026.toInt()
    }

    fun recoveryBandLabel(recovery: Int): String = when {
        recovery >= 67 -> "Recovered"
        recovery >= 34 -> "Adequate"
        else           -> "Rest"
    }

    // ── Persistence ─────────────────────────────────────────────────────────

    private fun bucketJson(b: Bucket) = JSONObject()
        .put("km", b.km).put("s", b.seconds).put("e", b.elevation).put("n", b.count)

    private fun bucketOf(o: JSONObject) = Bucket().apply {
        km = o.optDouble("km"); seconds = o.optLong("s")
        elevation = o.optDouble("e"); count = o.optInt("n")
    }

    private fun toJson(s: Snapshot) = JSONObject()
        .put("week", bucketJson(s.week))
        .put("month", bucketJson(s.month))
        .put("ytd", bucketJson(s.ytd))
        .put("days", JSONArray().apply { s.days.forEach { put(it) } })
        .put("lastName", s.lastName ?: JSONObject.NULL)
        .put("syncedAt", s.syncedAt)
        .put("recovery", s.recovery)
        .put("strain", s.strain)
        .put("ctl", s.ctl)
        .put("atl", s.atl)

    private fun fromJson(o: JSONObject): Snapshot {
        val arr = o.optJSONArray("days")
        return Snapshot(
            week = bucketOf(o.getJSONObject("week")),
            month = bucketOf(o.getJSONObject("month")),
            ytd = bucketOf(o.getJSONObject("ytd")),
            days = DoubleArray(7) { arr?.optDouble(it, 0.0) ?: 0.0 },
            lastName = o.optString("lastName").takeIf { it.isNotEmpty() && it != "null" },
            syncedAt = o.optLong("syncedAt"),
            recovery = o.optInt("recovery", 50),
            strain = o.optDouble("strain", 0.0),
            ctl = o.optDouble("ctl", 0.0),
            atl = o.optDouble("atl", 0.0),
        )
    }
}
