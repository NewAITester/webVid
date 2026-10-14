# Device preview quality

Settings → Preview resolution applies immediately, including in demo projects. The default
is **Original**. **Light** caps the long edge at 960 pixels; **Very light** at 480. Aspect ratio
and CSS/display size stay unchanged, and smaller canvases are never upscaled. The preference
is saved in localStorage, not in the project; denied storage falls back to session-only use.

Final export uses its own canvas and requested output dimensions. The `exporting` flag now
survives the motion code environment, so Python export always requests the original instance.
Python instances are cached separately for original, 960 and 480; audio uses original too.

For scale-aware supersampled Pillow code, the preview compiler can lower W/H and SS **before**
dependent buffers, fonts and globals are initialized. It recognizes explicit positive W/H/SS
constants, RW/RH = W/H × SS, K = RW/design_width, P(x,y) = (x×K,y×K), and Pillow Image.new.
This supports the supplied showreel pattern without editing the user's stored source.
Unknown programs stay unchanged: blindly resizing their globals can crop their artwork.
Raw byte image conversion uses the effective Python dimensions in a reduced preview.

This does not move Python to a Worker, change playback FPS, or fix unrelated MP4 delivery
failures. A heavy script can still block the UI even in reduced preview mode.

Tests: `node tests/preview.test.mjs` (includes actual Pyodide compiler execution and export
initialization/flag isolation, not MP4 encoding). `npm run test:preview-browser` checks the
real settings markup and main fit function with a small browser fixture. An installed
Chromium can be specified with `CHROMIUM_PATH`. Both build workflows run the Node test.
