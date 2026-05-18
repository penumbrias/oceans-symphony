package app.oceans_symphony.twa;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Enable edge-to-edge before super.onCreate so the BridgeActivity's
        // WebView mounts with the system bars handled the modern way.
        // Android 15+ (API 35+) makes apps edge-to-edge by default; this
        // call ensures the same on Android 14 and below, and replaces
        // the deprecated android:statusBarColor / android:navigationBarColor
        // theme attributes that Play Console flags on every upload.
        EdgeToEdge.enable(this);

        // Register app-internal Capacitor plugins before the bridge boots
        // the WebView. Capacitor's annotation-based auto-discovery covers
        // npm-installed plugins; app-local plugins like QuickActionsPlugin
        // need explicit registerPlugin so they're picked up reliably
        // across Capacitor versions.
        registerPlugin(QuickActionsPlugin.class);
        registerPlugin(MediaStoreSavePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
