package com.zurvanecho.lyricstudio;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ExportStatsTest {
    @Test public void capturesAvailableMetricsWithoutInventingUnavailableValues() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        JSONObject before = ExportStats.capture(context);
        JSONObject after = ExportStats.capture(context);
        assertTrue(after.getLong("processCpuMs") >= before.getLong("processCpuMs"));
        assertTrue(after.getLong("elapsedRealtimeMs") >= before.getLong("elapsedRealtimeMs"));
        assertTrue(after.getLong("processPssKiB") >= 0);
        assertTrue(after.getLong("javaHeapBytes") >= 0);
        assertTrue(after.has("thermalStatus"));
        assertTrue(after.has("batteryTemperatureC"));
        assertFalse(after.has("deviceId"));
        assertFalse(after.has("actualHardwareEncoder"));
    }
}
