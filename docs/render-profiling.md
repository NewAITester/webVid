# Export render diagnostics

Every export with the existing diagnostic logger automatically records `details.renderProfile` in both Original and Optimized modes. The existing save/share export reports button includes this data; no extra download or setup is needed. Preview rendering does not collect spans. No resolution, FPS, bitrate, drawing algorithm or save-mode behavior is changed.

## Fields

- `version: 1`: additive profile schema, independent of the existing report envelope.
- `renderCalls`, `redrawCalls`: render invocations, including asynchronous DOM redraws separately. Not equal to unique output frames when redraws occur; use `counts.renderedFrames` for that.
- `buckets`: fixed stage labels, zero-based `layerIndex` (project motion-layer array position, not title/ID), safe type enum, calls, inclusive/self/min/max milliseconds, failedCalls (exceptions escaping a measured run scope). Average = inclusiveMs / calls. A layer may be invoked many times for motion blur, repeats, masks and redraws.
- `slowestFrames`: at most eight worst render calls with output frame index, scene time in seconds, render duration, redraw/failed flags. No per-frame unbounded history.
- `droppedSpans`, `incompleteSpans`: coverage/truncation indicators. At most 512 aggregate buckets, the first 128 layer ordinals individually; later layers aggregate as -1. Large projects may have incomplete coverage.
- `instrumentationOps`: number of span starts/ends, not an estimate of CPU or energy.

## Stages

Scene: background, behind/front motion layers, lyrics, idle, free text, screen FX, finish. Grade: bloom, tone/chroma, vignette, grain. Motion layer: total, evaluation, content, buffer/motion-blur, filters and final composite. Code: compile/cache lookup and execution. Real Python: frame execution **including RGBA packing and bridge** (`python.frameAndPack`), pixel upload (`ImageData`/putImageData), and final canvas composite.

`python.frameAndPack` is not a Python-function-only timer and does not break down Pillow/numpy operations inside arbitrary user code. Initial runtime/package preparation can appear in the existing async wait or code-execution spans. Free-text layers are currently one scene-text aggregate, not individually indexed.

Additional `timingsMs`: `videoEncodeSubmit`, `videoMuxChunk`, `uiYield`. Encoder callbacks may overlap submission/render; these timers must not be blindly added together with video wall time.

## Reading the report

1. Compare `render` with `videoWall`, `saveWall`, queue waiting and UI yielding.
2. Rank `layer.total` by inclusive time and scene phases by their same-level totals. Match ordinals to layer order in the project.
3. Within a heavy layer compare content/Python, buffer and filters; use **selfMs** for exclusive costs. Parent inclusive time already includes its child spans. Mask work can be nested inside another layer but has its own ordinal in buffer/content/filter rows.
4. Match slowestFrames to scene time; check redraw counts and motion-blur call multiplication.
5. Keep scene/build/range/resolution/FPS/bitrate identical when comparing modes. Preference for hardware is still not hardware verification.

Synchronous wall timers include instrumentation overhead and cannot isolate deferred GPU execution. Do not introduce getImageData/GPU synchronization into production for measurement. Profiling aggregates counters in memory; it does not persist or stringify on each frame. No layer title, ID, code, lyrics, media bytes, file path or raw error message is collected by the profiler. Existing log checkpoint/retention behavior is preserved.

## Automated tests

`npm test` includes nested/exclusive timing math, privacy, bounds, preview exclusion, failure cleanup, slowest-frame cap, both export modes, masks/motion blur/redraw, scene phases and the JS Python bridge using a synthetic Python result. `npm run test:export-browser` additionally compares real Chromium canvas pixels with profiling off/on and saves a small alternating-order timing benchmark under `artifacts/export-tests`. This benchmark measures a fixture, not phone performance or actual Pyodide/numpy runtime speed. Existing CI export artifacts include these JSON reports.
