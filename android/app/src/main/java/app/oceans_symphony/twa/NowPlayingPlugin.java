package app.oceans_symphony.twa;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge for the "now playing" notification (NowPlayingService).
 *
 *   update({ title, subtitle, playing, position, duration }) — show or refresh
 *       it (position and duration in seconds).
 *   clear() — take it away.
 *   "action" event — { action: play|pause|next|previous|stop|seek, position }
 *       when the person presses a button on the notification, the lock
 *       screen or a headset.
 *
 * Used by src/lib/natureSounds/nowPlaying.js.
 */
@CapacitorPlugin(name = "NowPlaying")
public class NowPlayingPlugin extends Plugin {
    private static NowPlayingPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    static void emit(String action, long positionMs) {
        NowPlayingPlugin p = instance;
        if (p == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        if (positionMs >= 0) data.put("position", positionMs / 1000.0);
        try { p.notifyListeners("action", data, true); } catch (Exception ignored) { }
    }

    @PluginMethod
    public void update(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent i = new Intent(ctx, NowPlayingService.class).setAction(NowPlayingService.ACTION_UPDATE);
            i.putExtra("title", call.getString("title", ""));
            i.putExtra("subtitle", call.getString("subtitle", ""));
            i.putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing", false)));
            Double pos = call.getDouble("position", 0.0);
            Double dur = call.getDouble("duration", 0.0);
            i.putExtra("position", (long) Math.round((pos == null ? 0 : pos) * 1000));
            i.putExtra("duration", (long) Math.round((dur == null ? 0 : dur) * 1000));
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
        } catch (Exception e) {
            // Not allowed right now (started from the background): carry on without it.
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            Context ctx = getContext();
            ctx.stopService(new Intent(ctx, NowPlayingService.class));
        } catch (Exception e) {
            // already gone
        }
        call.resolve();
    }
}
