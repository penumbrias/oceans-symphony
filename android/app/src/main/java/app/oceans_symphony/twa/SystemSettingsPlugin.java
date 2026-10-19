package app.oceans_symphony.twa;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * What stands between a reminder and the person, and one-tap ways to fix
 * it (owner, 2026-10-01: "there is no quick way to redirect the user to
 * enable them"). Read by src/lib/notificationHealth.js.
 *
 *   status()                   notifications allowed? on-time (exact) alarms
 *                              allowed? battery unrestricted? reminders
 *                              channel muted?
 *   openNotificationSettings() this app's notification settings page
 *   openExactAlarmSettings()   "Alarms & reminders" for this app (Android 12+)
 *   openBatterySettings()      this app's info page — Battery → Unrestricted
 *                              lives there. (Deliberately NOT the direct
 *                              "ignore battery optimisations" prompt, which
 *                              needs a permission Google Play restricts.)
 *
 * Every opener falls back to the app's info page if the specific screen
 * doesn't exist on this phone.
 */
@CapacitorPlugin(name = "SystemSettings")
public class SystemSettingsPlugin extends Plugin {

    // Must match REMINDERS_CHANNEL_ID in src/lib/nativeNotifications.js.
    private static final String REMINDERS_CHANNEL = "reminders-default-v2";

    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        String pkg = ctx.getPackageName();
        JSObject r = new JSObject();
        r.put("notificationsEnabled", NotificationManagerCompat.from(ctx).areNotificationsEnabled());

        boolean exact = true;
        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            exact = am == null || am.canScheduleExactAlarms();
        }
        r.put("exactAlarms", exact);

        boolean unrestricted = true;
        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            unrestricted = pm == null || pm.isIgnoringBatteryOptimizations(pkg);
        }
        r.put("batteryUnrestricted", unrestricted);

        boolean muted = false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel ch = nm == null ? null : nm.getNotificationChannel(REMINDERS_CHANNEL);
            muted = ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE;
        }
        r.put("remindersChannelMuted", muted);
        call.resolve(r);
    }

    /**
     * Is another app (a music player, a podcast) playing right now? Read
     * by src/lib/otherAudio.js so a profile song never starts on its own
     * over someone's music: starting web audio takes the phone's audio
     * focus, and music apps stop when they lose it.
     */
    @PluginMethod
    public void otherAudioPlaying(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        JSObject r = new JSObject();
        r.put("playing", am != null && am.isMusicActive());
        call.resolve(r);
    }

    // ── Soundscape "distraction-free" focus ─────────────────────────────
    // Turns on the phone's Do Not Disturb in "Alarms only" mode for the
    // length of a focus session, and puts back whatever was set before.
    // Needs the person to allow "Do Not Disturb access" for this app once
    // (openDndAccessSettings). "Alarms only" rather than total silence so
    // an alarm clock still rings. The previous mode is kept in
    // SharedPreferences so a session cut short by the app being killed is
    // undone on the next launch (restoreFocusDndIfLeftOn, MainActivity).
    private static final String FOCUS_PREFS = "symphony_focus_dnd";

    @PluginMethod
    public void dndStatus(PluginCall call) {
        JSObject r = new JSObject();
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        boolean supported = Build.VERSION.SDK_INT >= 23 && nm != null;
        r.put("supported", supported);
        r.put("accessGranted", supported && nm.isNotificationPolicyAccessGranted());
        r.put("active", getContext().getSharedPreferences(FOCUS_PREFS, Context.MODE_PRIVATE).getBoolean("active", false));
        call.resolve(r);
    }

    @PluginMethod
    public void openDndAccessSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 23) {
            open(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS), call);
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void startFocusDnd(PluginCall call) {
        JSObject r = new JSObject();
        Context ctx = getContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT < 23 || nm == null || !nm.isNotificationPolicyAccessGranted()) {
            r.put("applied", false);
            call.resolve(r);
            return;
        }
        SharedPreferences prefs = ctx.getSharedPreferences(FOCUS_PREFS, Context.MODE_PRIVATE);
        try {
            if (!prefs.getBoolean("active", false)) {
                prefs.edit()
                    .putInt("previous", nm.getCurrentInterruptionFilter())
                    .putBoolean("active", true)
                    .commit();
            }
            nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS);
            r.put("applied", true);
        } catch (Exception e) {
            prefs.edit().putBoolean("active", false).commit();
            r.put("applied", false);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void stopFocusDnd(PluginCall call) {
        restoreFocusDndIfLeftOn(getContext());
        call.resolve();
    }

    /** Puts Do Not Disturb back the way it was, if a focus session set it. */
    public static void restoreFocusDndIfLeftOn(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(FOCUS_PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("active", false)) return;
        int previous = prefs.getInt("previous", NotificationManager.INTERRUPTION_FILTER_ALL);
        prefs.edit().putBoolean("active", false).commit();
        if (Build.VERSION.SDK_INT < 23) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.isNotificationPolicyAccessGranted()) return;
        try {
            // Only undo our own change: if the person picked a different
            // Do Not Disturb mode during the session, leave theirs alone.
            if (nm.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALARMS) {
                nm.setInterruptionFilter(previous == NotificationManager.INTERRUPTION_FILTER_UNKNOWN
                    ? NotificationManager.INTERRUPTION_FILTER_ALL : previous);
            }
        } catch (Exception ignored) {
            // Nothing else to do; the phone's own DND switch still works.
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        String pkg = getContext().getPackageName();
        Intent i;
        if (Build.VERSION.SDK_INT >= 26) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else {
            i = appDetails(pkg);
        }
        open(i, call);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        String pkg = getContext().getPackageName();
        if (Build.VERSION.SDK_INT >= 31) {
            open(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg)), call);
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        open(appDetails(getContext().getPackageName()), call);
    }

    private static Intent appDetails(String pkg) {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
    }

    private void open(Intent i, PluginCall call) {
        String pkg = getContext().getPackageName();
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            try {
                Intent fallback = appDetails(pkg);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception e2) {
                call.reject("Couldn't open the phone's settings");
            }
        }
    }
}
