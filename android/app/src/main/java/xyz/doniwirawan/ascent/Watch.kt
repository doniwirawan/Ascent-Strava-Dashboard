package xyz.doniwirawan.ascent

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.widget.LinearLayout
import android.widget.TextView
import com.joyodigitama.huaweiwear.AscentWatch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.Locale
import java.util.TimeZone

/**
 * The Huawei watch, straight to Ascent: JoyoFit's watch link (the :huawei-wear module,
 * AGPL-3.0-or-later) talks to the watch over Bluetooth and stores what it sends in joyofit.db;
 * this file is Ascent's card for it on the Sleep tab and the upload of its nights to
 * /api/v1/sleep, folded like the Huawei export import (js/sleep-import.js) and HealthSync.
 *
 * Binding the watch here makes it drop its current phone app (Huawei Health), as JoyoFit does,
 * so the first connect always asks first.
 */
object Watch {

    const val REQ_BT = 2002
    private const val DAY = 86_400L

    private fun prefs(ctx: Context) = Repo.prefs(ctx)

    /** Bluetooth (and, for the background service's notification, notification) permissions still missing. */
    fun missingPermissions(ctx: Context): Array<String> {
        val need = ArrayList<String>()
        if (Build.VERSION.SDK_INT >= 31) { need += Manifest.permission.BLUETOOTH_SCAN; need += Manifest.permission.BLUETOOTH_CONNECT }
        if (Build.VERSION.SDK_INT >= 33) need += Manifest.permission.POST_NOTIFICATIONS
        return need.filter { ctx.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }.toTypedArray()
    }

    // ── the card ────────────────────────────────────────────────────────────

    fun card(a: AppActivity): LinearLayout {
        val c = Ui.card(a)
        c.addView(Ui.text(a, "Watch · direct link", 14f, Ui.TEXT, true))
        val note = Ui.text(a, "", 12f, Ui.MUTED).apply { setPadding(0, Ui.dp(a, 4), 0, 0) }
        c.addView(note)
        val st = try { AscentWatch.status(a) } catch (e: Exception) { null }
        val address = st?.watchAddress

        if (address == null) {
            note.text = "Connect your Huawei watch to Ascent itself, no Huawei Health or Health Sync needed: sleep, steps and resting heart rate come straight from the watch. " +
                "This uses JoyoFit's open-source watch link. Note: the watch can only have one phone app — connecting here unpairs it from Huawei Health."
            val list = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
            c.addView(a.button("Find my watch") { find(a, note, list) })
            c.addView(list)
            return c
        }

        val last = st.lastSyncSec ?: prefs(a).getLong("watch_last_sync", 0).takeIf { it > 0 }
        note.text = (st.watchName ?: "Watch") + " · " + st.state +
            (st.battery?.let { " · battery $it%" } ?: "") +
            (last?.let { " · synced " + java.text.SimpleDateFormat("d MMM HH:mm", Locale.getDefault()).format(java.util.Date(it * 1000)) } ?: "") +
            (st.note?.let { "\n$it" } ?: "") +
            (prefs(a).getString("watch_upload", null)?.let { "\n$it" } ?: "")
        c.addView(a.button("Sync now") {
            note.text = "Syncing… keep the watch near the phone."
            syncNow(a, address) { err -> a.ui.post { note.text = err ?: "Synced."; if (err == null) a.show("sleep") } }
        })
        c.addView(a.button(if (st.background) "Background sync: on — reconnects by itself, every 30 min straight to Ascent" else "Background sync: off") {
            try { AscentWatch.setBackground(a, if (st.background) null else address); a.show("sleep") }
            catch (e: Exception) { note.text = e.message }
        })
        c.addView(a.button("Forget this watch") {
            AlertDialog.Builder(a).setTitle("Forget the watch?")
                .setMessage("Ascent stops syncing it. To use it with Huawei Health again, reset the watch and pair it there.")
                .setPositiveButton("Forget") { _, _ -> AscentWatch.forget(a, address); a.show("sleep") }
                .setNegativeButton("Cancel", null).show()
        })
        return c
    }

