package xyz.apicov.forro;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CacheFilePlugin.class); // the app's own plugin, before the bridge starts
        super.onCreate(savedInstanceState);
    }
}
