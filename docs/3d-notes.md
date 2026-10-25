# 3D try-on (stretch after M9)

Turn it on with the **3D view (beta)** checkbox on the try-on screen. It is off by default and the choice is remembered on the device (`kacamata.view3d.v1`, a yes/no). The flat 2D view is unchanged and stays the default.

## What it does

- **Procedural 3D frames, no model files.** `src/frames3d/model.ts` builds rims, lenses, bridge, brow bars and temples from the same style, color and lens tint the 2D generator uses (all 16 styles, all 5 materials; the tortoise pattern is generated in code). Real width in mm is the same ruler input as the 2D fit.
- **Head pose from the landmarks.** `src/core/headPose3d.ts` builds the head's sideways, up and forward axes from eye corners, chin and the top of the face mesh. No matrix conventions involved. On the one real photo we have, it agrees with MediaPipe's own transformation matrix within about 2 degrees (yaw -1.2 vs -1.9, roll 2.7 vs 3.0; pitch magnitude 9.9 vs 8.0; the two sign conventions differ).
- **Occluders.** Two invisible depth-only meshes hide what is behind the head: the face mesh from the live landmarks (pushed back so the cheeks do not cut the rims) and a skull ellipsoid (narrower than the face on purpose, so the near temple stays visible). Triangles are recovered from the library's tessellation edges (`trianglesFromEdges`, tested against the real constant).
- **Same size and position as 2D.** `computeFit` (iris ruler, bridge weight) gives the size and the in-plane spot; the 3D model turns by itself, so yaw is not fed into it twice.
- **Loaded on demand.** three.js lives in its own chunk (about 578 kB, 147 kB gzipped), fetched only when 3D is turned on, then cached for offline use (`three-chunk-v1`). The main bundle and the precache (877 KiB) are unchanged.
- **Fallback.** If WebGL or the chunk fails, the app says so and goes back to the flat view.
- The share card still uses the 2D renderer.

All tunables (offsets, skull size, smoothing, lens opacity, temple length) are in `src/core/config/tryon3d.ts`.

## What was checked

| Check | Result |
|---|---|
| Unit tests | 301 passing (19 new): head axes from synthetic yaw/pitch/roll, smoothing, tessellation to triangles, outline offsets, all 16 styles x 5 materials build without NaN, at about the real width, symmetric, temples run back |
| Real face, frontal, in the app (headless Chrome, upload and live fake camera built from `test1.jpg`) | The frame renders in 3D in both modes, and the camera is found as a face. `docs/3d/app-photo-3d.png`, `docs/3d/app-live-3d-fake-camera.png` |
| Head turns | Only **synthetic**: the saved real landmarks were rotated in code (-30, +30, 55 degrees) and the frame followed. The far temple hid and the near one showed. The photo does not turn, so only the frame and occluders are being judged. `docs/3d/synthetic-yaw-*.png`. Open `?three` on the dev server to repeat it |
| Production build | 3D works from the built app, the chunk is not loaded until 3D is turned on, the dev page is not in the build |

## Not checked

- **No real head turns.** Nobody has tested it with a real person turning their head, on a real camera. The occluder and skull sizes were tuned by eye on one face (a hijab wearer, so hair and ears are not visible in the photo).
- **No real-device speed.** Headless Chrome with software rendering ran at about 7 to 8 frames a second with either 2D or 3D (dominated by face detection on the CPU), which says nothing about phones. Battery and heat are unknown.
- **Pitch and roll** were checked on the one frontal photo (which has about 10 degrees of downward pitch) and in unit tests, not by eye at big angles.
- **Looks:** no shadows on the face, lenses are flat tinted glass (the brown gradient tint is a single opacity here), and the transparent materials are an approximation. Perspective is orthographic.
- **Frame width vs. head width** at the temples depends on the iris ruler (about +/-8% person to person).
- Only one face, one lighting condition, one device.

## Open decisions for you

1. Should 3D become the default once it has been tried on real phones? For now it is opt-in.
2. `frontOffsetMm` (11), `faceMeshBackMm` (14) and the skull radii are starting values. They need real head-turn footage to settle.
