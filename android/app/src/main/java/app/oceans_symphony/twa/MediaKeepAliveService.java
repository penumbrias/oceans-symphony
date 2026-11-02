package app.oceans_symphony.twa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * Keeps the app's process alive while a song, audio or video is playing.
 *
 * Android ends background apps that hold nothing visible when memory runs
 * low — the web view's renderer goes first, and the sound with it. A
 * foreground service of the "media playback" kind tells the phone the app is
 * doing something the person is listening to, so it is left alone. It does no
 * work of its own: the sound still plays in the web view. Started from the app
 * (SystemSettingsPlugin.startMediaKeepAlive) when sound starts, and stopped
 * when it ends. The notification is deliberately generic and quiet.
 */
public class MediaKeepAliveService extends Service {
    private static final String CHANNEL_ID = "media-keepalive";
    private static final int NOTIFICATION_ID = 7421;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            startForegroundCompat();
        } catch (Exception e) {
            // Not allowed to start right now (the app is in the background and
            // the phone refused) — nothing to keep alive, so just stop.
            stopSelf();
            return START_NOT_STICKY;
        }
        // If Android kills the process, don't bring the service back by itself.
        return START_NOT_STICKY;
    }

    private void startForegroundCompat() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Playing in the background", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while sound is playing so the phone doesn't stop it.");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags);

        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_symphony)
            .setContentTitle("Playing")
            .setContentText("Tap to return to the app")
            .setContentIntent(pi)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        if (Build.VERSION.SDK_INT >= 29) {
            int type = Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
            startForeground(NOTIFICATION_ID, n, type);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
