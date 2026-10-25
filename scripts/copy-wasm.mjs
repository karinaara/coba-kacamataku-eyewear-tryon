// Copies the MediaPipe WASM runtime into public/wasm so the app has no CDN dependency at runtime.
//
// Only the variants this app can load are copied. FilesetResolver.forVisionTasks() without `useModule`
// picks vision_wasm_internal (SIMD) or vision_wasm_nosimd_internal. The *_module_* files are for the
// ES-module loader, which is not used; copying them added about 13.5 MB to every deploy.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'

const src = 'node_modules/@mediapipe/tasks-vision/wasm'
const dest = 'public/wasm'

if (!existsSync(src)) {
  console.error(`[copy-wasm] ${src} not found. Run "npm install" first.`)
  process.exit(1)
}
rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true, filter: (from) => !/_module_/.test(from) })
console.log(`[copy-wasm] ${src} -> ${dest}: ${readdirSync(dest).join(', ')}`)
