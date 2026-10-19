package app.oceans_symphony.twa;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Off-device backup copy through the Storage Access Framework.
 *
 * A backup in Downloads survives a wiped app, but not a lost or broken
 * phone. Here the user picks ONE file through the system "save as" picker,
 * in any storage provider their phone has (Google Drive, OneDrive,
 * Dropbox, Nextcloud, an SD card...), and every backup also overwrites
 * that file. A single file, not a folder, because Google Drive doesn't
 * offer folder grants to apps — but it does keep a persistable grant on a
 * file, which is all this needs.
 *
 * Handle passed from JS: uri — the document the user created (persisted).
 * Called from JS via src/lib/backupCopy.js.
 */
@CapacitorPlugin(name = "BackupCopy")
public class BackupCopyPlugin extends Plugin {

    // ── Pick ───────────────────────────────────────────────────────────

    @PluginMethod
    public void pickFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("suggestedName", "backup.json"));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFileResult");
    }

    @ActivityCallback
    private void pickFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri doc = data.getData();
        // Off the main thread: asking a cloud provider (Google Drive) about
        // a file it has just created can wait on the network, and on the
        // main thread that froze the whole app.
        new Thread(() -> finishPick(call, doc), "BackupCopyPick").start();
    }

    private void finishPick(PluginCall call, Uri doc) {
        ContentResolver resolver = getContext().getContentResolver();
        try {
            resolver.takePersistableUriPermission(doc,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            // Some providers grant write only.
            try {
                resolver.takePersistableUriPermission(doc, Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (SecurityException e2) {
                call.reject("That place didn't let the app keep access to the file. Try a different place, like Google Drive or your SD card.");
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("uri", doc.toString());
        ret.put("name", displayName(doc));
        ret.put("provider", providerLabel(doc));
        call.resolve(ret);
    }

    // ── Access check ───────────────────────────────────────────────────

    @PluginMethod
    public void hasAccess(PluginCall call) {
        String uri = call.getString("uri");
        JSObject ret = new JSObject();
        ret.put("ok", uri != null && hasWriteGrant(Uri.parse(uri)));
        call.resolve(ret);
    }

    // ── Write ──────────────────────────────────────────────────────────

    @PluginMethod
    public void write(PluginCall call) {
        String uri = call.getString("uri");
        String text = call.getString("data");
        if (uri == null || uri.isEmpty() || text == null) { call.reject("uri and data are required"); return; }
        Uri doc = Uri.parse(uri);
        if (!hasWriteGrant(doc)) { call.reject(lostAccess()); return; }
        ContentResolver resolver = getContext().getContentResolver();
        byte[] bytes;
        try {
            bytes = text.getBytes(StandardCharsets.UTF_8);
        } catch (OutOfMemoryError oom) {
            // An Error, not an Exception: uncaught it closes the whole app.
            call.reject("This backup is too large to copy on this phone right now.");
            return;
        }
        try {
            OutputStream out = null;
            try {
                // "wt" truncates. Without it a local provider would leave the
                // tail of a longer previous backup behind and corrupt the JSON.
                out = resolver.openOutputStream(doc, "wt");
            } catch (Exception modeRejected) {
                // Cloud providers (Google Drive) reject "wt" but replace the
                // whole file on "w", so this can't leave a stale tail there.
                out = resolver.openOutputStream(doc, "w");
            }
            if (out == null) throw new Exception("Couldn't open the backup copy for writing.");
            try {
                out.write(bytes);
                out.flush();
            } finally {
                out.close();
            }
            // Read it back so a copy that didn't land whole is reported,
            // not counted as a good backup.
            long readBack = -1;
            try (InputStream in = resolver.openInputStream(doc)) {
                if (in != null) {
                    readBack = 0;
                    byte[] chunk = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(chunk)) != -1) readBack += n;
                }
            } catch (Exception ignored) {
                // Write-only grant: can't verify, and that's not a failure.
            }
            if (readBack >= 0 && readBack != bytes.length) {
                call.reject("The backup copy didn't save completely (" + readBack + " of " + bytes.length + " bytes). Try again.");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("bytes", bytes.length);
            ret.put("verified", readBack >= 0);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject(lostAccess());
        } catch (java.io.FileNotFoundException e) {
            call.reject("The backup copy file isn't there any more. Choose a place for it again.");
        } catch (Exception e) {
            String m = e.getMessage();
            call.reject((m == null || m.isEmpty()) ? "Couldn't save the backup copy." : m);
        }
    }

    // ── Release ────────────────────────────────────────────────────────

    @PluginMethod
    public void release(PluginCall call) {
        String uri = call.getString("uri");
        if (uri != null && !uri.isEmpty()) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(uri),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (Exception ignored) {
                try {
                    getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(uri),
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                } catch (Exception ignored2) { /* already gone */ }
            }
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    // ── Helpers ────────────────────────────────────────────────────────

    private boolean hasWriteGrant(Uri doc) {
        for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(doc) && p.isWritePermission()) return true;
        }
        return false;
    }

    private String displayName(Uri doc) {
        try (Cursor c = getContext().getContentResolver().query(doc,
                new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        } catch (Exception ignored) { /* fall through */ }
        String last = doc.getLastPathSegment();
        return last != null ? last : "backup file";
    }

    // A human name for where the file lives, from the provider authority.
    private String providerLabel(Uri doc) {
        String a = doc.getAuthority();
        if (a == null) return "";
        if (a.startsWith("com.google.android.apps.docs")) return "Google Drive";
        if (a.contains("microsoft.skydrive")) return "OneDrive";
        if (a.contains("dropbox")) return "Dropbox";
        if (a.contains("nextcloud") || a.contains("owncloud")) return "Nextcloud";
        if (a.equals("com.android.externalstorage.documents")) return "this device";
        if (a.equals("com.android.providers.downloads.documents")) return "this device";
        return "";
    }

    private static String lostAccess() {
        return "The app no longer has access to the backup copy file. Choose a place for it again.";
    }
}
