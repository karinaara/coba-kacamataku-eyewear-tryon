# Evaluation: status and results

Brief section 9 asks for five measurements, published with their limits. This page says what has actually been run. **Four of the five need data from real people that does not exist yet**, so they have tools and a protocol but no results. Where a number below is real, it says what it measures and what it does not.

| # | Evaluation | Status | What exists |
|---|---|---|---|
| 1 | Face shape vs 3 labelers (30 to 50 faces) | **No data** | collector, label format, report, tuner |
| 2 | Measurement stability (10 captures of one person) | **No data** (one-photo robustness only, below) | collector, report |
| 3 | Color stability across lighting | **No data** (one-photo brightness test only, below) | collector, report |
| 4 | "Does this frame suit me?" (5 to 10 people) | **No data** | blinded rating screen, CSV export, report |
| 5 | Performance (laptop and low-end Android) | **1 measurement, not representative; no phone** | performance page, report |

Nothing was tuned: with no labeled faces there is nothing to tune on. The classifier, color and recommendation settings are still the brief's starting values and my guesses.

## How to produce the real results

See [PROTOCOL.md](PROTOCOL.md). In short: get consent, collect photos with `/?collect`, have three people label them independently, run the rating study with `/?study`, measure devices with `/?perf`, then run:

```bash
npm run eval
```

The report ([report.md](report.md)) opens every section with a data status and refuses to print a conclusion below the minimum count (30 labeled faces, 10 captures of one person, 3 lighting conditions, 5 raters who rated both arms, and a phone).

## What was actually measured

### One photo, changed 16 ways (robustness)

The same photo of one person (test1) after being resized (x0.5, x0.75, x1.25), re-lit (x0.7, x1.3), recompressed (JPEG 0.5, 0.25, 0.1), rotated (+/-3 and 6 degrees), cropped (5% and 10%) and shifted (3%). Data: [robustness-test1.json](robustness-test1.json).

| Measure | Mean | Std | Range |
|---|---|---|---|
| Length / width | 1.39 | 0.008 (0.6%) | 1.37 to 1.41 |
| Forehead / cheekbones | 0.88 | 0.002 | 0.88 to 0.89 |
| Jaw / cheekbones | 0.78 | 0.004 | 0.77 to 0.79 |
| Chin angle | 110.2 deg | 0.29 | 109.5 to 110.8 |
| Jaw sharpest turn | 20.1 deg | 0.33 | 19.4 to 20.6 |

- A face was found in all 17 and the primary shape never changed (oval 17 of 17).
- Recompression moved length / width the most (mean change 0.010); resizing the least (0.002).
- **Color is not robust to exposure:** x0.7 darker changed depth from Tan to Deep (confidence stayed High at 92%); x1.3 brighter changed depth to Light and undertone from cool to neutral (confidence fell to 69%). Confidence noticed the brightening but not the darkening.

**What this does not show.** This is *not* the brief's stability test. One still image run through a deterministic model is the quietest case there is: it holds the face, expression, pose and hair fixed. Real repeat captures will vary more. Treat these figures as a floor on the noise, not an estimate of it.

### Performance (one device, not representative)

Measured with `/?perf` in the Claude desktop app's browser pane, on a steady 30 fps photo source ([desktop-browser-pane.json](../../fixtures/perf/desktop-browser-pane.json)):

| | |
|---|---|
| Model load, cold / warm | 378 ms / 365 ms |
| First face found | 2.2 s after start |
| Detection time, median / slowest 5% | 36 ms / 57 ms |
| Detections per second, measured / headroom | 13.9 / 28 |

This pane throttles timers and may render in software. The **same machine showed 70 and 82 detections per second in a normal Chrome window** in the M1 live check, so these numbers are far too pessimistic for a laptop. **No phone has been measured.**

### What a first visit downloads (measured file sizes, not transfer times)

| File | Raw | Compressed (gzip) | When it loads |
|---|---|---|---|
| App JavaScript | 527 KB | 159 KB | landing screen |
| App CSS and fonts | about 25 KB + 190 KB | about 6 KB + 190 KB | landing screen |
| Face model | 3.7 MB | 3.3 MB | when the camera or an upload is first used |
| WebAssembly runtime | 12.9 MB | 3.9 MB | same |

The landing screen needs about 0.4 MB, which is the brief's "first useful screen under 3 s on 4G". It is arithmetic, not a measurement, and no real 4G test was run. Using the camera or an upload then needs about 7 MB more, and that step is the slow one on a weak connection. The model is not preloaded while the user is on the landing screen; doing so is an easy win if cold-start matters.

A build-size issue was found and fixed while measuring: the WebAssembly "module" variants (one 13.2 MB file plus a loader, about 13.5 MB) were being shipped but this app never loads them. `scripts/copy-wasm.mjs` now copies only the two variants it can use.

## Tools built for this milestone

| Page | Purpose |
|---|---|
| `/?collect` | Turn photos into fixtures (landmarks and color summary, never the photo). Also runs the one-photo robustness check. |
| `/?study` | Adds a "Rate these frames" button: six frames (top 3 and 3 random, shuffled, not labeled), 1 to 5, exports a CSV. |
| `/?perf` | Cold load, model load and detection speed on this device; exports JSON. |

`npm run eval` reads `fixtures/` and writes this folder's report. `npm run typecheck:scripts` type-checks the runner.

All of the evaluation arithmetic (confusion matrix, top-k, Fleiss' kappa checked against the textbook example, paired bootstrap, drift, flip rates, tuner cross-validation) is covered by unit tests on synthetic data. Those tests check that the sums are right. They say nothing about how well the app recognizes real faces.
