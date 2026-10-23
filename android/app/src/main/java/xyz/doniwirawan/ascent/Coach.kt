package xyz.doniwirawan.ascent

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * The AI Coach on the phone, with your own key (kept in this app's settings,
 * sent only to the provider you pick). Same providers, default models and coach
 * instructions as the website (api/ai.js, js/ai-coach.js). The coach sees
 * stats, recent activities, power and sleep from the saved API responses —
 * never GPS, start points or routes: only the destination name of a ride.
 */
object Coach {

    class Provider(val id: String, val name: String, val url: String, val model: String, val anthropic: Boolean = false)

    val PROVIDERS = listOf(
        Provider("deepseek", "DeepSeek", "https://api.deepseek.com/chat/completions", "deepseek-chat"),
        Provider("openrouter", "OpenRouter", "https://openrouter.ai/api/v1/chat/completions", "deepseek/deepseek-chat"),
        Provider("openai", "OpenAI", "https://api.openai.com/v1/chat/completions", "gpt-4o-mini"),
        Provider("anthropic", "Anthropic", "https://api.anthropic.com/v1/messages", "claude-haiku-4-5", anthropic = true),
        Provider("groq", "Groq", "https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile"),
        Provider("mistral", "Mistral", "https://api.mistral.ai/v1/chat/completions", "mistral-small-latest"),
    )

    private const val SYS =
        "You are a concise, encouraging endurance-sports coach analysing ONE athlete's training data. " +
        "Use only the numbers in the provided JSON — never invent data. Reply in short plain text " +
        "(a few short paragraphs or bullets with '•'). Stay under ~250 words unless asked for more. " +
        "Distances are km, elevation m, speed km/h, power W. avg_kmh is average speed, max_kmh is top speed — never confuse them. " +
        "Power numbers are real only when power_meter is true; otherwise never build advice on watts. " +
        "Sleep nights are dated by the morning the athlete woke up. Never mention or guess where the athlete lives or starts rides."

    fun provider(ctx: Context) = PROVIDERS.firstOrNull { it.id == Repo.prefs(ctx).getString("ai_provider", "deepseek") } ?: PROVIDERS[0]
    fun key(ctx: Context) = Repo.prefs(ctx).getString("ai_key", "") ?: ""
    fun model(ctx: Context) = Repo.prefs(ctx).getString("ai_model", "")?.takeIf { it.isNotBlank() } ?: provider(ctx).model

    fun save(ctx: Context, provider: String, key: String, model: String) {
        Repo.prefs(ctx).edit().putString("ai_provider", provider).putString("ai_key", key.trim()).putString("ai_model", model.trim()).apply()
    }

    // ── conversation kept on the phone ──────────────────────────────────────
    fun history(ctx: Context): JSONArray = try { JSONArray(Repo.prefs(ctx).getString("ai_app_chat", "[]")) } catch (e: Exception) { JSONArray() }
    fun clear(ctx: Context) = Repo.prefs(ctx).edit().remove("ai_app_chat").apply()
    private fun store(ctx: Context, a: JSONArray) = Repo.prefs(ctx).edit().putString("ai_app_chat", a.toString()).apply()

    /** Sends `question` with the conversation so far; returns the reply. Network call. */
    fun ask(ctx: Context, question: String): String {
        val hist = history(ctx)
        val system = SYS + "\n\nAthlete data (JSON):\n" + context(ctx).toString()
        val msgs = JSONArray()
        for (i in maxOf(0, hist.length() - 12) until hist.length()) msgs.put(hist.getJSONObject(i))      // last 6 exchanges
        msgs.put(JSONObject().put("role", "user").put("content", question))

        val reply = call(ctx, system, msgs, 800)
        hist.put(JSONObject().put("role", "user").put("content", question))
        hist.put(JSONObject().put("role", "assistant").put("content", reply))
        store(ctx, hist)
        return reply
    }

    /** One question with its own instructions, no chat history (route planning, insights). Network call. */
    fun once(ctx: Context, system: String, user: String, maxTokens: Int = 600): String =
        call(ctx, system, JSONArray().put(JSONObject().put("role", "user").put("content", user)), maxTokens)

