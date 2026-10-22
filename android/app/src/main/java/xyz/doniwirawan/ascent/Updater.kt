package xyz.doniwirawan.ascent

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Self-update without a store: /api/v1/app names the newest build in the
 * private bucket and hands out a short-lived link to it (only with your API
 * token). The APK is downloaded to the cache and given to Android's installer,
 * which asks you to confirm — the same signing key lets it replace this app.
 */
object Updater {

    class Release(val code: Int, val name: String, val notes: String, val url: String)

    /** The newer release, or null when this build is current. Network call. */
    fun check(ctx: Context): Release? {
        val r: JSONObject = Api.get(ctx, "app")
        val code = r.optInt("versionCode")
        if (code <= BuildConfig.VERSION_CODE) return null
        return Release(code, r.optString("versionName"), r.optString("notes"), r.optString("url"))
    }

    /** Downloads the APK, reporting whole percents. Network call. */
    fun download(ctx: Context, rel: Release, progress: (Int) -> Unit): File {
        val out = File(File(ctx.cacheDir, "update").apply { mkdirs() }, "Ascent.apk")
        val c = (URL(rel.url).openConnection() as HttpURLConnection).apply { connectTimeout = 15_000; readTimeout = 60_000 }
        try {
            if (c.responseCode !in 200..299) throw IllegalStateException("Download failed (${c.responseCode})")
            val total = c.contentLengthLong
            c.inputStream.use { input ->
                out.outputStream().use { o ->
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
        return out
    }

    /**
     * Opens Android's installer for the file. The first time, Android needs
     * "Install unknown apps" allowed for Ascent — we open that switch instead
     * and return false, so the caller can ask to tap Update again.
     */
    fun install(act: Activity, apk: File): Boolean {
        if (!act.packageManager.canRequestPackageInstalls()) {
            act.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${act.packageName}")))
            return false
        }
        val uri = FileProvider.getUriForFile(act, "${act.packageName}.files", apk)
        act.startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        return true
    }
}
