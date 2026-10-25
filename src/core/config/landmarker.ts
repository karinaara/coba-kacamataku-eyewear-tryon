// [tune] FaceLandmarker setup. Files are served from /public so the app works offline. Paths are relative to the site's base URL (see camera/landmarker.ts), so a subpath deploy such as GitHub Pages works.

export const LANDMARKER = {
  wasmPath: 'wasm',
  modelPath: 'models/face_landmarker.task',
  numFaces: 1,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  outputFacialTransformationMatrixes: true,
  outputFaceBlendshapes: false,
  // M1 acceptance target: landmarks track a live face at >= this on a laptop.
  targetFps: 20,
  // Lite mode caps analysis at 15 fps (see camera.ts), so it is judged against a lower bar.
  liteTargetFps: 13,
}

export const LANDMARK_COUNT = 478
