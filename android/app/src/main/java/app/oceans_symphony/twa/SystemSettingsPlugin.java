package app.oceans_symphony.twa;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
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
