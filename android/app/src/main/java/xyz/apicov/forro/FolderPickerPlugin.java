package xyz.apicov.forro;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A folder of songs through Android's folder picker: one permission for the whole folder (kept across restarts,
 * so its songs play from where they are, nothing copied). Its files are listed, and those of its subfolders one
 * level down: a song folder, or a folder of song folders. Not deeper (a project folder's node_modules…).
 */
@CapacitorPlugin(name = "FolderPicker")
public class FolderPickerPlugin extends Plugin {

    /** Opens the picker; resolves { tree, files } or { tree: null } if the user backs out. */
    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject none = new JSObject();
            none.put("tree", null);
            call.resolve(none);
            return;
        }
        Uri tree = data.getData();
        getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        list(call, tree);
    }

    /** Lists a folder picked before ({ tree }); rejects if the permission is gone. */
    @PluginMethod
    public void list(PluginCall call) {
        String tree = call.getString("tree");
        if (tree == null) {
            call.reject("No folder given");
            return;
        }
        list(call, Uri.parse(tree));
    }

    private void list(PluginCall call, Uri tree) {
        JSArray files = new JSArray();
        try {
            for (String dir : addFiles(tree, DocumentsContract.getTreeDocumentId(tree), files)) addFiles(tree, dir, files);
        } catch (SecurityException | IllegalArgumentException e) {
            call.reject("Can't read the folder: " + e.getMessage());
            return;
        }
        JSObject out = new JSObject();
        out.put("tree", tree.toString());
        out.put("files", files);
        call.resolve(out);
    }

    /** Adds a folder's files to `files` and returns its subfolders' document ids. */
    private java.util.List<String> addFiles(Uri tree, String folderId, JSArray files) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, folderId);
        String[] columns = { Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE };
        java.util.List<String> dirs = new java.util.ArrayList<>();
        try (Cursor c = getContext().getContentResolver().query(children, columns, null, null, null)) {
            while (c != null && c.moveToNext()) {
                if (Document.MIME_TYPE_DIR.equals(c.getString(2))) {
                    dirs.add(c.getString(0));
                    continue;
                }
                JSObject f = new JSObject();
                f.put("name", c.getString(1));
                f.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0)).toString());
                files.put(f);
            }
        }
        return dirs;
    }
}
