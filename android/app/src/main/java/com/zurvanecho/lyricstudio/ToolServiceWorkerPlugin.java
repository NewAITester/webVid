package com.zurvanecho.lyricstudio;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Installed during Bridge.registerAllPlugins(), before loadWebView() starts a page. */
@CapacitorPlugin(name = "ToolServiceWorkerBridge")
public class ToolServiceWorkerPlugin extends Plugin {
    @Override
    public void load() {
        ToolServiceWorkerBridge.install(bridge);
    }
}
