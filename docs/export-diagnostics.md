# Optional optimized export and comparable diagnostics (v1)

The export panel toggle is **OFF by default**, saved as a device preference. OFF retains the
original quality-mode encoder and whole-Blob/3 MiB save path. ON asks WebCodecs for
`prefer-hardware` if supported, falls back to the compatible config with a reason code,
and reads the Blob in 1 MiB slices when saving on Android. Settings, FPS, resolution,
Python supersampling and final render quality are not reduced. Both modes release encoder
resources, video/audio frames, and clean incomplete cache writes on cancellation/error.
Cancellation during native publication may finish saving the file; that race is logged.

This is **not** a streaming MP4 muxer. Both modes still use ArrayBufferTarget and in-memory
MP4 assembly. Optimized saving avoids the *additional* full-file ArrayBuffer, but still uses
bounded Base64 chunks, the Capacitor bridge, a temp file and MediaStore copy. More bridge
calls may make saving slower; that tradeoff is why measurements are included.

## Local reports

Each actual export attempt records mode, implementation/build, scene SHA-256 (not content),
range/dimensions/FPS/bitrate/audio, configuration/fallback reasons, frame/chunk counts,
render/media/async wait/frame-copy/queue/flush/audio/mux/save timings, and outcomes including
failure, cancellation and cache-only partial save. Encoder output latency includes queueing
and callback scheduling, not isolated hardware encode time. Timers overlap: do not sum
all fields as total execution time. Total is independently measured.

Samples are taken at start/end and every 5 seconds, capped at 250 (last slot retains the end).
A report is checkpointed at start, about every 30 seconds, and at finish. A `running` report
without completion can indicate an interrupted/killed app, not a successful export.
Last 20 reports remain in IndexedDB; Android also writes private Data/export-logs/*.json.
The explicit report button bundles JSON and saves/shares it. There is no network upload,
and reports exclude source code, lyrics, media bytes, titles and file paths. Failed storage
is reported; native file recovery works if IndexedDB is unavailable. No sensor value is
invented when unsupported. Clearing app data/uninstalling removes local reports.

## Interpreting pressure correctly

Android samples include host-process cumulative CPU ms, host-process PSS KiB, native/Java
heaps, OS thermal status, battery temperature/level/plugged state/current. WebView/Pyodide
may be in a **different process**; host CPU/PSS alone cannot rank whole-app/phone load.
WebCodecs exposes a preference, not verification of the actual hardware encoder: that field
stays null. Battery temperature is not CPU temperature; current is instantaneous whole-device
current, not energy consumed by this export. JS heap excludes many native/Wasm/GPU buffers.
Sampling can miss peaks. Browser-only reports explicitly mark native measurements unavailable.

Compare the same scene fingerprint, build, range, output settings, and audio. Do a short
warm-up and then alternate original/optimized (A-B-B-A), ideally at least 3 runs each. Let
the phone return to a similar temperature; keep charging state/background apps stable.
Do not compare changed scenes (`scene-changed-during-export`), failures, or cache-only saves
as successful runs. Scene hashes do not verify external audio/media file bytes: use the same
project/files. Examine render vs queue/flush vs save timings to explain any speed difference;
use matched-start thermal samples and memory proxies cautiously. Never assume faster means
less battery drain or lower pressure. No speed or pressure winner is asserted in this change.

## Automated checks

`node tests/export-modes.test.mjs` verifies both policies, hardware/configure fallback,
success/failure/cancel diagnostics, no whole-file read in optimized saving, byte-identical
native-write mocks and retained cache on publication failure. Mock logs are labeled synthetic.
`npm run test:export-browser` uses actual WebCodecs, mp4-muxer, IndexedDB/downloads and a
simple deterministic fixture renderer; FFprobe counts frames/dimensions/FPS and FFmpeg fully
decodes original/optimized MP4s, plus audio when supported. These are not benchmarks of the
phone or a full Python scene. Browser failure reports are preserved too.
Both build workflows run these tests and upload artifacts/export-tests/. Android's connected
tests also verify the native snapshot API returns genuine/nullable metrics. Native emulator/
full APK validation runs in CI; desktop browser tests do not substitute for device tests.
