package com.zurvanecho.lyricstudio;

import static org.junit.Assert.assertTrue;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs against the APK's actual WebView + packaged assets, never a localhost test server. */
@RunWith(AndroidJUnit4.class)
public class ToolServiceWorkerTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String code) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(code, result -> {
            value.set(result);
            done.countDown();
        }));
        assertTrue("WebView did not reply", done.await(10, TimeUnit.SECONDS));
        return value.get();
    }

    @Test public void registersPackagedWorkerAndReadsManifestInWebView() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = System.currentTimeMillis() + 30000;
            while (!"true".equals(evaluate(scenario, "location.protocol === 'https:' && document.readyState !== 'loading'"))) {
                assertTrue("App origin did not load", System.currentTimeMillis() < deadline);
                Thread.sleep(150);
            }
            String webViewInfo = evaluate(scenario, "navigator.userAgent");
            System.out.println("Tool ServiceWorker test WebView: " + webViewInfo);
            // Force a fresh script request to reproduce the original failure even if a
            // previous test registered a worker. No real runtime is downloaded by this test.
            evaluate(scenario,
                "window.__toolSWTest = null; (async () => { try {" +
                "const reg = await navigator.serviceWorker.register('./tools-sw.js?webview-test=' + Date.now(), {scope:'./', updateViaCache:'none'});" +
                "await navigator.serviceWorker.ready;" +
                "if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {" +
                "const timer = setTimeout(() => reject(new Error('controller timeout')), 12000);" +
                "navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, {once:true});" +
                "});" +
                "const response = await fetch('./tools-manifest.json'); if (!response.ok) throw new Error('manifest HTTP ' + response.status);" +
                "const manifest = await response.json(); const file = manifest.entries.ffmpeg.files[0];" +
                "const runtime = await fetch('./runtime/' + file.path);" +
                "window.__toolSWTest = {ok:true, status:runtime.status};" +
                "} catch(error) {window.__toolSWTest = {ok:false, error:String(error)};} })();"
            );
            deadline = System.currentTimeMillis() + 45000;
            JSONObject result;
            while (true) {
                Object raw = new JSONTokener(evaluate(scenario, "JSON.stringify(window.__toolSWTest || {})")).nextValue();
                result = new JSONObject(String.valueOf(raw));
                if (result.has("ok")) break;
                assertTrue("ServiceWorker registration timed out", System.currentTimeMillis() < deadline);
                Thread.sleep(200);
            }
            assertTrue(result.optString("error", "ServiceWorker did not start") + " | WebView: " + webViewInfo, result.getBoolean("ok"));
            int status = result.getInt("status");
            // 409 is the intentional 'not installed' result. 503 would mean the
            // service worker still cannot fetch its own packaged manifest.
            assertTrue("Runtime route HTTP " + status, status == 200 || status == 409);
            // A persisted SW may already control the first page on the next launch.
            // The native bridge must therefore be installed before loadWebView().
            scenario.recreate();
            deadline = System.currentTimeMillis() + 30000;
            while (!"true".equals(evaluate(scenario, "location.protocol === 'https:' && document.readyState !== 'loading'"))) {
                assertTrue("Controlled page failed after Activity recreation", System.currentTimeMillis() < deadline);
                Thread.sleep(150);
            }
            evaluate(scenario,
                "window.__toolColdTest = null; (async () => { try {" +
                "const response = await fetch('./tools-manifest.json');" +
                "if (!response.ok) throw new Error('manifest HTTP ' + response.status);" +
                "const manifest = await response.json();" +
                "window.__toolColdTest = {ok:!!manifest.entries.ffmpeg};" +
                "} catch(error) {window.__toolColdTest = {ok:false, error:String(error)};} })();"
            );
            deadline = System.currentTimeMillis() + 15000;
            while (true) {
                Object raw = new JSONTokener(evaluate(scenario, "JSON.stringify(window.__toolColdTest || {})")).nextValue();
                result = new JSONObject(String.valueOf(raw));
                if (result.has("ok")) break;
                assertTrue("Controlled page manifest fetch timed out", System.currentTimeMillis() < deadline);
                Thread.sleep(200);
            }
            assertTrue(result.optString("error", "Controlled page failed"), result.getBoolean("ok"));
        }
    }
}
