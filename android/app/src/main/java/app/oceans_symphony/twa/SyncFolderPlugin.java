package app.oceans_symphony.twa;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Device-sync folder access through the Storage Access Framework.
 *
 * Why this exists: since Android 11 (scoped storage) an app can only list
 * and read files in a shared folder like Documents if it CREATED them. The
 * desktop drops its sync snapshot into Documents/OceansSymphony over USB,
 * so Android treats that file as someone else's and hides it from the app
 * — sync ran one way only (phone → desktop). Verified on a Galaxy S24
 * running Android 16: the file is there over USB, invisible to the app.
 *
 * The fix Android sanctions (and Play accepts, unlike "All files access")
 * is a folder the USER grants once through the system picker. With a
 * persisted tree grant the app can list, read, write and delete every file
 * in that folder no matter who created it.
 *
 * Folder handle passed from JS:
 *   uri   — the tree URI the user granted (persisted)
 *   docId — the directory to work in, inside that tree. Usually the tree
 *           root; if the user picked Documents itself and it contains an
 *           OceansSymphony folder, that subfolder is used so the desktop
 *           and the phone keep meeting in the same place.
 *
 * Only snapshot files are ever touched; the JS side filters by name.
 * Called from JS via src/lib/nativeSyncFolder.js.
 */
@CapacitorPlugin(name = "SyncFolder")
public class SyncFolderPlugin extends Plugin {

    private static final String EXTERNAL_STORAGE_AUTHORITY = "com.android.externalstorage.documents";
    private static final String PREFERRED_SUBDIR = "OceansSymphony";

