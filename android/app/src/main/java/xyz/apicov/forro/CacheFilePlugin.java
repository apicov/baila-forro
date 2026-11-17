package xyz.apicov.forro;

import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;

/**
 * Writes a text file into the app's cache folder for sharing (the exported beats).
 *
 * Not Capacitor's Filesystem plugin: on its first call it asks Android for the app's own external folders
 * (getExternalCacheDir), which makes Android create them on every storage volume. With a failing SD card that
 * blocked for ~12 s, on the UI thread. The internal cache folder needs none of that.
 */
@CapacitorPlugin(name = "CacheFile")
public class CacheFilePlugin extends Plugin {

    /** { name, text } → { uri } (a file:// URL, what the Share plugin takes). */
    @PluginMethod
    public void write(PluginCall call) {
        String name = new File(call.getString("name", "export.txt")).getName(); // no folders in the name
        File f = new File(getContext().getCacheDir(), name);
        try (Writer w = new OutputStreamWriter(new FileOutputStream(f, false), StandardCharsets.UTF_8)) {
            w.write(call.getString("text", ""));
        } catch (IOException e) {
            call.reject("Can't write " + f + ": " + e.getMessage());
            return;
        }
        JSObject out = new JSObject();
        out.put("uri", Uri.fromFile(f).toString());
        call.resolve(out);
    }
}
