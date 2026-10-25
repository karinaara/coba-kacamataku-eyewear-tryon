# M9 notes: share card, polish, PWA, deploy

## What was built

- **Share card** (`src/core/share.ts`, `src/camera/shareCard.ts`, `src/ui/ShareScreen.tsx`): 1080 x 1920 image made on the device. It has a nickname per face shape (`NICKNAME` in `src/core/config/share.ts`), a "X-Y Blend" nickname when the face sits between two shapes, the top three frames, and alt text. "Include my photo" is on by default; with it off the card shows the frame alone and no face. Save or Share only happens when the user taps. Samples: `docs/m9/share-card-with-photo.png`, `docs/m9/share-card-no-photo.png`.
- **Loading and error states**: model-loading overlay, "Try loading again" for model errors, an error boundary (`src/ui/ErrorBoundary.tsx`) that logs to the console only.
- **Lite mode**: 640 x 480 camera, 15 fps cap. Saved in localStorage (`kacamata.lite.v1`), on by default for saveData or low-memory devices. A slow-device hint offers it when the live preview drops under 12 fps for 3 s (`SLOW_DEVICE` in `src/core/config/camera.ts`).
- **PWA** (`vite-plugin-pwa`): app shell precached (26 entries, about 873 KiB). The face model and WebAssembly runtime (about 17 MB together) are cached the first time they are used (`ml-assets-v1`), and prefetched at low priority on the landing page unless saveData or a 2g/3g connection is reported.
- **Deploy configs**: `netlify.toml` and `vercel.json`. (A GitHub Pages workflow was also written, then removed: Pages is not available for this private repo, and the site is on Netlify.) At the time of writing this note nothing was deployed; the site is now live on Netlify.

## Measured

| Check | Result | How |
|---|---|---|
| Lighthouse mobile, landing page | performance 95, accessibility 100, best practices 100, SEO 91 (before adding `robots.txt`; the only failed SEO audit was `robots.txt`) | Lighthouse via `npx`, headless Chrome, against `vite preview` on localhost. Reports in `docs/m9/lighthouse-mobile.report.*` |
| axe-core (WCAG 2.0/2.1 A and AA plus best practice) | 0 violations on landing, captured, result/try-on, "Why this?", "See details", share | Headless Chrome at 390 px wide |
| Offline | Service worker activates, page is controlled. After one online analysis the model and wasm are in `ml-assets-v1` (3 entries). With the network emulated off, the app reloads and finishes the face analysis with the same result | Puppeteer + Chrome DevTools offline emulation |
| Unit tests | 282 passing | `npm test` |
| typecheck, typecheck:scripts, lint, build | pass | |

## Not measured / not done

- **No live URL.** Deploying needs your account (Vercel, Netlify or GitHub). Steps are in the README.
- **No real mid-range phone test.** Lighthouse's mobile mode is a simulated slow CPU and network on a desktop, not a device. The brief's "works on a mid-range phone" is unverified.
- Lighthouse was run on the landing page only. Performance of the camera and try-on screens is not covered by it (see `docs/m8-notes.md` for the single desktop frame-rate measurement).
- Axe does not cover the live camera screen (no camera in headless Chrome) or the "Your colors" screen, and automated checks catch only part of accessibility problems. No screen reader or keyboard-only pass was done by a person.
- The offline test used DevTools offline emulation, not a stopped server or airplane mode. A first visit still needs a network connection (the model is cached on first use).
- The in-app browser pane in Claude cannot register service workers, so PWA checks were done in headless Chrome.
- Installability on a phone (Add to Home Screen) is untested; the manifest and icons are in place.

## Open from earlier milestones

M8 still needs real labeled data (30 labeled faces, 10 captures, 3 lighting conditions, 5 raters, 2 devices); `npm run eval` reports "no data" until then. Open decisions: the heart-face rule, the iris ruler constant (`FIT.irisMm`, `idealRatio`), and the "enough data" thresholds.
