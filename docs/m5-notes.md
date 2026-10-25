# M5 notes: try-on

> **Superseded in part by M7:** frames are no longer all drawn exactly as wide as the cheekbones. Each style now has a real width in mm and is sized with the iris as a ruler (see docs/m7-notes.md). The cheekbone rule below remains as the fallback when the iris is too small to measure.

Flow: capture or upload, Continue, Analyzing, **Try on** (this milestone), Why this?. "Live camera" and "My photo" switch the preview source; if the camera is blocked the screen falls back to your captured photo.

## What was measured

All numbers are from the Chromium browser pane with a **fake camera**: a canvas stream playing test1.jpg with blended sensor noise, still for 4 s, then panning +/-80 px, zooming +/-15% and tilting +/-8 degrees. The true motion is known, so tracking error is measured against it. Detection ran at 20 per second (the pane is throttled; a laptop ran 70 to 80 in M1).

| Measure (frame is 355 px wide) | Raw landmarks | After One Euro filter |
|---|---|---|
| Jitter while still, frame center x (std) | 0.19 px | 0.12 px |
| Jitter while still, frame center y | 0.30 px | 0.23 px |
| Jitter while still, frame width | 0.64 px | 0.43 px |
| Jitter while still, tilt | 0.055 deg | 0.035 deg |
| Bumpiness while moving, center x (second difference) | 4.09 | 3.39 |
| Bumpiness while moving, width | 4.18 | 2.84 |
| Tracking error vs true motion, center x | 1.6 px | 2.5 px |
| Delay behind true motion, center x | 20 ms | 50 ms |
| Delay behind true motion, width / tilt | 20 / 50 ms | 30 / 70 ms |

Reading it honestly:

- The frame follows the face through pan, zoom and tilt to within a few pixels (under 1.5% of its width).
- The detector is already steady on this stream (under 0.4 px of jitter), so the filter's gain is modest: roughly 30 to 40% less jitter, at a cost of about 20 to 40 ms extra lag. A real webcam in poor light will be noisier than this fake one, so the benefit there is **unmeasured**.
- The fake noise is mild. The settings (`SMOOTHING` in `src/core/config/tryon.ts`, minCutoff 1.0, beta 0.025) were nudged until a unit test showed over 3x jitter reduction on a +/-3 px noisy still signal while still beating a plain low-pass on a ramp. They are not tuned on a real camera.

Unit tests (116 in total now) cover: One Euro filter (jitter, step response, lag vs plain low-pass, reset, bad timestamps); fit scale from 90 to 800 px faces; S/M/L = 0.94 / 1.0 / 1.06; roll in both directions up to 30 degrees; following movement; yaw squash and temple fading on the correct side; the whole fit on the real fixture.

## Decisions made without asking

- **Frame width = cheekbone width (234 to 454) x size factor.** The brief says about 1.0; on test1 it looks natural but on the wide side. Change `FIT.fitFactor` if you want it narrower.
- **Yaw:** cheekbone width shrinks when the head turns, so the scale is corrected by 1/cos(yaw) and the front then squashed by cos(yaw). The temple on the side the nose points toward fades between 8 and 25 degrees and is hidden after; the near temple fades 25 to 40; the whole frame fades between 40 and 55 degrees. Yaw size comes from MediaPipe's matrix; its sign is not trusted, the side comes from the nose position instead.
- **Horizontal anchor** is halfway between the eye midpoint and the nose bridge (`bridgeWeight 0.5`).
- **Smoothing is applied to six landmarks** (irises, cheek edges, nose bridge, nose tip) and to yaw, not all 478. It restarts if the face is lost for more than 300 ms.
- **Frame order is catalog order.** Ranking by face shape and color, "best match" badges on swatches and the size suggestion are M7. They are not faked here.
- The old result screen is replaced by this one (shape and percentages are in a card; all six probabilities are under a toggle). "Share" is M9.

## Bug found and fixed on the way

`useCamera` raced under React's double-mount: the first start's aborted play could set an error after the second start succeeded, and the first camera stream was never stopped (camera light stays on). Starts now carry a token and stale ones release their stream and stay silent. This affected the M2 capture screen too.

## Not tested

- A real camera, a real moving head, or any phone.
- A turned head: yaw handling is unit-tested on synthetic points only; the fake camera only moves the picture flat.
- Glasses on faces with glasses, beards, or other skin tones: the frame placement uses only eye, cheek and nose landmarks, but only one face has been tried.
- Frames at the face edge when a hijab hides the cheek outline: 234/454 then come from the model's guess. test1 looks right, one sample.
- Safari and Firefox.

