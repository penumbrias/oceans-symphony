package app.oceans_symphony.twa;

import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    // Opening the keyboard picker ("switch keyboard") or another system dialog
    // takes the window's focus away and gives it back. The web view could be
    // left at the keyboard's size afterwards — the bottom bar stuck halfway up
    // the screen with no keyboard showing. When focus returns, re-apply the
    // window insets and re-measure the web view, then tell the page its size
    // changed so it lays itself out again.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus || bridge == null) return;
        final WebView wv = bridge.getWebView();
        if (wv == null) return;
        Runnable resync = () -> {
            ViewCompat.requestApplyInsets(wv);
            wv.requestLayout();
        };
        wv.post(resync);
        wv.postDelayed(() -> {
            resync.run();
            try { bridge.eval("window.dispatchEvent(new Event('resize'))", null); } catch (Exception ignored) { }
        }, 300);
        // The keyboard can finish closing a moment AFTER focus returns (the
        // keyboard picker especially), so look for a leftover gap again a few
        // times instead of waiting for the next regular check.
        int[] checkAt = {700, 1500, 3000};
        for (int ms : checkAt) {
            wv.postDelayed(() -> { try { fixStaleKeyboardGap(); } catch (Exception ignored) { } }, ms);
        }
    }

    // Safety net for the "bottom bar stuck halfway up with no keyboard" glitch.
    // The web view is kept clear of the keyboard with a bottom margin. If the
    // keyboard goes away in a way Android doesn't report cleanly (the
    // "switch keyboard" picker, another app's dialog), that margin can stay
    // at the keyboard's size. While the system says NO keyboard is showing,
    // this watches the margin and puts it back to the smallest value seen
    // without a keyboard. It only acts on a gap of 100dp+ (a keyboard-sized
    // leftover), never on normal nav-bar differences.
    private final Handler gapHandler = new Handler(Looper.getMainLooper());
    private int baseBottomMargin = -1;
    private final Runnable gapCheck = new Runnable() {
        @Override public void run() {
            try { fixStaleKeyboardGap(); } catch (Exception ignored) { }
            gapHandler.postDelayed(this, 400);
        }
    };

    private boolean imeShowing() {
        WindowInsetsCompat root = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
        return root != null && root.isVisible(WindowInsetsCompat.Type.ime());
    }

    // Size of the bottom system bar (gesture pill / 3-button bar), in pixels.
    private int navBarBottomPx() {
        WindowInsetsCompat root = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
        if (root == null) return 0;
        return Math.max(0, root.getInsets(WindowInsetsCompat.Type.systemBars()).bottom);
    }

    private void fixStaleKeyboardGap() {
        if (bridge == null || imeShowing()) return;
        WebView wv = bridge.getWebView();
        if (wv == null) return;
        ViewGroup.LayoutParams lp = wv.getLayoutParams();
        if (!(lp instanceof ViewGroup.MarginLayoutParams)) return;
        ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) lp;
        float density = getResources().getDisplayMetrics().density;
        int now = mlp.bottomMargin;
        if (baseBottomMargin < 0 || now < baseBottomMargin) {
            baseBottomMargin = now;
        }
        // A margin we learned while the keyboard's leftover gap was already
        // there (e.g. right after the app came back) is not a real resting
        // value: with no keyboard the margin never needs to be more than the
        // nav bar plus a little. Treat such a value as unknown and aim for 0.
        int sane = navBarBottomPx() + Math.round(24 * density);
        int expected = (baseBottomMargin >= 0 && baseBottomMargin <= sane) ? baseBottomMargin : 0;
        int limit = Math.round(100 * density);
        if (now - expected >= limit) {
            baseBottomMargin = expected;
            mlp.bottomMargin = expected;
            wv.setLayoutParams(mlp);
            ViewCompat.requestApplyInsets(wv);
            wv.requestLayout();
            try { bridge.eval("window.dispatchEvent(new Event('resize'))", null); } catch (Exception ignored) { }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        gapHandler.removeCallbacks(gapCheck);
        gapHandler.postDelayed(gapCheck, 400);
    }

    @Override
    public void onPause() {
        gapHandler.removeCallbacks(gapCheck);
        super.onPause();
    }

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
        // A Soundscape focus session cut short (app killed while Do Not
        // Disturb was on for it) is undone here.
        SystemSettingsPlugin.restoreFocusDndIfLeftOn(this);

        registerPlugin(QuickActionsPlugin.class);
        registerPlugin(MediaStoreSavePlugin.class);
        registerPlugin(SyncFolderPlugin.class);
        registerPlugin(BackupCopyPlugin.class);
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
