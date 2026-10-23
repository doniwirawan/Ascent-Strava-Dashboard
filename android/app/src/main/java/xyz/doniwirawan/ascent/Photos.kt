package xyz.doniwirawan.ascent

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.widget.ImageView
import android.widget.LinearLayout
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.util.concurrent.Executors

/**
 * More → Photos: the website's Photos section. One tile per activity with
 * photos; each activity's photo list (/activities/{id}?photos=1) and the images
 * are fetched a couple at a time and kept on the phone. Tap a tile for all of
 * an activity's photos.
 */
object Photos {
    private val pool = Executors.newFixedThreadPool(2)
    private val inFlight = HashSet<String>()
    private var open: Long = 0
    private var shown = 12        // tiles drawn; each new one costs a Strava request once, like the website's lazy tiles

    private fun dir(ctx: Context) = File(ctx.filesDir, "photos").apply { mkdirs() }

    /** A photo downscaled to about [px] wide, from the phone's copy or the web. */
    internal fun bitmap(ctx: Context, url: String, px: Int): Bitmap? {
        val f = File(dir(ctx), url.hashCode().toUInt().toString() + ".jpg")
        if (!f.exists()) f.writeBytes(URL(url).readBytes())
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(f.path, o)
        var s = 1; while (o.outWidth / (s * 2) >= px) s *= 2
        return BitmapFactory.decodeFile(f.path, BitmapFactory.Options().apply { inSampleSize = s })
    }

    /** Fills [iv] with photo [i] of activity [id] in the background (list first, then image). */
    private fun fill(a: AppActivity, iv: ImageView, id: Long, i: Int, px: Int) {
        val key = "$id/$i/$px"
        if (!inFlight.add(key)) return
        pool.execute {
            val path = "activities/$id?photos=1"
            val bmp = runCatching {
                val r = Api.cached(a, path) ?: Api.get(a, path)
                r.optJSONArray("photos")?.optJSONObject(i)?.optString("url")?.let { bitmap(a, it, px) }
            }.getOrNull()
            inFlight.remove(key)
            a.ui.post { if (bmp != null && iv.tag == key) iv.setImageBitmap(bmp) }
        }
    }

    fun page(a: AppActivity): Unit = a.load(listOf("activities?limit=500")) { r ->
        val acts = Screens.list(r["activities?limit=500"]?.optJSONArray("activities")).filter { it.optInt("total_photo_count") > 0 }.sortedByDescending { it.optString("start_date") }
        val col = a.page()
        More.back(a, col, "Photos")
        if (acts.isEmpty()) { col.addView(Ui.text(a, "No photos found in your activities.", 13f, Ui.MUTED)); return@load }
        val w = a.resources.displayMetrics.widthPixels

        acts.firstOrNull { it.optLong("id") == open }?.let { x ->
            col.addView(Ui.heading(a, x.optString("name") + " · ${x.optInt("total_photo_count")}"))
            col.addView(Ui.card(a).apply {
                val photos = Api.cached(a, "activities/${x.optLong("id")}?photos=1")?.optJSONArray("photos")
                (0 until (photos?.length() ?: 1)).forEach { i ->
                    addView(ImageView(a).apply {
                        adjustViewBounds = true; scaleType = ImageView.ScaleType.FIT_CENTER
                        tag = "${x.optLong("id")}/$i/$w"; fill(a, this, x.optLong("id"), i, w)
                    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = Ui.dp(a, 8) })
                    photos?.optJSONObject(i)?.optString("caption")?.takeIf { it.isNotEmpty() }?.let { addView(Ui.text(a, it, 12f, Ui.MUTED)) }
                }
                addView(a.button("Open the ride") { a.openRide(x) })
            })
        }

        col.addView(Ui.text(a, "${acts.size} activities with photos. Tap one for all its photos.", 11f, Ui.MUTED))
        val tile = (w - Ui.dp(a, 40)) / 2
        acts.take(shown).chunked(2).forEach { pair ->
            col.addView(LinearLayout(a).apply {
                orientation = LinearLayout.HORIZONTAL
                pair.forEach { x ->
                    addView(LinearLayout(a).apply {
                        orientation = LinearLayout.VERTICAL
                        addView(ImageView(a).apply {
                            scaleType = ImageView.ScaleType.CENTER_CROP; setBackgroundColor(Ui.CARD)
                            tag = "${x.optLong("id")}/0/$tile"; fill(a, this, x.optLong("id"), 0, tile)
                        }, LinearLayout.LayoutParams(tile, tile))
                        addView(Ui.text(a, x.optString("name"), 12f, Ui.TEXT, true).apply { maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END })
                        addView(Ui.text(a, Ui.date(x.optString("start_date_local")) + (if (x.optInt("total_photo_count") > 1) " · ${x.optInt("total_photo_count")} photos" else ""), 11f, Ui.MUTED))
                        setOnClickListener { open = if (open == x.optLong("id")) 0 else x.optLong("id"); a.show("more:photos") }
                    }, LinearLayout.LayoutParams(tile, LinearLayout.LayoutParams.WRAP_CONTENT).apply { setMargins(0, Ui.dp(a, 8), Ui.dp(a, 8), 0) })
                }
            })
        }
        if (acts.size > shown) col.addView(a.button("Show ${minOf(12, acts.size - shown)} more") { shown += 12; a.show("more:photos") })
    }
}