    // ── Pick ───────────────────────────────────────────────────────────

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        // Open the picker AT Documents/OceansSymphony so the common case is
        // two taps ("Use this folder" → "Allow"). The folder already exists
        // on any phone that synced before; JS creates it otherwise.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String initial = call.getString("initialPath", "Documents/" + PREFERRED_SUBDIR);
            Uri initialUri = DocumentsContract.buildDocumentUri(EXTERNAL_STORAGE_AUTHORITY, "primary:" + initial);
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, initialUri);
        }
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri tree = data.getData();
        ContentResolver resolver = getContext().getContentResolver();
        try {
            resolver.takePersistableUriPermission(tree,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("Android didn't let the app keep access to that folder. Try choosing it again.");
            return;
        }
        try {
            String rootId = DocumentsContract.getTreeDocumentId(tree);
            String rootName = displayName(tree, rootId);
            String docId = rootId;
            String name = rootName;
            // Picked Documents (or anything holding an OceansSymphony folder)
            // instead of the folder itself: work inside the subfolder.
            if (!PREFERRED_SUBDIR.equals(rootName)) {
                String child = findChild(tree, rootId, PREFERRED_SUBDIR, true);
                if (child != null) {
                    docId = child;
                    name = rootName + "/" + PREFERRED_SUBDIR;
                }
            }
            JSObject ret = new JSObject();
            ret.put("uri", tree.toString());
            ret.put("docId", docId);
            ret.put("name", name);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(message(e, "Couldn't open that folder."));
        }
    }

    // ── Access check ───────────────────────────────────────────────────

    @PluginMethod
    public void hasAccess(PluginCall call) {
        String uri = call.getString("uri");
        JSObject ret = new JSObject();
        ret.put("ok", uri != null && hasPersistedGrant(Uri.parse(uri)));
        call.resolve(ret);
    }

    // ── List ───────────────────────────────────────────────────────────

    @PluginMethod
    public void list(PluginCall call) {
        Uri tree = treeOf(call);
        if (tree == null) return;
        String dirId = dirOf(call, tree);
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, dirId);
        String[] cols = new String[] {
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        };
        JSArray files = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
            if (c != null) {
                while (c.moveToNext()) {
                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(3))) continue;
                    JSObject f = new JSObject();
                    f.put("name", c.getString(0));
                    f.put("size", c.isNull(1) ? 0 : c.getLong(1));
                    f.put("mtime", c.isNull(2) ? 0 : c.getLong(2));
                    files.put(f);
                }
            }
            JSObject ret = new JSObject();
            ret.put("files", files);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject(lostAccess());
        } catch (Exception e) {
            call.reject(message(e, "Couldn't read the sync folder."));
        }
    }

    // ── Read ───────────────────────────────────────────────────────────

    @PluginMethod
    public void read(PluginCall call) {
        Uri tree = treeOf(call);
        if (tree == null) return;
        String name = call.getString("name");
        if (name == null || name.isEmpty()) { call.reject("name is required"); return; }
        try {
            String id = findChild(tree, dirOf(call, tree), name, false);
            if (id == null) { call.reject("That file isn't in the sync folder any more."); return; }
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, id);
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            try (InputStream in = getContext().getContentResolver().openInputStream(doc)) {
                if (in == null) throw new Exception("Couldn't open that file.");
                byte[] chunk = new byte[64 * 1024];
                int n;
                while ((n = in.read(chunk)) != -1) buf.write(chunk, 0, n);
            }
            JSObject ret = new JSObject();
            ret.put("data", new String(buf.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject(lostAccess());
        } catch (Exception e) {
            call.reject(message(e, "Couldn't read that file."));
        }
    }

    // ── Write (staged: .part → rename into place) ──────────────────────

    @PluginMethod
    public void write(PluginCall call) {
        Uri tree = treeOf(call);
        if (tree == null) return;
        String name = call.getString("name");
        String text = call.getString("data");
        if (name == null || name.isEmpty() || text == null) { call.reject("name and data are required"); return; }
        ContentResolver resolver = getContext().getContentResolver();
        String dirId = dirOf(call, tree);
        Uri dir = DocumentsContract.buildDocumentUriUsingTree(tree, dirId);
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        String partName = name + ".part";
        try {
            // Stage into a .part file so an interrupted write (app killed,
            // cable pulled, storage full) can never leave a truncated file
            // as the live snapshot. ".part" is outside the name pattern the
            // readers accept, so a leftover fragment is ignored, not merged.
            // octet-stream keeps the display name exactly as given (a JSON
            // MIME type would make the provider append ".json").
            String partId = findChild(tree, dirId, partName, false);
            Uri part = partId != null
                ? DocumentsContract.buildDocumentUriUsingTree(tree, partId)
                : DocumentsContract.createDocument(resolver, dir, "application/octet-stream", partName);
            if (part == null) throw new Exception("Couldn't create a file in the sync folder.");
            writeAll(resolver, part, bytes);

            // Swap it into place: clear the old snapshot, then rename. A
            // rename onto an existing name would produce "name (1)".
            String oldId = findChild(tree, dirId, name, false);
            if (oldId != null) {
                DocumentsContract.deleteDocument(resolver, DocumentsContract.buildDocumentUriUsingTree(tree, oldId));
            }
            Uri renamed = null;
            try {
                renamed = DocumentsContract.renameDocument(resolver, part, name);
            } catch (Exception ignored) {
                // Provider without rename support: fall through.
            }
            if (renamed == null) {
                // Fallback: write in place, then drop the .part.
                Uri target = DocumentsContract.createDocument(resolver, dir, "application/octet-stream", name);
                if (target == null) throw new Exception("Couldn't write to the sync folder.");
                writeAll(resolver, target, bytes);
                try { DocumentsContract.deleteDocument(resolver, part); } catch (Exception ignored) { /* best effort */ }
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject(lostAccess());
        } catch (Exception e) {
            call.reject(message(e, "Couldn't write to the sync folder."));
        }
    }

    // ── Remove ─────────────────────────────────────────────────────────

    @PluginMethod
    public void remove(PluginCall call) {
        Uri tree = treeOf(call);
        if (tree == null) return;
        String name = call.getString("name");
        if (name == null || name.isEmpty()) { call.reject("name is required"); return; }
        try {
            String id = findChild(tree, dirOf(call, tree), name, false);
            if (id != null) {
                DocumentsContract.deleteDocument(getContext().getContentResolver(),
                    DocumentsContract.buildDocumentUriUsingTree(tree, id));
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject(lostAccess());
        } catch (Exception e) {
            call.reject(message(e, "Couldn't remove that file."));
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────

    private Uri treeOf(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("Choose a folder to sync through first.");
            return null;
        }
        Uri tree = Uri.parse(uri);
        if (!hasPersistedGrant(tree)) {
            call.reject(lostAccess());
            return null;
        }
        return tree;
    }

    private String dirOf(PluginCall call, Uri tree) {
        String docId = call.getString("docId");
        return (docId == null || docId.isEmpty()) ? DocumentsContract.getTreeDocumentId(tree) : docId;
    }

    private boolean hasPersistedGrant(Uri tree) {
        for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(tree) && p.isReadPermission() && p.isWritePermission()) return true;
        }
        return false;
    }

    // Document id of the child called `name` in directory `dirId`, or null.
    private String findChild(Uri tree, String dirId, String name, boolean wantDir) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, dirId);
        String[] cols = new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        };
        try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
            if (c == null) return null;
            while (c.moveToNext()) {
                if (!name.equals(c.getString(1))) continue;
                boolean isDir = DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2));
                if (isDir == wantDir) return c.getString(0);
            }
        }
        return null;
    }

    private String displayName(Uri tree, String docId) {
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, docId);
        try (Cursor c = getContext().getContentResolver().query(doc,
                new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) { /* fall back to the id */ }
        return docId;
    }

    private void writeAll(ContentResolver resolver, Uri doc, byte[] bytes) throws Exception {
        // "wt" truncates — without it, a shorter snapshot would leave the
        // tail of the previous one behind and corrupt the JSON.
        try (OutputStream out = resolver.openOutputStream(doc, "wt")) {
            if (out == null) throw new Exception("Couldn't open the file for writing.");
            out.write(bytes);
            out.flush();
        }
    }

    private static String lostAccess() {
        return "The app no longer has access to the sync folder. Choose the folder again in Settings → Sync.";
    }

    private static String message(Exception e, String fallback) {
        String m = e.getMessage();
        return (m == null || m.isEmpty()) ? fallback : m;
    }
}
