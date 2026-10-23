package com.joyodigitama.huaweiwear

import android.content.Context
import kotlinx.coroutines.launch

/**
 * Ascent's way into JoyoFit's watch link. JoyoFit's own entry point was an Expo module for its JS
 * (HuaweiWearModule, left out); this is the same calls for Ascent's native screens, kept public
 * because everything in JoyoFit is `internal` to this module. Callbacks run on a background thread.
 */
object AscentWatch {

    class Device(val address: String, val name: String, val model: String?, val support: String, val paired: Boolean, val remembered: Boolean)

    /** One stored sleep piece: unix seconds, stage "deep" / "light" / "rem" / "awake" or null (TruSleep window, no stage). */
    class Sleep(val start: Long, val end: Long, val stage: String?, val nap: Boolean)

    class Status(val state: String, val battery: Int?, val watchName: String?, val watchAddress: String?, val lastSyncSec: Long?, val note: String?, val background: Boolean)

    private fun rt(ctx: Context) = WearRuntime.get(ctx)

    fun status(ctx: Context): Status {
        val r = rt(ctx)
        val s = r.status.value
        return Status(r.link.currentState(), s.battery, r.settings.watchName, r.settings.watchAddress, s.lastSyncSec, s.note, r.settings.backgroundEnabled)
    }

    /** Called on every link state change ("disconnected" … "connected", "syncing") and after each sync. */
    fun listen(ctx: Context, onChange: (state: String, error: String?) -> Unit): AutoCloseable {
        val l = object : WearEvents {
            override fun state(state: LinkState, error: String?) = onChange(state.wire, error)
            override fun battery(level: Int) {}
            override fun syncComplete(summary: SyncSummary) = onChange("synced", null)
            override fun log(direction: LogDirection, serviceId: Int?, commandId: Int?, hex: String?, message: String) {}
            override fun uploadProgress(bytes: Int, total: Int) {}
            override fun uploadResult(ok: Boolean, fileName: String, code: Int?, message: String) {}
            override fun heartRate(bpm: Int, tsMs: Long) {}
            override fun watchMealLogged(payload: Map<String, Any?>) {}
            override fun faceCustomization(payload: Map<String, Any?>) {}
            override fun liveWorkout(payload: Map<String, Any?>) {}
            override fun hrvProgress(secondsLeft: Int, beats: Int) {}
            override fun deviceDiscovered(device: DiscoveredDevice) = onChange("found", null)
            override fun scanState(scanning: Boolean, error: String?) = onChange(if (scanning) "scanning" else "scan-done", error)
        }
        rt(ctx).addListener(l)
        return AutoCloseable { rt(ctx).removeListener(l) }
    }

    private fun device(m: Map<String, Any?>) = Device(
        m["address"] as? String ?: "", m["name"] as? String ?: "Watch", m["model"] as? String,
        m["support"] as? String ?: "unknown", m["paired"] as? Boolean ?: false, m["remembered"] as? Boolean ?: false,
    )

    /** Watches Android already paired, then what a scan found. */
    fun devices(ctx: Context): List<Device> {
        val link = rt(ctx).link
        val all = (link.bondedDevices() + link.getDiscoveredDevices()).map(::device)
        return all.distinctBy { it.address }.filter { it.address.isNotEmpty() }
    }

    fun startScan(ctx: Context) = rt(ctx).link.startScan()
    fun stopScan(ctx: Context) = rt(ctx).link.stopScan()

    /**
     * Connects. `firstBind` is the person's consent to bind a watch for the first time, which makes
     * the watch drop its current phone (Huawei Health) — only pass it after asking.
     */
    fun connect(ctx: Context, address: String, firstBind: Boolean, done: (String?) -> Unit) {
        val r = rt(ctx)
        if (firstBind) r.confirmBind(address)
        r.confirmPairing(address)
        r.scope.launch {
            val err = try { r.connectFromApp(address); null } catch (e: Exception) { e.message ?: e.javaClass.simpleName }
            done(err)
        }
    }

    fun disconnect(ctx: Context) = rt(ctx).disconnectFromApp()

    /** Pulls what the watch has stored since the last sync (`full`: everything it still holds). */
    fun sync(ctx: Context, full: Boolean, done: (String?) -> Unit) {
        val r = rt(ctx)
        r.scope.launch {
            val err = try { r.link.syncActivity(fullHistory = full); null } catch (e: Exception) { e.message ?: e.javaClass.simpleName }
            done(err)
        }
    }

    /** Background mode: a foreground service keeps the watch connected and syncs every 30 minutes. */
    fun setBackground(ctx: Context, address: String?) = rt(ctx).setBackground(address)