    private fun call(ctx: Context, system: String, msgs: JSONArray, maxTokens: Int): String {
        val key = key(ctx)
        if (key.isBlank()) throw IllegalStateException("Add your AI key first (AI → Settings).")
        val p = provider(ctx)
        val body = if (p.anthropic) JSONObject().put("model", model(ctx)).put("max_tokens", maxTokens).put("system", system).put("messages", msgs)
        else JSONObject().put("model", model(ctx)).put("max_tokens", maxTokens)
            .put("messages", JSONArray().put(JSONObject().put("role", "system").put("content", system)).apply { for (i in 0 until msgs.length()) put(msgs.get(i)) })
        val c = (URL(p.url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; doOutput = true; connectTimeout = 15_000; readTimeout = 90_000
            setRequestProperty("Content-Type", "application/json")
            if (p.anthropic) { setRequestProperty("x-api-key", key); setRequestProperty("anthropic-version", "2023-06-01") }
            else setRequestProperty("Authorization", "Bearer $key")
        }
        val reply = try {
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (code == 401 || code == 403) throw IllegalStateException("${p.name} refused the key ($code). Check it in AI settings.")
            if (code !in 200..299) throw IllegalStateException("${p.name} error $code: " + (try { JSONObject(text).optJSONObject("error")?.optString("message") } catch (e: Exception) { null } ?: text.take(120)))
            val j = JSONObject(text)
            if (p.anthropic) j.optJSONArray("content")?.optJSONObject(0)?.optString("text").orEmpty()
            else j.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")?.optString("content").orEmpty()
        } finally { c.disconnect() }
        if (reply.isBlank()) throw IllegalStateException("${p.name} sent an empty reply.")
        return reply
    }

    /** What the coach sees — built from saved API responses, no location data. */
    private fun context(ctx: Context): JSONObject {
        val o = JSONObject()
        Api.cached(ctx, "stats")?.let { s ->
            listOf("last_7_days", "last_30_days", "ytd", "totals", "bests", "fitness", "streak").forEach { k ->
                s.opt(k)?.let { v -> o.put(k, if (k == "fitness" && v is JSONObject) JSONObject(v.toString()).apply { remove("last_90_days") } else v) }
            }
            s.optJSONArray("by_month")?.let { m -> o.put("by_month_last_12", JSONArray().apply { for (i in maxOf(0, m.length() - 12) until m.length()) put(m.get(i)) }) }
        }
        val acts = Api.cached(ctx, "activities?limit=300")?.optJSONArray("activities")
        if (acts != null) {
            val recent = JSONArray()
            for (i in 0 until minOf(25, acts.length())) {
                val a = acts.getJSONObject(i)
                val rp = a.optJSONObject("route_places")
                recent.put(JSONObject()
                    .put("date", a.optString("start_date_local").take(10)).put("type", a.optString("sport_type").ifEmpty { a.optString("type") })
                    .put("name", a.optString("name")).put("km", Math.round(a.optDouble("distance") / 100) / 10.0)
                    .put("moving_min", a.optLong("moving_time") / 60).put("elev_m", Math.round(a.optDouble("total_elevation_gain")))
                    .put("avg_kmh", Math.round(a.optDouble("average_speed") * 36) / 10.0)
                    .put("max_kmh", Math.round(minOf(a.optDouble("max_speed"), 65 / 3.6) * 36) / 10.0)
                    .putOpt("avg_hr", a.optDouble("average_heartrate").takeIf { !it.isNaN() && it > 0 }?.let { Math.round(it) })
                    .putOpt("avg_watts", a.optDouble("average_watts").takeIf { !it.isNaN() && it > 0 }?.let { Math.round(it) })
                    .putOpt("np_watts", a.optDouble("weighted_average_watts").takeIf { !it.isNaN() && it > 0 && a.optBoolean("device_watts") }?.let { Math.round(it) })
                    .put("power_meter", a.optBoolean("device_watts"))
                    .putOpt("destination", rp?.let { listOf("furthest_landmark", "furthest_place").map { k -> it.optString(k) }.firstOrNull { s -> s.isNotEmpty() && s != "null" } })
                    .putOpt("relative_effort", a.optDouble("suffer_score").takeIf { !it.isNaN() && it > 0 }?.let { Math.round(it) }))
            }
            o.put("recent_activities", recent)
        }
        val ftp = Zones.ftp(ctx)
        if (ftp > 0) o.put("ftp_watts", Math.round(ftp))
        Api.cached(ctx, "me")?.optDouble("weight", 0.0)?.takeIf { it > 0 }?.let { o.put("weight_kg", it) }
        Api.cached(ctx, "sleep")?.let { s ->
            val cols = s.optJSONArray("cols"); val rows = s.optJSONArray("rows")
            if (cols != null && rows != null) {
                val keep = listOf("date", "asleep", "deep", "light", "rem", "wake", "bed", "up", "eff", "rhr", "hrv")
                val idx = keep.associateWith { k -> (0 until cols.length()).firstOrNull { cols.getString(it) == k } }
                val out = JSONArray()
                for (i in maxOf(0, rows.length() - 14) until rows.length()) {
                    val r = rows.getJSONArray(i)
                    out.put(JSONObject().apply { idx.forEach { (k, j) -> if (j != null && !r.isNull(j)) put(k, r.get(j)) } })
                }
                o.put("sleep_last_14_nights_minutes", out)
                // the website's sleep analysis for the coach: sleep around rides, load, bedtime, patterns
                val rides = (Api.cached(ctx, "activities?limit=500") ?: Api.cached(ctx, "activities?limit=300"))?.optJSONArray("activities")
                runCatching { SleepData.summary(SleepInsights.nights(s), (0 until (rides?.length() ?: 0)).map { rides!!.getJSONObject(it) }) }.getOrNull()?.let { o.put("sleep_summary", it) }
            }
        }
        return o
    }
}