    private fun find(a: AppActivity, note: TextView, list: LinearLayout) {
        val missing = missingPermissions(a)
        if (missing.isNotEmpty()) { a.requestPermissions(missing, REQ_BT); note.text = "Allow Nearby devices, then tap Find my watch again."; return }
        note.text = "Looking for watches… put the watch next to the phone."
        try { AscentWatch.startScan(a) } catch (e: Exception) { note.text = e.message; return }
        fun fill() {
            list.removeAllViews()
            AscentWatch.devices(a).forEach { d ->
                list.addView(Ui.divider(a))
                list.addView(Ui.row(a, d.name, "Connect", listOfNotNull(d.model, if (d.support == "tested") "tested" else "experimental", if (d.paired) "paired" else null).joinToString(" · ")).apply {
                    setOnClickListener { confirmBind(a, note, d) }
                })
            }
        }
        fill()
        // devices arrive over ~10 s of scanning
        listOf(2000L, 5000L, 10000L).forEach { a.ui.postDelayed({ fill() }, it) }
        a.ui.postDelayed({ try { AscentWatch.stopScan(a) } catch (e: Exception) {} }, 15000)
    }

    private fun confirmBind(a: AppActivity, note: TextView, d: AscentWatch.Device) {
        AlertDialog.Builder(a).setTitle("Connect ${d.name} to Ascent?")
            .setMessage("The watch keeps one phone app. Connecting here makes it forget Huawei Health (and so Health Sync stops getting data). " +
                "Your data on the watch stays. ${if (d.support == "tested") "" else "This model is experimental in JoyoFit's watch link, so some data may not come through. "}" +
                "You can go back by resetting the watch and pairing it in Huawei Health.")
            .setPositiveButton("Connect") { _, _ ->
                note.text = "Connecting… the watch may ask you to confirm."
                AscentWatch.stopScan(a)
                AscentWatch.connect(a, d.address, firstBind = true) { err ->
                    if (err != null) { a.ui.post { note.text = "Couldn't connect: $err" }; return@connect }
                    try { AscentWatch.setBackground(a, d.address) } catch (e: Exception) {}
                    a.ui.post { note.text = "Connected. Reading the watch's history…" }
                    AscentWatch.sync(a, full = true) { e2 -> upload(a); a.ui.post { note.text = e2 ?: "Done."; a.show("sleep") } }
                }
            }
            .setNegativeButton("Cancel", null).show()
    }

    private fun syncNow(ctx: Context, address: String, done: (String?) -> Unit) {
        val st = AscentWatch.status(ctx)
        val go = { AscentWatch.sync(ctx, full = false) { err -> if (err == null) upload(ctx); done(err) } }
        if (st.state == "connected") go()
        else AscentWatch.connect(ctx, address, firstBind = false) { err -> if (err != null) done("Couldn't reach the watch: $err") else go() }
    }

    // ── upload ──────────────────────────────────────────────────────────────

    /**
     * Folds what the watch stored into nights and posts them. The first upload reaches back 60
     * days, later ones 14 (a night can be re-sent as the watch fills it in). Network + disk.
     */
    fun upload(ctx: Context): String? = try {
        val now = System.currentTimeMillis() / 1000
        val since = now - (if (prefs(ctx).getBoolean("watch_uploaded", false)) 14 else 60) * DAY
        val off = TimeZone.getDefault().getOffset(now * 1000) / 1000L
        val nights = fold(AscentWatch.sleepSince(ctx, since), AscentWatch.stepsSince(ctx, since, off), AscentWatch.restingHrSince(ctx, since, off), off,
            AscentWatch.dailySince(ctx, since, off))
        val msg = if (nights.length() == 0) "The watch hasn't sent any sleep yet." else {
            val r = HealthSync.post(ctx, JSONObject().put("source", "Huawei watch (Ascent)").put("nights", nights))
            "Uploaded ${nights.length()} nights: ${r.optInt("added")} new, ${r.optInt("updated")} updated."
        }
        prefs(ctx).edit().putBoolean("watch_uploaded", nights.length() > 0 || prefs(ctx).getBoolean("watch_uploaded", false))
            .putString("watch_upload", msg).putLong("watch_last_sync", now).apply()
        msg
    } catch (e: Exception) {
        val msg = "Upload failed: ${e.message}"
        prefs(ctx).edit().putString("watch_upload", msg).apply()
        msg
    }

