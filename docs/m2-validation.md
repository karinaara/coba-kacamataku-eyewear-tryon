# M2 validation notes

What was actually run, and what was not. Thresholds live in `src/core/config/quality.ts` and `capture.ts`; all are starting values.

## Run on test1.jpg (one person, hijab, hard shadow across one cheek)

Upload path (`analyzeImageFile`), gate in "upload" mode (warns only):

| Input | Result |
|---|---|
| Original | Lighting uneven (left/right delta L* 17.5, limit 12). Everything else passes. Forehead skin ratio 0.77 (limit 0.70). |
| Brightness x0.3 | "Too dark" (cheek L* 18.8). |
| Brightness x2.2 | "Too bright" (cheek L* 87.6). |
| Orange multiply tint | Color-cast warning (chroma 41.8, limit 15). |
| Rotated 25 degrees | Roll reads -22.0 vs 3.0 originally: a 25.0 degree shift, so the pose math is right. Tilt warning. |
| Dark rectangle over forehead | Forehead skin ratio 0.17, warning. |

Pose of the unmodified photo: yaw -1.9, pitch 8.0, roll 3.0 degrees.

Camera path (`useCapture`) was exercised with a **fake camera**: a canvas stream playing the same photo, because the in-app browser has no camera.

- Gate stays red while lighting is uneven; auto-capture never starts. "Capture anyway" forces it.
- Gate green: 0.5 s hold, 3-2-1 countdown, 20 frames, median. Result: "Median of 20 frames (0 rejected)".
- Gate turned red during the countdown: countdown cancelled, restarted from 3 after the gate recovered.
- Timeout path: with the pane throttled to about 3.5 animation frames/s only 4 frames were collected and the retry message appeared.

## Not tested

- A real camera in M2's capture flow (the M1 overlay was checked live; the M2 gate and countdown were not).
- Real blinks and head turns during the 20-frame window. The outlier filter has unit tests with synthetic noise only.
- Glasses detection. `glasses.maxEdgeEnergy` is uncalibrated: test1 reads 0.026 with no glasses; no sample with glasses exists yet.
- Color-cast threshold on real mixed lighting (only a synthetic tint).
- Dark and very dark skin. Only one skin tone has been used.
- Phones.

## Things to know

- The forehead check compares forehead pixels to the cheek median in Lab, so it is relative to the person's own skin. It misfired on the over-exposed and tinted copies of test1 (ratio 0.49 and 0.45) because those shift forehead and cheeks differently.
- With a hijab the forehead sampling area can touch fabric. test1 passes at 0.77, which is close to the 0.70 limit.
- Sampling areas are shrunk to 0.8 of their landmark hull (`QUALITY.roiScale`) so they stay off the face edge.
- The mouth check uses inner-lip gap / face height (the brief's "mouth ratio" was undefined).