    fun forget(ctx: Context, address: String) = rt(ctx).forget(address)

    /** Sleep the watch sent whose end is at or after `sinceSec`, cleaned as JoyoFit cleans it (SleepStore). */
    fun sleepSince(ctx: Context, sinceSec: Long): List<Sleep> = rt(ctx).syncStore.read { db ->
        SleepStore.load(db, sinceSec).map { Sleep(it.start, it.end, it.stage, it.type == NAP_TYPE) }
    }

    /** Steps per local day (yyyy-MM-dd) since `sinceSec`, for the given UTC offset. */
    fun stepsSince(ctx: Context, sinceSec: Long, offsetSec: Long): Map<String, Long> = rt(ctx).syncStore.read { db ->
        db.rawQuery(
            "SELECT date(timestamp + ?, 'unixepoch') d, SUM(steps) FROM step_samples WHERE timestamp >= ? GROUP BY d",
            arrayOf(offsetSec.toString(), sinceSec.toString()),
        ).use { c -> val out = HashMap<String, Long>(); while (c.moveToNext()) out[c.getString(0)] = c.getLong(1); out }
    }

    /** The watch's resting heart rate per local day since `sinceSec` (lowest reading of the day). */
    fun restingHrSince(ctx: Context, sinceSec: Long, offsetSec: Long): Map<String, Int> = rt(ctx).syncStore.read { db ->
        db.rawQuery(
            "SELECT date(timestamp + ?, 'unixepoch') d, MIN(resting_heart_rate) FROM step_samples WHERE timestamp >= ? AND resting_heart_rate > 0 GROUP BY d",
            arrayOf(offsetSec.toString(), sinceSec.toString()),
        ).use { c -> val out = HashMap<String, Int>(); while (c.moveToNext()) out[c.getString(0)] = c.getInt(1); out }
    }

    /**
     * Everything else the watch logged, per local day since `sinceSec`, in the website's sleep columns:
     * cal (kcal; samples are 1/1000 kcal), dist (m), hrmin / hrmax, spo2 (mean) / spo2min, hrv (the
     * night's RMSSD, dated by the morning it ended) and hrvmin / hrvmax over every HRV reading that day.
     */
    fun dailySince(ctx: Context, sinceSec: Long, offsetSec: Long): Map<String, Map<String, Double>> = rt(ctx).syncStore.read { db ->
        val out = HashMap<String, HashMap<String, Double>>()
        fun put(d: String, k: String, v: Double) { out.getOrPut(d) { HashMap() }[k] = v }
        val args = arrayOf(offsetSec.toString(), sinceSec.toString())
        db.rawQuery(
            "SELECT date(timestamp + ?, 'unixepoch') d, SUM(calories), SUM(distance), MIN(NULLIF(heart_rate, 0)), MAX(heart_rate)," +
                " AVG(NULLIF(spo2, 0)), MIN(NULLIF(spo2, 0)) FROM step_samples WHERE timestamp >= ? GROUP BY d", args,
        ).use { c ->
            while (c.moveToNext()) {
                val d = c.getString(0)
                if (c.getLong(1) > 0) put(d, "cal", Math.round(c.getLong(1) / 1000.0).toDouble())
                if (c.getLong(2) > 0) put(d, "dist", c.getLong(2).toDouble())
                if (!c.isNull(3)) put(d, "hrmin", c.getDouble(3)); if (!c.isNull(4) && c.getInt(4) > 0) put(d, "hrmax", c.getDouble(4))
                if (!c.isNull(5)) put(d, "spo2", Math.round(c.getDouble(5) * 10) / 10.0); if (!c.isNull(6)) put(d, "spo2min", c.getDouble(6))
            }
        }
        db.rawQuery(
            "SELECT date(\"end\" + ?, 'unixepoch') d, source, rmssd FROM hrv_readings WHERE \"end\" >= ? AND rmssd > 0 ORDER BY \"end\"", args,
        ).use { c ->
            while (c.moveToNext()) {
                val d = c.getString(0); val v = c.getDouble(2)
                if (c.getString(1) == "night") put(d, "hrv", Math.round(v).toDouble())
                val m = out.getOrPut(d) { HashMap() }
                m["hrvmin"] = minOf(m["hrvmin"] ?: v, v); m["hrvmax"] = maxOf(m["hrvmax"] ?: v, v)
            }
        }
        out
    }

    /** `sleep_segments.type` of a daytime nap: the raw kind RAW_TRUSLEEP_NAP (private in SleepSync). */
    private const val NAP_TYPE = 0x5659
}
