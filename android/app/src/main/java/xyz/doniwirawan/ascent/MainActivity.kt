package xyz.doniwirawan.ascent

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.view.Menu
import android.view.MenuItem
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File

/**
 * Hosts the live dashboard so the APK has every feature the website has.
 *
 * Three things a bare WebView cannot do on its own are patched in:
 *   1. Story-card and export downloads (blob:/data: URLs) are captured in JS and
 *      written to the Downloads folder from Kotlin.
 *   2. Web Share isn't implemented by Android WebView, so navigator.share is
 *      shimmed onto a real Android share sheet.
 *   3. Photo pickers for story backgrounds need onShowFileChooser.
 *
 * The Strava tokens the widget already holds are seeded into localStorage, so
 * the app opens straight into the dashboard instead of an OAuth round trip.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private var filePicker: ValueCallback<Array<Uri>>? = null
    private var pendingShare: Uri? = null

    private val appHost = Uri.parse(BuildConfig.DASHBOARD_URL).host ?: ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        actionBar?.hide()

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0C0C0C"))
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // the dashboard keeps tokens and cache here
            databaseEnabled = true
            javaScriptCanOpenWindowsAutomatically = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString AscentApp/1.0"
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.addJavascriptInterface(Bridge(), "AscentBridge")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                val host = req.url.host ?: return false
                // Keep the dashboard and the Strava login flow in-app; send
                // everything else (GitHub, activity permalinks) to the browser.
                val internal = host.endsWith(appHost) || host.endsWith("strava.com")
                if (internal) return false
                openExternally(req.url)
                return true
            }

            override fun onPageFinished(v: WebView, url: String) {
                if (Uri.parse(url).host?.endsWith(appHost) == true) {
                    v.evaluateJavascript(seedTokensJs(), null)
                    v.evaluateJavascript(BRIDGE_JS, null)
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                v: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                filePicker?.onReceiveValue(null)
                filePicker = callback
                return try {
                    startActivityForResult(params.createIntent(), REQ_FILE)
                    true
                } catch (e: ActivityNotFoundException) {
                    filePicker = null
                    false
                }
            }
        }

        if (saved != null) web.restoreState(saved) else web.loadUrl(BuildConfig.DASHBOARD_URL)
    }

    /**
     * Hands the widget's tokens to the web app, but never overwrites a session
     * the user established themselves.
     */
    private fun seedTokensJs(): String {
        val p = Repo.prefs(this)
        val refresh = Repo.refreshToken(this)
        if (refresh.isBlank()) return ""
        val access = p.getString("access_token", "") ?: ""
        val expires = p.getLong("expires_at", 0L)
        // JSONObject.quote so a stray quote or backslash in a token can never
        // break the script — that failure is silent and looks like a logged-out app.
        val qRefresh = JSONObject.quote(refresh)
        return """
            (function(){
              try {
                if (localStorage.getItem('strava_refresh_token')) return;
                localStorage.setItem('strava_refresh_token', $qRefresh);
                ${if (access.isNotEmpty()) "localStorage.setItem('strava_access_token', ${JSONObject.quote(access)});" else ""}
                ${if (expires > 0) "localStorage.setItem('strava_expires_at', '$expires');" else ""}
                location.reload();
              } catch (e) {}
            })();
        """.trimIndent()
    }

    override fun onSaveInstanceState(out: Bundle) {
        super.onSaveInstanceState(out)
        web.saveState(out)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, MENU_WIDGET, 0, "Widget settings")
        menu.add(0, MENU_RELOAD, 1, "Reload")
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        MENU_WIDGET -> { startActivity(Intent(this, SetupActivity::class.java)); true }
        MENU_RELOAD -> { web.reload(); true }
        else -> super.onOptionsItemSelected(item)
    }

    override fun onActivityResult(req: Int, result: Int, data: Intent?) {
        super.onActivityResult(req, result, data)
        if (req != REQ_FILE) return
        val cb = filePicker ?: return
        filePicker = null
        cb.onReceiveValue(
            if (result == RESULT_OK && data != null) FileChooserParamsCompat.parse(data) else null
        )
    }

    private fun openExternally(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: ActivityNotFoundException) {
            toast("No app can open that link")
        }
    }

    private fun toast(msg: String) = runOnUiThread {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    /** Called from the injected JS. Only our own page is ever loaded in-app. */
    private inner class Bridge {

        @JavascriptInterface
        fun save(name: String, dataUrl: String) {
            try {
                val uri = writeToDownloads(name, decode(dataUrl), mimeOf(dataUrl))
                toast(if (uri != null) "Saved $name to Downloads" else "Could not save $name")
            } catch (e: Exception) {
                toast("Save failed: ${e.message}")
            }
        }

        @JavascriptInterface
        fun share(name: String, dataUrl: String) {
            try {
                // Share needs a content:// URI, so stage the bytes in cache and
                // expose that one file through the provider.
                val dir = File(cacheDir, "share").apply { mkdirs() }
                val file = File(dir, name)
                file.writeBytes(decode(dataUrl))
                val uri = shareUriFor(file)
                startActivity(
                    Intent.createChooser(
                        Intent(Intent.ACTION_SEND).apply {
                            type = mimeOf(dataUrl)
                            putExtra(Intent.EXTRA_STREAM, uri)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        },
                        "Share"
                    )
                )
            } catch (e: Exception) {
                toast("Share failed: ${e.message}")
            }
        }

        @JavascriptInterface
        fun toastMessage(msg: String) = toast(msg)
    }

    private fun shareUriFor(file: File): Uri =
        FileProvider.getUriForFile(this, "$packageName.files", file)

    private fun decode(dataUrl: String): ByteArray {
        val comma = dataUrl.indexOf(',')
        require(comma > 0) { "not a data URL" }
        return Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
    }

    private fun mimeOf(dataUrl: String): String =
        Regex("^data:([^;,]+)").find(dataUrl)?.groupValues?.get(1) ?: "application/octet-stream"

    private fun writeToDownloads(name: String, bytes: ByteArray, mime: String): Uri? {
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mime)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val resolver = contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return null
        resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return null
        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return uri
    }

    private object FileChooserParamsCompat {
        fun parse(data: Intent): Array<Uri>? {
            data.clipData?.let { clip ->
                return Array(clip.itemCount) { clip.getItemAt(it).uri }
            }
            return data.data?.let { arrayOf(it) }
        }
    }

    companion object {
        private const val REQ_FILE = 1001
        private const val MENU_WIDGET = 1
        private const val MENU_RELOAD = 2

        /**
         * Downloads in this app are anchors pointing at blob:/data: URLs, which
         * a WebView silently drops. Both the programmatic `a.click()` path and
         * real taps are intercepted and handed to Kotlin as base64.
         */
        private val BRIDGE_JS = """
            (function(){
              if (window.__ascentBridge) return;
              window.__ascentBridge = true;

              function isLocal(href){ return /^(blob:|data:)/.test(href || ''); }

              function send(href, name, mode){
                fetch(href).then(function(r){ return r.blob(); }).then(function(b){
                  var fr = new FileReader();
                  fr.onload = function(){ AscentBridge[mode](name, fr.result); };
                  fr.readAsDataURL(b);
                }).catch(function(e){ AscentBridge.toastMessage('Save failed: ' + e); });
              }

              var click = HTMLAnchorElement.prototype.click;
              HTMLAnchorElement.prototype.click = function(){
                if (this.hasAttribute('download') && isLocal(this.href)) {
                  send(this.href, this.getAttribute('download') || 'ascent.png', 'save');
                  return;
                }
                return click.apply(this, arguments);
              };

              document.addEventListener('click', function(e){
                var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
                if (a && isLocal(a.href)) {
                  e.preventDefault();
                  send(a.href, a.getAttribute('download') || 'ascent.png', 'save');
                }
              }, true);

              // Android WebView has no Web Share API — route it to a share sheet.
              navigator.share = function(data){
                var f = data && data.files && data.files[0];
                if (!f) { AscentBridge.toastMessage('Nothing to share'); return Promise.resolve(); }
                var fr = new FileReader();
                fr.onload = function(){ AscentBridge.share(f.name || 'ascent.png', fr.result); };
                fr.readAsDataURL(f);
                return Promise.resolve();
              };
              navigator.canShare = function(){ return true; };
            })();
        """.trimIndent()
    }
}
