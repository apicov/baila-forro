package xyz.apicov.forro;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CacheFilePlugin.class); // the app's own plugins, before the bridge starts
        registerPlugin(FolderPickerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
