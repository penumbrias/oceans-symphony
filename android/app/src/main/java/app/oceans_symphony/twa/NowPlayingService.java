package app.oceans_symphony.twa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

/**
 * The "now playing" notification for Nature sounds: a music-app style card in
 * the notification shade and on the lock screen with previous, play/pause,
 * next and stop, and the sound's name.
 *
 * The sound itself plays in the web view; this service only shows it and
 * passes the buttons back to the app (NowPlayingPlugin → naturePlayer.js).
 * It is a foreground service of the "media playback" kind, so while it is up
 * Android also leaves the app (and the sound) alone in the background.
 *
 * Uses the framework MediaSession and Notification.MediaStyle, so it needs no
 * extra library. Media-style notifications tied to a session are allowed
 * without the notification permission on Android 13+.
 */
public class NowPlayingService extends Service {
    static final String CHANNEL_ID = "now-playing";
    static final int NOTIFICATION_ID = 7422;

    static final String ACTION_UPDATE = "app.oceans_symphony.nowplaying.UPDATE";
    static final String ACTION_PLAY = "app.oceans_symphony.nowplaying.PLAY";
    static final String ACTION_PAUSE = "app.oceans_symphony.nowplaying.PAUSE";
    static final String ACTION_NEXT = "app.oceans_symphony.nowplaying.NEXT";
    static final String ACTION_PREVIOUS = "app.oceans_symphony.nowplaying.PREVIOUS";
    static final String ACTION_STOP = "app.oceans_symphony.nowplaying.STOP";

    private MediaSession session;
    private String title = "";
    private String subtitle = "";
    private boolean playing = false;
    private long positionMs = 0;
    private long durationMs = 0;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (action == null || ACTION_UPDATE.equals(action)) {
            if (intent != null) readExtras(intent);
            try {
                show();
            } catch (Exception e) {
                // Not allowed to start right now: nothing to show.
                stopSelf();
            }
            return START_NOT_STICKY;
        }
        // A button on the notification.
        if (ACTION_PLAY.equals(action)) NowPlayingPlugin.emit("play", -1);
        else if (ACTION_PAUSE.equals(action)) NowPlayingPlugin.emit("pause", -1);
        else if (ACTION_NEXT.equals(action)) NowPlayingPlugin.emit("next", -1);
        else if (ACTION_PREVIOUS.equals(action)) NowPlayingPlugin.emit("previous", -1);
        else if (ACTION_STOP.equals(action)) {
            NowPlayingPlugin.emit("stop", -1);
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void readExtras(Intent i) {
        if (i.hasExtra("title")) title = nz(i.getStringExtra("title"));
        if (i.hasExtra("subtitle")) subtitle = nz(i.getStringExtra("subtitle"));
        if (i.hasExtra("playing")) playing = i.getBooleanExtra("playing", false);
        if (i.hasExtra("position")) positionMs = Math.max(0, i.getLongExtra("position", 0));
        if (i.hasExtra("duration")) durationMs = Math.max(0, i.getLongExtra("duration", 0));
    }

    private static String nz(String s) { return s == null ? "" : s; }

    private MediaSession ensureSession() {
        if (session != null) return session;
        session = new MediaSession(this, "OceansSymphonyNowPlaying");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { NowPlayingPlugin.emit("play", -1); }
            @Override public void onPause() { NowPlayingPlugin.emit("pause", -1); }
            @Override public void onSkipToNext() { NowPlayingPlugin.emit("next", -1); }
            @Override public void onSkipToPrevious() { NowPlayingPlugin.emit("previous", -1); }
            @Override public void onStop() { NowPlayingPlugin.emit("stop", -1); stopSelf(); }
            @Override public void onSeekTo(long pos) { NowPlayingPlugin.emit("seek", pos); }
        });
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        session.setSessionActivity(PendingIntent.getActivity(this, 0, open, piFlags()));
        session.setActive(true);
        return session;
    }

    private static int piFlags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    private PendingIntent button(String action, int code) {
        Intent i = new Intent(this, NowPlayingService.class).setAction(action);
        return PendingIntent.getService(this, code, i, piFlags());
    }

    private void show() {
        MediaSession s = ensureSession();

        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, "Nature sounds");
        if (durationMs > 0) meta.putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
        s.setMetadata(meta.build());

        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
            | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
            | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SEEK_TO;
        s.setPlaybackState(new PlaybackState.Builder()
            .setActions(actions)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                positionMs, playing ? 1f : 0f, SystemClock.elapsedRealtime())
            .build());

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Now playing", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Controls for the sound that's playing.");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_symphony)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setContentIntent(s.getController().getSessionActivity())
            .setDeleteIntent(button(ACTION_STOP, 5))
            .setOngoing(playing)
            .setShowWhen(false)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Previous", button(ACTION_PREVIOUS, 1)).build())
            .addAction(playing
                ? new Notification.Action.Builder(android.R.drawable.ic_media_pause, "Pause", button(ACTION_PAUSE, 2)).build()
                : new Notification.Action.Builder(android.R.drawable.ic_media_play, "Play", button(ACTION_PLAY, 2)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Next", button(ACTION_NEXT, 3)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", button(ACTION_STOP, 4)).build())
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(s.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        Notification n = b.build();

        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    @Override
    public void onDestroy() {
        if (session != null) {
            try { session.setActive(false); session.release(); } catch (Exception ignored) { }
            session = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
