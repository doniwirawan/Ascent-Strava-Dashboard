package xyz.doniwirawan.ascent

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Self-update without a store: /api/v1/app names the newest build in the
 * private bucket and hands out a short-lived link to it (only with your API
 * token). The APK is downloaded to the cache and installed through a
 * PackageInstaller session — the same signing key lets it replace this app.
 *
 * Updates happen on their own: the app checks when it opens (and the widgets
 * every few hours), downloads a newer build in the background and installs it.
 * On Android 12+ an app updating itself needs no confirm dialog (checked on
 * the API 35 emulator); Play Protect may still offer to scan a new build.
 */
object Updater {

    class Release(val code: Int, val name: String, val notes: String, val url: String)

    /** The newer release, or null when this build is current. Network call. */
    fun check(ctx: Context): Release? {
        val r: JSONObject = Api.get(ctx, "app")
        Repo.prefs(ctx).edit().putLong("update_checked", System.currentTimeMillis()).apply()
        val code = r.optInt("versionCode")
        if (code <= BuildConfig.VERSION_CODE) return null
        Repo.prefs(ctx).edit().putString("update_notes_$code", r.optString("notes")).apply()
        return Release(code, r.optString("versionName"), r.optString("notes"), r.optString("url"))
    }

    /** True when the last check is older than `ms`. */
    fun due(ctx: Context, ms: Long) = System.currentTimeMillis() - Repo.prefs(ctx).getLong("update_checked", 0) > ms

    private fun dir(ctx: Context) = File(ctx.cacheDir, "update").apply { mkdirs() }
    private fun apkFor(ctx: Context, code: Int) = File(dir(ctx), "Ascent-$code.apk")

    /** An already downloaded, complete APK for `rel`, or null. */
    fun downloaded(ctx: Context, rel: Release): File? = apkFor(ctx, rel.code).takeIf { versionOf(ctx, it) == rel.code }

    /** versionCode inside an APK file, or -1 when it isn't a whole APK of this app. */
    private fun versionOf(ctx: Context, apk: File): Int {
        if (!apk.exists()) return -1
        val info = ctx.packageManager.getPackageArchiveInfo(apk.path, 0) ?: return -1
        if (info.packageName != ctx.packageName) return -1
        @Suppress("DEPRECATION")
        return if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toInt() else info.versionCode
    }

    /** Downloads the APK (or reuses a finished download), reporting whole percents. Network call. */
    fun download(ctx: Context, rel: Release, progress: (Int) -> Unit): File {
        downloaded(ctx, rel)?.let { return it }
        // older builds in the cache are of no use any more
        dir(ctx).listFiles()?.forEach { it.delete() }
        val part = File(dir(ctx), "Ascent-${rel.code}.part")
        val c = (URL(rel.url).openConnection() as HttpURLConnection).apply { connectTimeout = 15_000; readTimeout = 60_000 }
        try {
            if (c.responseCode !in 200..299) throw IllegalStateException("Download failed (${c.responseCode})")
            val total = c.contentLengthLong
            c.inputStream.use { input ->
                part.outputStream().use { o ->
                    val buf = ByteArray(64 * 1024)
                    var done = 0L
                    var last = -1
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        o.write(buf, 0, n)
                        done += n
                        val pct = if (total > 0) (done * 100 / total).toInt() else -1
                        if (pct != last) { last = pct; progress(pct) }
                    }
                }
            }
        } finally {
            c.disconnect()
        }
        val out = apkFor(ctx, rel.code)
        if (!part.renameTo(out) || versionOf(ctx, out) != rel.code) {
            out.delete(); part.delete()
            throw IllegalStateException("The download isn't a complete Ascent ${rel.name}")
        }
        return out
    }

    /** True when Android lets Ascent update itself without a confirm dialog (Android 12+). */
    fun canUpdateSilently(ctx: Context) = Build.VERSION.SDK_INT >= 31 && ctx.packageManager.canRequestPackageInstalls()

    /**
     * Hands the file to Android through a PackageInstaller session. The answer
     * arrives in [Result]: installed (the app restarts), or a confirm dialog that
     * it opens when `act` is showing. The first time, Android needs "Install
     * unknown apps" allowed for Ascent — we open that switch instead and return
     * false, so the caller can ask to tap Update again.
     */
    fun install(act: Activity, apk: File): Boolean {
        if (!act.packageManager.canRequestPackageInstalls()) {
            act.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${act.packageName}")))
            return false
        }
        commit(act, apk)
        return true
    }

    /** Background path (widget refresh): installs only when no dialog is needed. */
    fun installSilently(ctx: Context, apk: File): Boolean {
        if (!canUpdateSilently(ctx)) return false
        commit(ctx, apk)
        return true
    }

    private fun commit(ctx: Context, apk: File) {
        val pi = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(ctx.packageName)
            setSize(apk.length())
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = pi.createSession(params)
        pi.openSession(id).use { s ->
            s.openWrite("ascent.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                s.fsync(out)
            }
            // the system fills in the status, so the PendingIntent has to be mutable
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val done = PendingIntent.getBroadcast(ctx, id, Intent(ctx, Result::class.java), flags)
            s.commit(done.intentSender)
        }
        Repo.prefs(ctx).edit().remove("update_error").apply()
    }

    /** The last install that failed, for the banner. */
    fun lastError(ctx: Context): String? = Repo.prefs(ctx).getString("update_error", null)

    /**
     * Wakes up the first time a new build runs: returns "Updated to X" with its
     * notes once, then null.
     */
    fun justUpdated(ctx: Context): String? {
        val p = Repo.prefs(ctx)
        val seen = p.getInt("seen_version", 0)
        if (seen == BuildConfig.VERSION_CODE) return null
        p.edit().putInt("seen_version", BuildConfig.VERSION_CODE).remove("update_error").apply()
        dir(ctx).listFiles()?.forEach { it.delete() }
        if (seen == 0) return null                           // first run, not an update
        val notes = p.getString("update_notes_${BuildConfig.VERSION_CODE}", "").orEmpty()
        return "Updated to ${BuildConfig.VERSION_NAME}" + if (notes.isNotEmpty()) " — $notes" else ""
    }

    /** Called by widget refreshes: check every 6 h, fetch a newer build, install it if Android allows. */
    fun background(ctx: Context) {
        if (!Api.hasToken(ctx) || !due(ctx, 6 * 3_600_000L)) return
        try {
            val rel = check(ctx) ?: return
            val apk = download(ctx, rel) {}
            installSilently(ctx, apk)
        } catch (e: Exception) {
            // the app tries again when it opens
        }
    }

    /** PackageInstaller's answer for a committed session. */
    class Result : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    @Suppress("DEPRECATION")
                    val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                    try { ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    catch (e: Exception) { Repo.prefs(ctx).edit().putString("update_error", "Tap to install").apply() }
                }
                PackageInstaller.STATUS_SUCCESS -> {}       // the new build takes over
                else -> {
                    val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                    // the user pressed Cancel: not an error worth shouting about
                    Repo.prefs(ctx).edit().putString("update_error",
                        if (status == PackageInstaller.STATUS_FAILURE_ABORTED) "Install cancelled — tap to try again" else "Install failed${msg?.let { ": $it" } ?: ""}").apply()
                }
            }
        }
    }
}
