package com.zurvanecho.lyricstudio;

import java.net.URI;

/** Pure origin guard; external requests must retain the WebView's normal network path. */
final class ToolRequestPolicy {
    private ToolRequestPolicy() {}

    static boolean isLocalGet(String method, String requestUrl, String localOrigin) {
        if (!"GET".equals(method) || requestUrl == null || localOrigin == null) return false;
        try {
            URI request = URI.create(requestUrl);
            URI origin = URI.create(localOrigin);
            String scheme = origin.getScheme();
            if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) return false;
            return request.getUserInfo() == null
                && request.getHost() != null
                && origin.getHost() != null
                && scheme.equalsIgnoreCase(request.getScheme())
                && origin.getHost().equalsIgnoreCase(request.getHost())
                && port(origin) == port(request);
        } catch (IllegalArgumentException error) {
            return false;
        }
    }

    private static int port(URI uri) {
        if (uri.getPort() != -1) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }
}
