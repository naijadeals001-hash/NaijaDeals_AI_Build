package com.naijadeals.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Foreground service that collects and uploads location for one work session.
 *
 * Why a service: the WebView's JavaScript stops running when the screen locks or
 * another app takes focus, which is why browser tracking alone cannot meet
 * dispatch requirements. This service holds a foreground notification (Android
 * requires it), keeps collecting with FusedLocationProvider, and uploads on its
 * own schedule — no WebView, timer or WebSocket is involved.
 *
 * Guarantees:
 *  - collection starts only with an explicit session reference and the user's
 *    own auth cookie copied from the WebView at start;
 *  - fixes are persisted to SharedPreferences before upload, so a process death
 *    loses at most one fix;
 *  - uploads are idempotent: each fix carries a clientId the server de-dupes;
 *  - the service stops and clears its queue when the session ends, the user logs
 *    out, or the app explicitly stops it. Android cannot prevent a user force-stop
 *    from killing the service; in that case the queue is restored on next start.
 */
public class LocationTrackingService extends Service {

    public static final String ACTION_START = "com.naijadeals.app.LOCATION_START";
    public static final String ACTION_STOP = "com.naijadeals.app.LOCATION_STOP";
    public static final String EXTRA_SESSION = "sessionRef";
    public static final String EXTRA_COOKIE = "cookie";
    public static final String EXTRA_SERVER = "serverOrigin";

    private static final String CHANNEL_ID = "naijadeals-tracking";
    private static final int NOTIFICATION_ID = 7401;
    private static final String PREFS = "naijadeals_tracking";
    private static final long UPLOAD_INTERVAL_SECONDS = 20;

    private FusedLocationProviderClient locationClient;
    private LocationCallback callback;
    private ScheduledExecutorService scheduler;

    /** Session currently tracked; also the queue's namespace. */
    private String sessionRef;
    private String cookie;
    private String serverOrigin;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        locationClient = LocationServices.getFusedLocationProviderClient(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        if (ACTION_STOP.equals(intent.getAction())) {
            stopTracking("Stopped by the user");
            stopSelf();
            return START_NOT_STICKY;
        }

        String requested = intent.getStringExtra(EXTRA_SESSION);
        if (requested == null || requested.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        // A different session replaces the previous one; queues never mix.
        if (sessionRef != null && !sessionRef.equals(requested)) {
            stopTracking("Session changed");
        }
        sessionRef = requested;
        cookie = intent.getStringExtra(EXTRA_COOKIE);
        serverOrigin = intent.getStringExtra(EXTRA_SERVER);
        prefs().edit().putString("session", sessionRef).putString("cookie", cookie).putString("origin", serverOrigin).apply();

        startForeground(NOTIFICATION_ID, buildNotification("Sharing your location for an active job"));
        startUpdates();
        startUploader();
        return START_STICKY;
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void startUpdates() {
        if (callback != null) return;
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 15_000L)
                .setMinUpdateIntervalMillis(10_000L)
                .setMaxUpdateDelayMillis(30_000L)
                .build();
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                for (Location location : result.getLocations()) {
                    enqueue(location);
                }
            }
        };
        try {
            locationClient.requestLocationUpdates(request, callback, Looper.getMainLooper());
        } catch (SecurityException denied) {
            updateNotification("Location permission was removed — tracking stopped");
            stopTracking("Permission removed");
        }
    }

    private void startUploader() {
        if (scheduler != null) return;
        scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleWithFixedDelay(this::uploadQueue, 5, UPLOAD_INTERVAL_SECONDS, TimeUnit.SECONDS);
    }

    /** Persists the fix first, then schedules an upload; ordering is by capture time. */
    private void enqueue(Location location) {
        synchronized (this) {
            try {
                JSONArray queue = new JSONArray(prefs().getString(queueKey(), "[]"));
                JSONObject fix = new JSONObject();
                fix.put("clientId", UUID.randomUUID().toString());
                fix.put("latitude", location.getLatitude());
                fix.put("longitude", location.getLongitude());
                if (location.hasAccuracy()) fix.put("accuracyM", location.getAccuracy());
                if (location.hasSpeed()) fix.put("speedMps", location.getSpeed());
                if (location.hasBearing()) fix.put("headingDeg", location.getBearing());
                fix.put("capturedAt", isoTime(location.getTime()));
                fix.put("source", "native");
                queue.put(fix);
                // Cap the on-device queue so a long outage cannot fill storage.
                JSONArray capped = new JSONArray();
                for (int i = Math.max(0, queue.length() - 500); i < queue.length(); i++) capped.put(queue.get(i));
                prefs().edit().putString(queueKey(), capped.toString()).apply();
            } catch (Exception ignored) {
                // A malformed entry must never crash tracking.
            }
        }
    }

    private String queueKey() {
        return "queue:" + sessionRef;
    }

    private void uploadQueue() {
        JSONArray pending;
        synchronized (this) {
            try {
                pending = new JSONArray(prefs().getString(queueKey(), "[]"));
            } catch (Exception error) {
                return;
            }
        }
        if (pending.length() == 0 || serverOrigin == null) return;

        int batchSize = Math.min(pending.length(), 50);
        JSONArray batch = new JSONArray();
        for (int i = 0; i < batchSize; i++) {
            try {
                batch.put(pending.get(i));
            } catch (Exception ignored) {
            }
        }

        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(serverOrigin + "/api/location/pings").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(20_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            if (cookie != null) connection.setRequestProperty("Cookie", cookie);
            JSONObject body = new JSONObject();
            body.put("sessionRef", sessionRef);
            body.put("fixes", batch);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = connection.getResponseCode();
            if (code == 200 || code == 201) {
                synchronized (this) {
                    JSONArray remaining = new JSONArray();
                    for (int i = batchSize; i < pending.length(); i++) {
                        try {
                            remaining.put(pending.get(i));
                        } catch (Exception ignored) {
                        }
                    }
                    prefs().edit().putString(queueKey(), remaining.toString()).apply();
                }
                updateNotification("Location shared · " + (pending.length() - batchSize) + " pending");
            } else if (code == 401 || code == 403) {
                // The session ended or the user was signed out: stop and clear.
                stopTracking("Session no longer authorised");
                stopSelf();
            } else {
                updateNotification("Waiting to upload location (server " + code + ")");
            }
        } catch (Exception offline) {
            updateNotification("Offline — " + pending.length() + " location updates queued");
        }
    }

    private void stopTracking(String reason) {
        if (callback != null) {
            try {
                locationClient.removeLocationUpdates(callback);
            } catch (Exception ignored) {
            }
            callback = null;
        }
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
        if (sessionRef != null) {
            prefs().edit().remove(queueKey()).remove("session").remove("cookie").apply();
        }
        sessionRef = null;
        cookie = null;
        stopForeground(true);
        NaijaDealsLocationPlugin.notifyStopped(reason);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Job location sharing", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shown while NaijaDeals shares your location for an active job.");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent openIntent = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, LocationTrackingService.class).setAction(ACTION_STOP);
        PendingIntent stopIntent = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("NaijaDeals is sharing your location")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openIntent)
                .addAction(0, "Stop sharing", stopIntent)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    private static String isoTime(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopTracking("Service destroyed");
        super.onDestroy();
    }
}
