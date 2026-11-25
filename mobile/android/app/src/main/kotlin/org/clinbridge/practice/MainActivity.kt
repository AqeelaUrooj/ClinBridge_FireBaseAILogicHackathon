package org.clinbridge.practice

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.os.StatFs
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Size
import android.view.Surface
import android.view.WindowManager
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.view.TextureRegistry
import java.io.ByteArrayOutputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.KeyStore
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec

/** Android side of lib/data/native.dart. No network call is made anywhere in this app. */
class MainActivity : FlutterFragmentActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private val alias = "clinbridge-practice-vault"

    private var pendingSave: Pair<ByteArray, MethodChannel.Result>? = null
    private var pendingPick: MethodChannel.Result? = null
    private var pendingPermission: MethodChannel.Result? = null

    private val createDocument = registerForActivityResult(
        object : ActivityResultContracts.CreateDocument("application/octet-stream") {
            // Folders on this phone only: a cloud drive must not be offered as a place to save.
            override fun createIntent(context: Context, input: String): Intent = super.createIntent(context, input).putExtra(Intent.EXTRA_LOCAL_ONLY, true)
        }
    ) { uri -> onSaveTarget(uri) }
    private val pickVisual = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> onPicked(uri) }
    private var cameraAsked = 0
    private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        cameraAsked++
        // Closing the first question without an answer looks the same as "never ask again": believe it from the second time on.
        val blocked = !ok && cameraAsked > 1 && !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)
        pendingPermission?.success(if (ok) "granted" else if (blocked) "blocked" else "denied")
        pendingPermission = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideRecents(true)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "clinbridge/native").setMethodCallHandler { call, result ->
            try {
                handle(call, result, flutterEngine)
            } catch (e: Exception) {
                result.error("native", e.message ?: e.javaClass.simpleName, null)
            }
        }
    }

    private fun handle(call: MethodCall, result: MethodChannel.Result, engine: FlutterEngine) {
        when (call.method) {
            "privateDir" -> result.success(noBackupFilesDir.absolutePath)
            "ksHas" -> result.success(keystore().containsAlias(alias))
            "ksCreate" -> { createKey(); result.success(null) }
            "ksSeal" -> result.success(seal(call.arguments as ByteArray))
            "ksOpen" -> result.success(open(call.arguments as ByteArray))
            "pbkdf2" -> {
                val secret = call.argument<String>("secret")!!
                val salt = call.argument<ByteArray>("salt")!!
                val rounds = call.argument<Int>("iterations")!!
                worker.execute {
                    try {
                        val spec = PBEKeySpec(secret.toCharArray(), salt, rounds, 256)
                        val key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
                        spec.clearPassword()
                        runOnUiThread { result.success(key) }
                    } catch (e: Exception) {
                        runOnUiThread { result.error("pbkdf2", e.message, null) }
                    }
                }
            }
            "battery" -> result.success(battery())
            "storage" -> {
                val fs = StatFs(noBackupFilesDir.absolutePath)
                result.success(mapOf("free" to fs.availableBytes, "total" to fs.totalBytes))
            }
            "network" -> {
                val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                val caps = cm.activeNetwork?.let { cm.getNetworkCapabilities(it) }
                result.success(caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) ?: false)
            }
            "model" -> result.success("${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE}")
            "saveFile" -> {
                if (pendingSave != null) { result.error("busy", "Another save is open.", null); return }
                pendingSave = Pair(call.argument<ByteArray>("bytes")!!, result)
                try {
                    createDocument.launch(call.argument<String>("name")!!)
                } catch (e: Exception) {
                    pendingSave = null
                    result.error("save", "Android has no screen to save a file on this phone.", null)
                }
            }
            "print" -> print(call.argument<String>("name")!!, call.argument<ByteArray>("bytes")!!, result)
            "pickImage" -> {
                if (pendingPick != null) { result.error("busy", "Another picture choice is open.", null); return }
                pendingPick = result
                try {
                    pickVisual.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                } catch (e: Exception) {
                    pendingPick = null
                    result.error("pick", "Android has no screen to choose a picture on this phone.", null)
                }
            }
            "camPermission" -> permission(call.arguments as Boolean, result)
            "appSettings" -> {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
                result.success(null)
            }
            "camStart" -> cameraStart(engine, result)
            "camCapture" -> cameraCapture(result)
            "camTorch" -> torch(call.arguments as Boolean, result)
            "camStop" -> {
                // With a number: stop only that run. Without: stop whatever runs.
                val id = call.arguments as? Int
                if (id == null || id == cameraRun) { cameraRun++; cameraStop() }
                result.success(null)
            }
            "recents" -> { hideRecents(call.arguments as Boolean); result.success(null) }
            else -> result.notImplemented()
        }
    }

    /* ------------------------------ Keystore ------------------------------ */

    private fun keystore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun createKey() {
        if (keystore().containsAlias(alias)) return
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        gen.generateKey()
    }

    private fun key(): SecretKey = keystore().getKey(alias, null) as? SecretKey ?: throw IllegalStateException("no_key")

    private fun seal(plain: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        return c.iv + c.doFinal(plain)
    }

    private fun open(sealed: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, sealed, 0, 12))
        return c.doFinal(sealed, 12, sealed.size - 12)
    }

    /* ------------------------------ Device facts ------------------------------ */

    private fun battery(): Map<String, Any?> {
        val i = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = i?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = i?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = i?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        return mapOf(
            "percent" to (if (level >= 0 && scale > 0) level * 100 / scale else -1),
            "low" to (if (Build.VERSION.SDK_INT >= 28) i?.getBooleanExtra(BatteryManager.EXTRA_BATTERY_LOW, false) ?: false else false),
            "charging" to (status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)
        )
    }

    /** Android 13+: no content in recent apps. Older versions: FLAG_SECURE (this also blocks screenshots there). */
    private fun hideRecents(hidden: Boolean) {
        if (Build.VERSION.SDK_INT >= 33) {
            setRecentsScreenshotEnabled(!hidden)
        } else if (hidden) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    /* ------------------------------ Save, print, pick ------------------------------ */

    private fun onSaveTarget(uri: Uri?) {
        val pending = pendingSave
        pendingSave = null
        if (pending == null) {
            // The app was restarted while Android's save screen was open: remove the empty file it made.
            if (uri != null) worker.execute { removeFile(uri) }
            return
        }
        val (bytes, result) = pending
        if (uri == null) { result.success(null); return }
        worker.execute {
            try {
                contentResolver.openOutputStream(uri, "wt")!!.use { it.write(bytes) }
                val name = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null }
                runOnUiThread { result.success(name ?: "file") }
            } catch (e: Exception) {
                removeFile(uri) // no half-written file stays behind
                runOnUiThread { result.error("save", e.message, null) }
            }
        }
    }

    private fun removeFile(uri: Uri) {
        try {
            DocumentsContract.deleteDocument(contentResolver, uri)
        } catch (e: Exception) {
            // The provider does not allow it; the person sees the file in the folder they chose.
        }
    }

    private fun onPicked(uri: Uri?) {
        val result = pendingPick ?: return
        pendingPick = null
        if (uri == null) { result.success(null); return }
        worker.execute {
            try {
                val mime = contentResolver.getType(uri) ?: "application/octet-stream"
                val bytes = contentResolver.openInputStream(uri)!!.use { readLimited(it) }
                runOnUiThread { result.success(mapOf("bytes" to bytes, "mime" to mime)) }
            } catch (e: Exception) {
                runOnUiThread { result.error("pick", e.message, null) }
            }
        }
    }

    /** Never more than 20 MB in memory. */
    private fun readLimited(input: InputStream): ByteArray {
        val limit = 20 * 1024 * 1024
        val out = ByteArrayOutputStream()
        val buf = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(buf)
            if (n < 0) return out.toByteArray()
            if (out.size() + n > limit) throw IllegalStateException("The picture is larger than 20 MB.")
            out.write(buf, 0, n)
        }
    }

    private fun print(name: String, pdf: ByteArray, result: MethodChannel.Result) {
        val manager = getSystemService(Context.PRINT_SERVICE) as? PrintManager
        if (manager == null) { result.success(false); return }
        val adapter = object : PrintDocumentAdapter() {
            override fun onLayout(old: PrintAttributes?, new: PrintAttributes?, cancel: CancellationSignal?, cb: LayoutResultCallback, extras: Bundle?) {
                if (cancel?.isCanceled == true) { cb.onLayoutCancelled(); return }
                cb.onLayoutFinished(PrintDocumentInfo.Builder(name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), old != new)
            }

            override fun onWrite(pages: Array<out PageRange>?, dest: ParcelFileDescriptor, cancel: CancellationSignal?, cb: WriteResultCallback) {
                worker.execute {
                    try {
                        FileOutputStream(dest.fileDescriptor).use { out ->
                            var at = 0
                            while (at < pdf.size) {
                                if (cancel?.isCanceled == true) break
                                val n = minOf(64 * 1024, pdf.size - at)
                                out.write(pdf, at, n)
                                at += n
                            }
                        }
                        runOnUiThread { if (cancel?.isCanceled == true) cb.onWriteCancelled() else cb.onWriteFinished(arrayOf(PageRange.ALL_PAGES)) }
                    } catch (e: Exception) {
                        runOnUiThread { cb.onWriteFailed(e.message) }
                    }
                }
            }
        }
        manager.print(name, adapter, null)
        result.success(true)
    }

    /* ------------------------------ Camera (pictures stay in memory) ------------------------------ */

    private var provider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var capture: ImageCapture? = null
    private var texture: TextureRegistry.SurfaceTextureEntry? = null
    private var cameraRun = 0

    private fun permission(ask: Boolean, result: MethodChannel.Result) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) { result.success("granted"); return }
        if (!ask) { result.success("denied"); return }
        if (pendingPermission != null) { result.error("busy", "The question is already open.", null); return }
        pendingPermission = result
        askCamera.launch(Manifest.permission.CAMERA)
    }

    private fun cameraStart(engine: FlutterEngine, result: MethodChannel.Result) {
        cameraStop()
        val run = ++cameraRun
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            if (run != cameraRun) { result.error("camera", "The camera was stopped before it started.", null); return@addListener }
            try {
                val p = future.get()
                provider = p
                val entry = engine.renderer.createSurfaceTexture()
                texture = entry
                var answered = false
                val preview = Preview.Builder().build()
                preview.setSurfaceProvider { request ->
                    val st = entry.surfaceTexture()
                    st.setDefaultBufferSize(request.resolution.width, request.resolution.height)
                    val surface = Surface(st)
                    request.provideSurface(surface, ContextCompat.getMainExecutor(this)) { surface.release() }
                    request.setTransformationInfoListener(ContextCompat.getMainExecutor(this)) { info ->
                        if (!answered) {
                            answered = true
                            result.success(
                                mapOf(
                                    "texture" to entry.id(), "width" to request.resolution.width, "height" to request.resolution.height,
                                    "rotation" to info.rotationDegrees, "run" to run, "torch" to (camera?.cameraInfo?.hasFlashUnit() ?: false)
                                )
                            )
                        }
                    }
                }
                val cap = ImageCapture.Builder().setResolutionSelector(
                    ResolutionSelector.Builder().setResolutionStrategy(
                        // About 12 megapixels: enough for handwriting, and it fits into the memory of small phones.
                        ResolutionStrategy(Size(3000, 4000), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER)
                    ).build()
                ).setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).setJpegQuality(90).build()
                capture = cap
                p.unbindAll()
                camera = p.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, cap)
            } catch (e: Exception) {
                cameraStop()
                result.error("camera", e.message, null)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun cameraCapture(result: MethodChannel.Result) {
        val cap = capture ?: run { result.error("camera", "The camera is not running.", null); return }
        cap.takePicture(worker, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                try {
                    val buf = image.planes[0].buffer
                    val bytes = ByteArray(buf.remaining())
                    buf.get(bytes)
                    runOnUiThread { result.success(bytes) }
                } catch (e: Exception) {
                    runOnUiThread { result.error("camera", e.message, null) }
                } finally {
                    image.close()
                }
            }

            override fun onError(e: ImageCaptureException) {
                runOnUiThread { result.error("camera", e.message, null) }
            }
        })
    }

    private fun torch(on: Boolean, result: MethodChannel.Result) {
        val cam = camera
        if (cam == null || !cam.cameraInfo.hasFlashUnit()) { result.success(false); return }
        val f = cam.cameraControl.enableTorch(on)
        f.addListener({ result.success(try { f.get(); on } catch (e: Exception) { false }) }, ContextCompat.getMainExecutor(this))
    }

    private fun cameraStop() {
        provider?.unbindAll()
        camera = null
        capture = null
        texture?.release()
        texture = null
    }

    override fun onDestroy() {
        cameraStop()
        worker.shutdown()
        super.onDestroy()
    }
}
