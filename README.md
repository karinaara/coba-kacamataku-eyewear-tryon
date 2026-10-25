# coba-kacamataku

A web app that tells you which **glasses shapes** and **frame colors** suit your face, then lets you try them on live. Everything runs in the browser: **your photo never leaves your device**, and nothing is uploaded or stored.

It estimates face shape and skin tone from one photo, ranks 16 frame styles and 28 colors with plain-language reasons, and draws the frames on your face. Results are **style suggestions, not rules**.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm test` | unit tests (Vitest) |
| `npm run typecheck` / `npm run typecheck:scripts` | type checks (app / evaluation runner) |
| `npm run lint` | lint |
| `npm run build` | production build |
| `npm run eval` | evaluation report from `fixtures/` (see below) |

Developer pages (add to the address): `/?gallery` all 5,376 frames, `/?collect` evaluation fixtures, `/?study` rating study, `/?perf` performance, `/?photo=<url>` landmark overlay.

The camera needs `localhost` or HTTPS.

## How it works

Selfie, or upload, goes through: face landmarks (MediaPipe, local model) &rarr; quality gate &rarr; median of about 20 frames &rarr; measurements and a soft face-shape classifier &rarr; skin color and undertone with a confidence &rarr; rule-based frame ranking with reasons &rarr; live try-on with One Euro smoothing. The logic is pure TypeScript in `src/core/`; every tunable number is in `src/core/config/`.

The optional 3D try-on (three.js, procedural frames, loaded only when turned on) is described in `docs/3d-notes.md`.

Milestone notes, with decisions, what was tested and what was not, are in `docs/`: `m2-validation.md`, `m3-notes.md` ... `m7-notes.md`, and `docs/eval/`.

## Evaluation status: read this before quoting any number

**The accuracy of the face-shape classifier, the stability of repeat captures, the color results across lighting, and whether people like the suggestions have not been measured.** Those need data from real, consenting people (30 to 50 labeled faces with three independent labelers, 10 captures of one person, 5 to 10 raters). The tools and the protocol are built; the data does not exist yet. Details and the few real measurements that were possible are in [docs/eval/README.md](docs/eval/README.md); the live report is [docs/eval/report.md](docs/eval/report.md).

What is known:

- Measurements and shape are very steady for one photo re-processed 16 ways (length/width varied by 0.6%; the shape never changed).
- Skin **depth and undertone depend on exposure**: the same photo 30% brighter or darker changed them. Confidence catches only some of it.
- Frame **sizes come from the iris used as a ruler and are good to about 10%**.
- Face-shape percentages are not calibrated. A face that looks rounder than "oval" to the eye can still score near-perfect oval.
- Performance on a phone has not been measured.

## Deploy

The build is static (`dist/`). Nothing has been deployed yet; pick one:

- **Netlify:** import the repo; `netlify.toml` sets the build command, output folder and cache headers.
- **Vercel:** import the repo; `vercel.json` does the same.
- **GitHub Pages:** push to `main` with Pages set to "GitHub Actions"; `.github/workflows/pages.yml` builds with `BASE_PATH=/<repo-name>/`. For a project site, build locally with `BASE_PATH=/<repo-name>/ npm run build`.

The camera needs HTTPS (all three give you that). After deploying, open the URL on a phone, check the camera, and use Lighthouse on the live URL. See `docs/m9-notes.md` for what was and was not measured.

## Privacy

On-device processing only; no uploads, no analytics, no photo storage. Optional style picks (a chip and likes) can be remembered in the browser if you turn it on, and contain no face data. Evaluation fixtures hold face landmarks and must be handled as biometric data: see [docs/eval/PROTOCOL.md](docs/eval/PROTOCOL.md).

## Known gaps

- The default try-on draws flat front-view frames with stub temples. An opt-in **3D view (beta)** (see `docs/3d-notes.md`) turns the frame with the head and hides the far arm, but has only been checked on one real frontal face and on synthetic head turns, not with a real person turning on a real phone.
- Tested on one real person's photo (a hijab wearer, medium-tan skin) and a simulated camera. Other skin tones, glasses, beards and phones are untested.
- Not deployed yet and not tried on a real phone (see `docs/m9-notes.md`).
