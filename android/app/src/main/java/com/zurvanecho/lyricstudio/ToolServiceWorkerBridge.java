package com.zurvanecho.lyricstudio;

import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.annotation.NonNull;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.WebViewLocalServer;
import java.lang.ref.WeakReference;

/**
 * Capacitor's https://localhost is a virtual origin, not a listening HTTPS server.
 * Android sends SW script/asset requests to ServiceWorkerClient, not WebViewClient.
 * Reuse the existing Capacitor asset server for that same origin only.
 */
final class ToolServiceWorkerBridge {
    private static final String TAG = "WVToolServiceWorker";

    private ToolServiceWorkerBridge() {}

    static void install(Bridge bridge) {
        if (bridge == null || bridge.getServerUrl() != null) return; // Don't intercept live-reload servers.
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
            || !WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            Log.w(TAG, "This WebView does not support a ServiceWorker asset bridge");
            return;
        }
        final WeakReference<Bridge> reference = new WeakReference<>(bridge);
        try {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
                @Override
                public WebResourceResponse shouldInterceptRequest(@NonNull WebResourceRequest request) {
                    Bridge current = reference.get();
                    if (current == null || current.getServerUrl() != null
                        || !ToolRequestPolicy.isLocalGet(request.getMethod(), request.getUrl().toString(), current.getLocalUrl())) {
                        return null;
                    }
                    WebViewLocalServer server = current.getLocalServer();
                    // Forward all packaged assets, not just tools-sw.js: controlled page reloads
                    // and fetch('tools-manifest.json') inside the SW use this path as well.
                    return server == null ? null : server.shouldInterceptRequest(request);
                }
            });
        } catch (RuntimeException error) {
            // Optional tools must not crash app startup on an incompatible WebView.
            Log.w(TAG, "Unable to install the ServiceWorker asset bridge", error);
        }
    }
}
