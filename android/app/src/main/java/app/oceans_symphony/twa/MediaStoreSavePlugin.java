package app.oceans_symphony.twa;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Writes a file (base64-encoded bytes from JS) to the public Downloads
 * folder via MediaStore. The whole reason this plugin exists is that
 * @capacitor/filesystem's Directory.Documents flat-out fails on
 * Android 11+ with scoped storage — public Documents requires either
 * MANAGE_EXTERNAL_STORAGE (Play Store almost never approves it) or
 * the MediaStore API. This plugin uses MediaStore, which:
 *
 *   - Works on Android 10+ without ANY runtime permission. The
 *     filename uniquely identifies the entry, no need to traverse
 *     the file tree.
 *   - Writes go into /Internal storage/Download/&lt;subdir&gt;/&lt;filename&gt;
 *     visible to every file manager and survives the app being
 *     uninstalled — which is exactly what auto-backup needs.
 *   - On Android &lt; 10 (legacy storage), falls back to writing
 *     directly into the public Downloads dir via the deprecated
 *     Environment API. WRITE_EXTERNAL_STORAGE is declared with
 *     maxSdkVersion="28" in the AndroidManifest so this still
 *     works on older devices but doesn't trigger a permission
 *     prompt on modern ones.
 *
 * Called from JS via src/lib/nativeMediaStoreSave.js.
 */
@CapacitorPlugin(name = "MediaStoreSave")
public class MediaStoreSavePlugin extends Plugin {

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String filename = call.getString("filename");
        String base64Data = call.getString("data");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String subdir = call.getString("subdir", "");

        if (filename == null || filename.isEmpty() || base64Data == null) {
            call.reject("filename and data are required");
            return;
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(base64Data, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("invalid base64: " + (e.getMessage() == null ? "decode failed" : e.getMessage()));
            return;
        }

        try {
            Uri uri = save(filename, mimeType, bytes, subdir);
            JSObject ret = new JSObject();
            ret.put("uri", uri == null ? null : uri.toString());
            ret.put("filename", filename);
            ret.put("subdir", subdir);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "save failed" : e.getMessage());
        }
    }

    /**
     * Same destination as saveToDownloads, but the bytes come from a file
     * the JS side already wrote into the app's cache (in small chunks)
     * instead of one base64 string. Big exports (a zip of every picture,
     * song and video) can be hundreds of MB; marshalling that as a single
     * bridge message ran the app out of memory. The copy here streams.
     */
    @PluginMethod
    public void saveFileToDownloads(PluginCall call) {
        String path = call.getString("path");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String subdir = call.getString("subdir", "");
        if (filename == null || filename.isEmpty() || path == null || path.isEmpty()) {
            call.reject("filename and path are required");
            return;
        }
        String filePath = path.startsWith("file://") ? Uri.parse(path).getPath() : path;
        File source = filePath == null ? null : new File(filePath);
        if (source == null || !source.isFile()) {
            call.reject("source file not found");
            return;
        }
        try (InputStream in = new FileInputStream(source)) {
            Uri uri = save(filename, mimeType, in, subdir);
            JSObject ret = new JSObject();
            ret.put("uri", uri == null ? null : uri.toString());
            ret.put("filename", filename);
            ret.put("subdir", subdir);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "save failed" : e.getMessage());
        }
    }

    private static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
        }
        out.flush();
    }

    private Uri save(String filename, String mimeType, byte[] bytes, String subdir) throws Exception {
        return save(filename, mimeType, new ByteArrayInputStream(bytes), subdir);
    }

    private Uri save(String filename, String mimeType, InputStream in, String subdir) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return saveViaMediaStoreQ(filename, mimeType, in, subdir);
        }
        return saveLegacy(filename, in, subdir);
    }

    private Uri saveViaMediaStoreQ(String filename, String mimeType, InputStream in, String subdir) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        // RELATIVE_PATH must start with one of the standard public
        // directories ("Download/", "Documents/", "Pictures/" etc).
        // We always anchor under "Download/" so the file shows up in
        // the user's Downloads folder regardless of which file
        // manager they use.
        String relPath = "Download/";
        if (subdir != null && !subdir.isEmpty()) {
            relPath += subdir + "/";
        }
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, relPath);
        // IS_PENDING + commit-after-write is the recommended pattern
        // — prevents other apps from seeing a half-written file mid-
        // copy if the write is slow. For our small JSON backups it's
        // overkill, but it's cheap.
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
        Uri uri = resolver.insert(collection, values);
        if (uri == null) throw new Exception("MediaStore.insert returned null");

        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new Exception("openOutputStream returned null");
            copy(in, out);
        } catch (Exception e) {
            // Don't leave a half-written, still-pending entry behind.
            try { resolver.delete(uri, null, null); } catch (Exception ignored) { }
            throw e;
        }

        // Clear IS_PENDING so the file becomes visible.
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);

        return uri;
    }

    @SuppressWarnings("deprecation")
    private Uri saveLegacy(String filename, InputStream in, String subdir) throws Exception {
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File targetDir = subdir == null || subdir.isEmpty()
            ? downloads
            : new File(downloads, subdir);
        if (!targetDir.exists() && !targetDir.mkdirs()) {
            throw new Exception("Failed to create directory: " + targetDir.getAbsolutePath());
        }
        File target = new File(targetDir, filename);
        try (FileOutputStream fos = new FileOutputStream(target)) {
            copy(in, fos);
        }
        return Uri.fromFile(target);
    }
}
