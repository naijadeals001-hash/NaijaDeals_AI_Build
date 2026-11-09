package com.naijadeals.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.CookieManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Bridges the web layer's documented contract to the native service:
 *
 *   window.NaijaDealsLocation.start({ sessionRef })  -> Promise
 *   window.NaijaDealsLocation.stop()                 -> Promise
 *
 * The auth cookie is copied from the WebView at start time so the service can
 * authenticate its uploads after the WebView is suspended. It is never written
 * to logs, never returned to JavaScript, and is cleared when tracking stops.
 */
@CapacitorPlugin(
        name = "NaijaDealsLocation",
        permissions = {
                @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
                @Permission(alias = "background", strings = { "android.permission.ACCESS_BACKGROUND_LOCATION" })
        }
)
public class NaijaDealsLocationPlugin extends Plugin {

    private static volatile PluginCall pendingStart;
    private static volatile NaijaDealsLocationPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** Called by the service so the web layer can react to a stop it did not request. */
    static void notifyStopped(String reason) {
        NaijaDealsLocationPlugin plugin = instance;
        if (plugin != null) {
            JSObject payload = new JSObject();
            payload.put("reason", reason);
            plugin.notifyListeners("trackingStopped", payload);
        }
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("backgroundLocation", true);
        result.put("foregroundService", true);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String sessionRef = call.getString("sessionRef");
        if (sessionRef == null || sessionRef.isEmpty()) {
            call.reject("sessionRef is required");
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            pendingStart = call;
            requestPermissionForAlias("location", call, "locationPermissionCallback");
            return;
        }
        beginTracking(call, sessionRef);
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Location permission was denied. Enable it in Android settings to share your location for a job.");
            return;
        }
        String sessionRef = call.getString("sessionRef");
        if (sessionRef == null) {
            call.reject("sessionRef is required");
            return;
        }
        pendingStart = null;
        beginTracking(call, sessionRef);
    }

    private void beginTracking(PluginCall call, String sessionRef) {
        Intent intent = new Intent(getContext(), LocationTrackingService.class)
                .setAction(LocationTrackingService.ACTION_START)
                .putExtra(LocationTrackingService.EXTRA_SESSION, sessionRef)
                .putExtra(LocationTrackingService.EXTRA_COOKIE, CookieManager.getInstance().getCookie("https://naijadeals.com"))
                .putExtra(LocationTrackingService.EXTRA_SERVER, "https://naijadeals.com");

        // Record the active session so a forced restart can be detected, never resumed silently.
        SharedPreferences prefs = getContext().getSharedPreferences("naijadeals_tracking", android.content.Context.MODE_PRIVATE);
        prefs.edit().putString("activeSession", sessionRef).apply();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(getContext(), intent);
        } else {
            getContext().startService(intent);
        }
        JSObject result = new JSObject();
        result.put("started", true);
        result.put("sessionRef", sessionRef);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), LocationTrackingService.class).setAction(LocationTrackingService.ACTION_STOP);
        getContext().startService(intent);
        getContext().getSharedPreferences("naijadeals_tracking", android.content.Context.MODE_PRIVATE).edit().remove("activeSession").apply();
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }
}
