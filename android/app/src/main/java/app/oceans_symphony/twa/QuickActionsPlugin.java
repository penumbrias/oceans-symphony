package app.oceans_symphony.twa;

import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Bridges the user's in-app QuickAction list (the menu they get from
 * long-pressing the Quick Check-In button on the Dashboard) onto
 * Android's launcher long-press menu via ShortcutManager.
 *
 * Called from JS via {@code src/lib/nativeQuickActions.js} whenever
 * the React Query data for QuickAction changes. We replace the
 * dynamic shortcut set in one call (setDynamicShortcuts) rather than
 * incrementally adding/removing — simpler, idempotent, and matches
 * how the JS layer reasons about the list.
 *
 * Each shortcut is built with a VIEW intent at the app's Capacitor
 * hostname plus a {@code ?quickAction=&lt;id&gt;} query param. The
 * Dashboard's mount-time effect reads that param and triggers
 * executeQuickAction() for the matching record, so the OS shortcut
 * runs the exact same code path as the in-app menu tap.
 *
 * Pre-Android-7.1 devices (API &lt; 25) don't have ShortcutManager;
 * we no-op there.
 */
@CapacitorPlugin(name = "QuickActions")
public class QuickActionsPlugin extends Plugin {

    private static final String MAIN_ACTIVITY_CLASS = "app.oceans_symphony.twa.MainActivity";

    @PluginMethod
    public void setQuickActions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
            JSObject ret = new JSObject();
            ret.put("count", 0);
            ret.put("skipped", "api_too_low");
            call.resolve(ret);
            return;
        }
        try {
            JSONArray items = call.getArray("items");
            if (items == null) items = new JSONArray();

            ShortcutManager sm = getContext().getSystemService(ShortcutManager.class);
            if (sm == null) {
                call.reject("ShortcutManager unavailable on this device");
                return;
            }

            int maxAllowed = sm.getMaxShortcutCountPerActivity();
            // ShortcutManager caps shortcuts per activity (typically 4-5
            // depending on launcher). Truncate to that cap from the
            // start of the list — caller passes the user's preferred
            // order, first-N is the right slice.
            int count = Math.min(items.length(), maxAllowed);

            int iconResId = getContext().getResources().getIdentifier(
                "ic_shortcut_quick_actions",
                "drawable",
                getContext().getPackageName()
            );

            List<ShortcutInfo> built = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                JSONObject item = items.getJSONObject(i);
                String id = item.optString("id");
                if (id == null || id.isEmpty()) continue;
                String shortLabel = item.optString("label", "Action");
                String longLabel = item.optString("longLabel", shortLabel);
                String url = item.optString(
                    "url",
                    "https://app.local.oceans-symphony/?quickAction=" + Uri.encode(id)
                );

                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.setClassName(getContext().getPackageName(), MAIN_ACTIVITY_CLASS);
                // singleTask launchMode (set in the manifest) reroutes
                // the existing task; the VIEW data still arrives in
                // onNewIntent, which Capacitor surfaces via
                // App.appUrlOpen on the JS side.
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

                // Shortcut IDs must fit in ~max 1KB. The QuickAction id
                // is the entity's CUID-ish string, well within limits.
                // ShortLabel must be <= 10 chars per Material guidance,
                // but Android only enforces a hard cap around 25.
                ShortcutInfo.Builder b = new ShortcutInfo.Builder(getContext(), id)
                    .setShortLabel(shortLabel)
                    .setLongLabel(longLabel)
                    .setIntent(intent);
                if (iconResId != 0) {
                    b.setIcon(Icon.createWithResource(getContext(), iconResId));
                }
                built.add(b.build());
            }

            sm.setDynamicShortcuts(built);

            JSObject ret = new JSObject();
            ret.put("count", built.size());
            ret.put("maxAllowed", maxAllowed);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "setDynamicShortcuts failed" : e.getMessage());
        }
    }

    @PluginMethod
    public void clearQuickActions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
            ShortcutManager sm = getContext().getSystemService(ShortcutManager.class);
            if (sm != null) sm.removeAllDynamicShortcuts();
        }
        call.resolve();
    }
}
