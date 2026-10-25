# Evaluation report

Generated 2026-10-25 by `npm run eval`. Fixtures hold landmarks only, never photos.

Each section opens with a data status. **A section marked "No data yet" or "Not enough data" is not a result**, and its numbers (if any) should not be quoted.

## 1. Face shape against human labelers

> **No data yet.** No faces with a labeler majority yet. Needs at least 30.

## 2. Measurement stability (same person, repeated captures)

> **No data yet.** No captures of one person yet. Needs at least 10.

## 3. Color stability across lighting

> **No data yet.** No lighting conditions for one person yet. Needs at least 3.

## 4. "Does this frame suit me?" (top 3 vs 3 random)

> **No data yet.** No participants who rated both arms yet. Needs at least 5.

## 5. Performance

> **Not enough data to draw conclusions.** Only 1 device measured so far; needs at least 2. Numbers below are shown for completeness, not as a result.

| Device | Kind | Load to landing | Model load (cold / warm) | First detection | Detection ms (median / p95) | Detections per second (headroom) | Delegate |
|---|---|---|---|---|---|---|---|
| Desktop PC, Claude app browser pane (Chromium) | laptop | n/a | 378 ms / 365 ms | 2187 ms | 36.3 / 57.1 | 13.9 (28) | GPU |

- Desktop PC, Claude app browser pane (Chromium): Measured in the Claude desktop app browser pane (an embedded Chromium that throttles timers and may use software rendering), on a steady 30 fps photo source. Conservative: the same machine showed 70-82 detections per second in a normal Chrome window in M1. Re-run in a normal browser and on a phone.

## Tuning

> **No labeled faces, so nothing was tuned.** The config values are the brief's starting values.
