package xyz.doniwirawan.ascent

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * The dashboard's personal API (/api/v1, api/_v1.js) — your own data from the
 * site's database, read with an `asc_…` token made in Settings → Personal API.
 *
 * Every response is also written to the app's files, so each screen draws its
 * last copy instantly (and offline) before the network answers.
 */
object Api {

    fun token(ctx: Context): String = Repo.prefs(ctx).getString("api_token", "") ?: ""

    fun hasToken(ctx: Context) = token(ctx).startsWith("asc_")

    fun setToken(ctx: Context, token: String) {
        Repo.prefs(ctx).edit().putString("api_token", token.trim()).apply()
        File(ctx.filesDir, "api").deleteRecursively()       // another token may be another account
    }

    /** Last saved response for `path`, or null. */
    fun cached(ctx: Context, path: String): JSONObject? = try {
        cacheFile(ctx, path).takeIf { it.exists() }?.readText()?.let { JSONObject(it) }
    } catch (e: Exception) {
        null
    }

    /** GET /api/v1/<path>. Throws with a message meant for the screen. */
    fun get(ctx: Context, path: String): JSONObject {
        val token = token(ctx)
        if (!token.startsWith("asc_")) throw IllegalStateException("Add your Personal API token first.")
        val c = (URL(BuildConfig.API_BASE.trimEnd('/') + if (path.isEmpty()) "" else "/$path").openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 30_000
            setRequestProperty("Authorization", "Bearer $token")
        }
        try {
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (code == 401) throw IllegalStateException("Token not accepted — make a new one in the dashboard: Settings → Personal API.")
            if (code !in 200..299) {
                val err = try { JSONObject(text).optString("error") } catch (e: Exception) { "" }
                throw IllegalStateException("Server error $code${if (err.isNotEmpty()) " ($err)" else ""}")
            }
            cacheFile(ctx, path).apply { parentFile?.mkdirs() }.writeText(text)
            return JSONObject(text)
        } finally {
            c.disconnect()
        }
    }

    private fun cacheFile(ctx: Context, path: String) =
        File(File(ctx.filesDir, "api"), path.replace(Regex("[^A-Za-z0-9]+"), "_").take(120) + ".json")
}
