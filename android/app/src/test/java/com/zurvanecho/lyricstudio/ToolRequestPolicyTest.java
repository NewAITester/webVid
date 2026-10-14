package com.zurvanecho.lyricstudio;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class ToolRequestPolicyTest {
    @Test public void routesPackagedServiceWorkerAndAssets() {
        String origin = "https://localhost";
        assertTrue(ToolRequestPolicy.isLocalGet("GET", "https://localhost/tools-sw.js", origin));
        assertTrue(ToolRequestPolicy.isLocalGet("GET", "https://localhost/tools-sw.js?test=1", origin));
        assertTrue(ToolRequestPolicy.isLocalGet("GET", "https://localhost/tools-manifest.json", origin));
        assertTrue(ToolRequestPolicy.isLocalGet("GET", "https://localhost/assets/index.js", origin));
        assertTrue(ToolRequestPolicy.isLocalGet("GET", "https://LOCALHOST:443/assets/index.js", origin));
    }

    @Test public void doesNotInterceptCDNsOrChangeOrigins() {
        String origin = "https://localhost";
        assertFalse(ToolRequestPolicy.isLocalGet("GET", "https://cdn.jsdelivr.net/example.wasm", origin));
        assertFalse(ToolRequestPolicy.isLocalGet("GET", "https://localhost.evil.test/tools-sw.js", origin));
        assertFalse(ToolRequestPolicy.isLocalGet("GET", "https://evil.test@localhost/tools-sw.js", origin));
        assertFalse(ToolRequestPolicy.isLocalGet("GET", "http://localhost/tools-sw.js", origin));
        assertFalse(ToolRequestPolicy.isLocalGet("GET", "https://localhost:444/tools-sw.js", origin));
        assertFalse(ToolRequestPolicy.isLocalGet("POST", "https://localhost/tools-sw.js", origin));
        assertFalse(ToolRequestPolicy.isLocalGet("GET", "file:///android_asset/public/tools-sw.js", origin));
        assertFalse(ToolRequestPolicy.isLocalGet("GET", "https://[invalid", origin));
        assertFalse(ToolRequestPolicy.isLocalGet("GET", null, origin));
    }
}
