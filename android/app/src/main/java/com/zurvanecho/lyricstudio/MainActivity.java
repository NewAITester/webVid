package com.zurvanecho.lyricstudio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // افزونهٔ محلی باید قبل از super ثبت شود
        registerPlugin(MediaSaverPlugin.class);
        // Load the SW asset bridge before the first page, including a cold start
        // with a previously registered worker controlling https://localhost.
        registerPlugin(ToolServiceWorkerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