    /** Each background sync with the watch: its nights go straight to Ascent, app open or not. */
    class Synced : android.content.BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: android.content.Intent) {
            if (!Api.hasToken(ctx)) return
            val app = ctx.applicationContext; val done = goAsync()
            Thread { try { upload(app); AscentWidget.drawAll(app) } catch (e: Exception) {} finally { done.finish() } }.start()
        }
    }

    /** Widget refreshes: upload at most every 3 hours while a watch is connected to Ascent. */
    fun uploadIfDue(ctx: Context) {
        try {
            if (!Api.hasToken(ctx) || AscentWatch.status(ctx).watchAddress == null) return
            if (System.currentTimeMillis() / 1000 - prefs(ctx).getLong("watch_last_sync", 0) < 3 * 3600) return
            upload(ctx)
        } catch (e: Exception) {}
    }

    /**
     * Nights from the watch's sleep pieces, in /api/v1/sleep's columns. Same rules as the export
     * import: a night is dated by the morning you woke (start + 6 h, local), counted minute by
     * minute so overlaps count once, bed / up in local hours (bed negative before midnight).
     * A piece with no stage (TruSleep window) counts as light sleep, as Gadgetbridge reads it,
     * but any real stage for the same minute wins over it: staged sleep > awake > no stage.
     */
    internal fun fold(sleep: List<AscentWatch.Sleep>, steps: Map<String, Long>, rhr: Map<String, Int>, offSec: Long,
                      daily: Map<String, Map<String, Double>> = emptyMap()): JSONArray {
        class Night { val mins = HashMap<Long, Int>(); val nap = HashSet<Long>() }
        val nights = sortedMapOf<String, Night>()
        fun day(sec: Long) = Instant.ofEpochSecond(sec + offSec).toString().substring(0, 10)
        for (s in sleep) {
            if (s.end <= s.start) continue
            if (s.nap) { val n = nights.getOrPut(day(s.start)) { Night() }; for (m in s.start / 60 until (s.end + 59) / 60) n.nap += m; continue }
            val n = nights.getOrPut(day(s.start + 6 * 3600)) { Night() }
            val stage = when (s.stage) { "deep" -> 1; "light" -> 2; "rem" -> 3; "awake" -> 4; else -> UNSTAGED }
            for (m in s.start / 60 until (s.end + 59) / 60) { val cur = n.mins[m]; if (cur == null || rank(stage) > rank(cur)) n.mins[m] = stage }
        }
        val days = (nights.keys + steps.keys + rhr.keys + daily.keys).toSortedSet()
        val out = JSONArray()
        for (d in days) {
            val n = nights[d]
            val o = JSONObject().put("date", d)
            if (n != null) {
                fun count(st: Int) = n.mins.values.count { it == st }
                val light = count(2) + count(UNSTAGED)
                val asleep = count(1) + light + count(3)
                if (asleep > 0 || n.nap.isNotEmpty()) o.put("asleep", asleep).put("deep", count(1)).put("light", light).put("rem", count(3)).put("wake", count(4)).put("nap", n.nap.size)
                if (asleep > 0) {
                    val first = n.mins.keys.min() * 60; val last = (n.mins.keys.max() + 1) * 60
                    val tib = (last - first) / 60
                    var wakeups = 0; var prevAwake = false
                    n.mins.keys.sorted().forEach { m -> val aw = n.mins[m] == 4; if (aw && !prevAwake) wakeups++; prevAwake = aw }
                    o.put("wakeups", wakeups).put("bed", hour(first, offSec)).put("up", hour(last, offSec)).put("tib", tib)
                    if (tib > 0) o.put("eff", Math.round(asleep * 1000.0 / tib) / 10.0)
                }
            }
            steps[d]?.takeIf { it > 0 }?.let { o.put("steps", it) }
            rhr[d]?.let { o.put("rhr", it) }
            // calories, walking distance, heart rate, blood oxygen, HRV (AscentWatch.dailySince)
            daily[d]?.forEach { (k, v) -> o.put(k, if (v % 1 == 0.0) v.toLong() else v) }
            if (o.length() > 1) out.put(o)
        }
        return out
    }

    private const val UNSTAGED = 5
    private fun rank(stage: Int) = when (stage) { UNSTAGED -> 0; 4 -> 1; else -> 2 }

    private fun hour(sec: Long, off: Long): Double {
        var h = ((sec + off) / 3600.0) % 24
        if (h < 0) h += 24
        if (h >= 12) h -= 24
        return Math.round(h * 100) / 100.0
    }
}
