package app.oceans_symphony.twa;

import android.graphics.Color;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    // Render-process recoveries in this app process. Android kills the
    // web view's renderer under memory pressure (and it can crash on its
    // own); when nothing handles that, Android closes the whole app — the
    // "it opens, then closes after a moment" report. We rebuild the
    // activity instead, which reloads the web view from scratch. The
    // counter stops a renderer that dies on every load from looping.
    private static int renderGoneCount = 0;
    private static long renderGoneWindowStart = 0;

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
        registerPlugin(SyncFolderPlugin.class);
        registerPlugin(SystemSettingsPlugin.class);
        super.onCreate(savedInstanceState);

        if (bridge != null) {
            bridge.addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                    long now = SystemClock.elapsedRealtime();
                    if (now - renderGoneWindowStart > 60_000) {
                        renderGoneWindowStart = now;
                        renderGoneCount = 0;
                    }
                    renderGoneCount++;
                    boolean crashed = detail != null && detail.didCrash();
                    Log.w("OceansSymphony", "Web view renderer gone (crashed=" + crashed + ", count=" + renderGoneCount + ")");
                    if (renderGoneCount > 3) {
                        // Dying on every load — stop instead of looping.
                        finish();
                        return true;
                    }
                    // recreate() runs onDestroy, which destroys this
                    // (now unusable) web view, then builds a fresh one.
                    runOnUiThread(MainActivity.this::recreate);
                    return true;
                }
            });
        }
    }
}
