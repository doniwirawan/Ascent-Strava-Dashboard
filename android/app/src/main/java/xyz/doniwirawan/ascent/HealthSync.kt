package xyz.doniwirawan.ascent

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Watch sleep without the Huawei export: an app that talks to the watch (e.g.
 * JoyoFit with a Huawei Watch Fit 4) writes sleep sessions into Health Connect;
 * this reads them, folds them into nights exactly like the export import
 * (js/sleep-import.js) and posts them to /api/v1/sleep, so the website's Sleep
 * page and this app's Sleep tab both get them.
 *
 * Night rules (same as the import): a night is dated by the morning you woke
 * (local date of start + 6 h); bed/up are local hours, bed negative before
 * midnight; asleep = deep + light + REM; a short daytime session is a nap.
 */
object HealthSync {

    /** Health Connect only lets apps read 30 days back unless they also hold this one. */
    const val HISTORY = "android.permission.health.READ_HEALTH_DATA_HISTORY"
    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HISTORY,
    )
    private const val DEFAULT_OFFSET_MS = 8 * 3600_000L        // Bali, when a record carries no offset

    fun status(ctx: Context): Int = HealthConnectClient.getSdkStatus(ctx)
    fun available(ctx: Context) = status(ctx) == HealthConnectClient.SDK_AVAILABLE

    /**
     * Asks for read access. On Android 14+ health permissions are ordinary runtime
     * permissions: the library's intent then only works through an AndroidX
     * ActivityResultRegistry, which this app's plain Activities don't have — so we
     * call requestPermissions ourselves. Older Android opens Health Connect's screen.
     * The answer arrives in onRequestPermissionsResult / onActivityResult with `req`.
     */
    fun requestPermissions(act: android.app.Activity, req: Int, perms: Set<String> = PERMISSIONS) {
        val intent = PermissionController.createRequestPermissionResultContract().createIntent(act, perms)
        if (intent.action == "androidx.activity.result.contract.action.REQUEST_PERMISSIONS") act.requestPermissions(perms.toTypedArray(), req)
        else act.startActivityForResult(intent, req)
    }

    fun hasSleepPermission(ctx: Context): Boolean = available(ctx) && runBlocking {
        HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions()
            .contains(HealthPermission.getReadPermission(SleepSessionRecord::class))
    }

    fun hasHistory(ctx: Context): Boolean = available(ctx) && runBlocking {
        HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions().contains(HISTORY)
    }

    fun lastSync(ctx: Context): String? = Repo.prefs(ctx).getString("hc_last", null)

    /**
     * Reads recent nights, uploads them, returns a line for the screen. The first
     * sync with history access reaches a year back (e.g. what Health Sync copied
     * from Huawei Health); later ones only the last 30 days. Network + disk; call
     * off the UI thread.
     */
    fun sync(ctx: Context, daysOverride: Long? = null): String {
        val client = HealthConnectClient.getOrCreate(ctx)
        val history = runBlocking { client.permissionController.getGrantedPermissions().contains(HISTORY) }
        val days = daysOverride ?: if (history && !Repo.prefs(ctx).getBoolean("hc_backfilled", false)) 365L else 30L
        val end = Instant.now()
        val start = end.minus(days, ChronoUnit.DAYS)
        val range = TimeRangeFilter.between(start, end)
        val sessions = runBlocking { readAll(client, SleepSessionRecord::class, range) }
        val steps = runBlocking {
            if (client.permissionController.getGrantedPermissions().contains(HealthPermission.getReadPermission(StepsRecord::class)))
                readAll(client, StepsRecord::class, range) else emptyList()
        }
        val nights = fold(sessions, steps)
        if (nights.length() == 0) return "Health Connect has no sleep for the last $days days yet — sync your watch app (or Health Sync) first."
        val res = post(ctx, JSONObject().put("source", "Health Connect").put("nights", nights))
        val msg = "Synced ${sessions.size} sleep sessions: ${res.optInt("added")} new nights, ${res.optInt("updated")} updated" +
            (if (res.optInt("kept_from_export") > 0) ", ${res.optInt("kept_from_export")} kept from the Huawei export" else "") + "."
        Repo.prefs(ctx).edit().putString("hc_last", java.text.SimpleDateFormat("d MMM, HH:mm", java.util.Locale.getDefault()).format(java.util.Date()) + " · " + msg)
            .putLong("hc_last_at", System.currentTimeMillis())
            .putBoolean("hc_backfilled", Repo.prefs(ctx).getBoolean("hc_backfilled", false) || days > 30).apply()
        return msg
    }

    /** Auto-sync at most every 6 hours. */
    fun due(ctx: Context) = System.currentTimeMillis() - Repo.prefs(ctx).getLong("hc_last_at", 0) > 6 * 3600_000L

    private suspend fun <T : androidx.health.connect.client.records.Record> readAll(
        client: HealthConnectClient, type: kotlin.reflect.KClass<T>, range: TimeRangeFilter,
    ): List<T> {
        val out = ArrayList<T>()
        var token: String? = null
        do {
            val r = client.readRecords(ReadRecordsRequest(type, range, pageToken = token))
            out += r.records
            token = r.pageToken
        } while (!token.isNullOrEmpty())
        return out
    }

    // ── folding into the export's columns ───────────────────────────────────

    private class Night {
        var deep = 0.0; var light = 0.0; var rem = 0.0; var wake = 0.0; var nap = 0.0
        var first: Long? = null; var last: Long? = null; var off = DEFAULT_OFFSET_MS
        val wakes = ArrayList<LongArray>(); val naps = ArrayList<LongArray>()
        var steps = 0L
    }

    private fun iso(ms: Long) = Instant.ofEpochMilli(ms).toString().substring(0, 10)
    private fun localHour(ms: Long, off: Long): Double {
        var h = ((ms + off) / 3600_000.0) % 24
        if (h < 0) h += 24
        if (h >= 12) h -= 24
        return Math.round(h * 100) / 100.0
    }

    private fun fold(sessions: List<SleepSessionRecord>, steps: List<StepsRecord>): JSONArray {
        val nights = sortedMapOf<String, Night>()
        fun get(d: String) = nights.getOrPut(d) { Night() }
        for (s in sessions) {
            val st = s.startTime.toEpochMilli(); val en = s.endTime.toEpochMilli()
            val off = (s.startZoneOffset?.totalSeconds?.toLong()?.times(1000)) ?: DEFAULT_OFFSET_MS
            val localStartHour = (((st + off) / 3600_000.0) % 24 + 24) % 24
            val isNap = en - st < 3 * 3600_000L && localStartHour in 10.0..19.0
            if (isNap) {
                val n = get(iso(st + off)); n.off = off
                n.nap += (en - st) / 60000.0; n.naps += longArrayOf(st, en)
                continue
            }
            val n = get(iso(st + off + 6 * 3600_000L)); n.off = off
            if (n.first == null || st < n.first!!) n.first = st
            if (n.last == null || en > n.last!!) n.last = en
            if (s.stages.isEmpty()) { n.light += (en - st) / 60000.0; continue }      // no stages: count it all as sleep
            for (g in s.stages) {
                val m = (g.endTime.toEpochMilli() - g.startTime.toEpochMilli()) / 60000.0
                when (g.stage) {
                    SleepSessionRecord.STAGE_TYPE_DEEP -> n.deep += m
                    SleepSessionRecord.STAGE_TYPE_REM -> n.rem += m
                    SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED, SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> {
                        n.wake += m; n.wakes += longArrayOf(g.startTime.toEpochMilli(), g.endTime.toEpochMilli())
                    }
                    else -> n.light += m                                               // LIGHT, SLEEPING, UNKNOWN
                }
            }
        }
        for (r in steps) {
            val off = (r.startZoneOffset?.totalSeconds?.toLong()?.times(1000)) ?: DEFAULT_OFFSET_MS
            get(iso(r.startTime.toEpochMilli() + off)).steps += r.count
        }
        val out = JSONArray()
        nights.forEach { (date, n) ->
            val asleep = Math.round(n.deep + n.light + n.rem).toInt()
            val o = JSONObject().put("date", date)
            if (asleep > 0 || n.nap > 0) {
                o.put("asleep", asleep).put("deep", Math.round(n.deep)).put("light", Math.round(n.light))
                    .put("rem", Math.round(n.rem)).put("wake", Math.round(n.wake)).put("nap", Math.round(n.nap))
            }
            if (asleep > 0) {
                o.put("wakeups", runs(n.wakes))
                n.first?.let { f -> n.last?.let { l ->
                    val tib = Math.round((l - f) / 60000.0)
                    o.put("bed", localHour(f, n.off)).put("up", localHour(l, n.off)).put("tib", tib)
                    if (tib > 0) o.put("eff", Math.round(asleep * 1000.0 / tib) / 10.0)
                } }
            }
            if (n.naps.isNotEmpty()) o.put("napt", napTimes(n.naps, n.off))
            if (n.steps > 0) o.put("steps", n.steps)
            if (o.length() > 1) out.put(o)
        }
        return out
    }

    /** Separate awakenings = contiguous runs of awake stages. */
    private fun runs(iv: List<LongArray>): Int {
        var c = 0; var prev: Long? = null
        for (x in iv.sortedBy { it[0] }) { if (prev == null || x[0] > prev) c++; prev = if (prev == null) x[1] else maxOf(prev, x[1]) }
        return c
    }

    private fun napTimes(segs: List<LongArray>, off: Long): String {
        val runs = ArrayList<LongArray>()
        for (s in segs.sortedBy { it[0] }) {
            val l = runs.lastOrNull()
            if (l != null && s[0] - l[1] <= 20 * 60000L) l[1] = maxOf(l[1], s[1]) else runs += longArrayOf(s[0], s[1])
        }
        fun hm(ms: Long) = Instant.ofEpochMilli(ms + off).toString().substring(11, 16)
        return runs.joinToString(", ") { hm(it[0]) + "–" + hm(it[1]) }
    }

    private fun post(ctx: Context, body: JSONObject): JSONObject {
        val c = (URL(BuildConfig.API_BASE.trimEnd('/') + "/sleep").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; doOutput = true; connectTimeout = 15_000; readTimeout = 30_000
            setRequestProperty("Authorization", "Bearer " + Api.token(ctx))
            setRequestProperty("Content-Type", "application/json")
        }
        try {
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) throw IllegalStateException("Upload failed ($code) ${text.take(80)}")
            return JSONObject(text)
        } finally { c.disconnect() }
    }
}
