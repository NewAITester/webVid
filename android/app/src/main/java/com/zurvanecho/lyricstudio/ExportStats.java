package com.zurvanecho.lyricstudio;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Debug;
import android.os.PowerManager;
import android.os.Process;
import android.os.SystemClock;
import org.json.JSONObject;

/** Low-frequency app-process samples, NOT device CPU utilization or codec power attribution. */
public final class ExportStats {
    private ExportStats() {}
    public static JSONObject capture(Context context) throws Exception {
        JSONObject out = new JSONObject();
        out.put("elapsedRealtimeMs", SystemClock.elapsedRealtime());
        out.put("processCpuMs", Process.getElapsedCpuTime());
        out.put("sdk", Build.VERSION.SDK_INT);
        out.put("measurementScope", "android-host-process-only");
        out.put("model", Build.MODEL);
        out.put("appVersion", context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName);
        Runtime r = Runtime.getRuntime();
        out.put("javaHeapBytes", r.totalMemory() - r.freeMemory());
        out.put("nativeHeapBytes", Debug.getNativeHeapAllocatedSize());
        Debug.MemoryInfo mem = new Debug.MemoryInfo();
        Debug.getMemoryInfo(mem);
        out.put("processPssKiB", mem.getTotalPss());
        out.put("thermalStatus", JSONObject.NULL);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) out.put("thermalStatus", pm.getCurrentThermalStatus());
        }
        out.put("batteryTemperatureC", JSONObject.NULL);
        out.put("batteryPercent", JSONObject.NULL);
        out.put("plugged", JSONObject.NULL);
        Intent battery = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery != null) {
            int temperature = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
            if (temperature != Integer.MIN_VALUE) out.put("batteryTemperatureC", temperature / 10.0);
            int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1), level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            if (scale > 0 && level >= 0) out.put("batteryPercent", 100.0 * level / scale);
            out.put("plugged", battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1));
        }
        out.put("batteryCurrentMicroA", JSONObject.NULL);
        BatteryManager manager = (BatteryManager) context.getSystemService(Context.BATTERY_SERVICE);
        if (manager != null) {
            int current = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW);
            if (current != Integer.MIN_VALUE) out.put("batteryCurrentMicroA", current);
        }
        return out;
    }
}
