package app.oceans_symphony.twa;

import android.graphics.Color;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Install the androidx.core.splashscreen splash BEFORE super.onCreate
        // so the splash library can swap the activity theme to the
        // postSplashScreenTheme (AppTheme.NoActionBar) as soon as the first
        // content frame is drawn. Without this call, the splash drawable +
        // system-rendered splash branding (icon + app label) stay painted
        // behind the WebView for the lifetime of the activity — which is
        // exactly the "duplicate header band" bug introduced when 0.17.24
        // enabled edge-to-edge windowing and the WebView stopped covering
        // the splash artwork in the inset area between the status bar and
        // the AppLayout header.
        SplashScreen.installSplashScreen(this);

        // Enable edge-to-edge with EXPLICIT transparent system bar styles.
        // The no-arg EdgeToEdge.enable() defaults to SystemBarStyle.auto(),
        // which applies a translucent white scrim over the status bar on
        // light themes — visible as a pale band on app-coloured headers.
        // Forcing dark(TRANSPARENT) on both bars matches the behaviour the
        // app had pre-0.17.24 when the now-deprecated android:statusBarColor
        // / android:navigationBarColor were set to @android:color/transparent
        // in styles.xml. Light system-icon contrast is still handled by the
        // @capacitor/status-bar plugin (style: 'LIGHT' in capacitor.config).
        EdgeToEdge.enable(
            this,
            SystemBarStyle.dark(Color.TRANSPARENT),
            SystemBarStyle.dark(Color.TRANSPARENT)
        );

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
