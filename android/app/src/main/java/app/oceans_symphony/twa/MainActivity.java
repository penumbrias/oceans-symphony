package app.oceans_symphony.twa;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
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
        publishWindowInsetsToWebView();
    }

    /**
     * Publish the REAL window insets to CSS as --android-inset-*.
     *
     * Why this exists: the app draws edge-to-edge, so the system
     * navigation bar (back / home / recents) floats over it. CSS is
     * supposed to describe that space through env(safe-area-inset-*),
     * but Android's WebView only reliably reports display CUTOUTS
     * there — the navigation bar's inset commonly comes back as 0, so
     * anything anchored to the bottom rendered underneath the nav
     * buttons and became untappable (tester report: "the triangle,
     * circle and square buttons block them").
     *
     * index.css resolves --os-sab as max(env(...), --android-inset-bottom),
     * so whichever source actually knows the inset wins and a device
     * that reports both can never double-pad. Insets are re-published on
     * every change (rotation, gesture-nav toggle, keyboard, cutout), and
     * are NOT consumed — the WebView and any other listener still see
     * them.
     */
    private void publishWindowInsetsToWebView() {
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            float density = getResources().getDisplayMetrics().density;
            if (density <= 0f) {
                density = 1f;
            }
            final int top = Math.round(bars.top / density);
            final int bottom = Math.round(bars.bottom / density);
            final int left = Math.round(bars.left / density);
            final int right = Math.round(bars.right / density);
            final String js =
                "(function(){var s=document.documentElement.style;" +
                "s.setProperty('--android-inset-top','" + top + "px');" +
                "s.setProperty('--android-inset-bottom','" + bottom + "px');" +
                "s.setProperty('--android-inset-left','" + left + "px');" +
                "s.setProperty('--android-inset-right','" + right + "px');})();";
            // The WebView may still be booting when the first insets
            // arrive; post so evaluateJavascript runs on the UI thread
            // once it is ready. A missed early pass is harmless — the
            // listener fires again on the next inset change, and
            // requestApplyInsets below forces one after load.
            view.post(() -> webView.evaluateJavascript(js, null));
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
