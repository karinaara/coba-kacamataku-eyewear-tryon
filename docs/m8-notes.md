# M8 notes: evaluation

**M8's "done when" is not met.** It asks for "a report with confusion matrix, stability, and user ratings is committed". Those figures need photos, labels and raters from real people, and none exist. I built every tool that turns that data into a trustworthy report, ran what could honestly be run, and wrote the protocol for the rest. No figure here is invented, and no synthetic data is presented as a result.

## What was built

- `src/eval/`: metrics (confusion matrix, top-1/top-2, Fleiss' kappa, pairwise agreement, majority vote, spread, flip rate, delta E, hue difference, seeded paired bootstrap), fixture and CSV parsers with precise errors, the five evaluations, the report writer, the tuner, the robustness summary, and the study trial builder.
- `scripts/eval/run.ts` (`npm run eval`): reads `fixtures/`, writes `docs/eval/report.md` and `report.json`. A file it cannot read stops the run and names the file.
- Pages: `/?collect` (fixtures and a robustness check), `/?study` (blinded rating screen), `/?perf` (cold load, model load, detection speed).
- `docs/eval/PROTOCOL.md` (consent, collection, labeling, study and tuning steps) and `fixtures/README.md`.
- Added dependency: `tsx` (dev only), to run the TypeScript runner.

## Design choices (made without asking)

- **A section below its minimum prints a banner, not a conclusion.** Minimums (30 faces, 10 captures, 3 conditions, 5 raters, a phone) are in `src/core/config/eval.ts`.
- **Accuracy is against the majority of three labelers; faces with no majority are left out and listed.** The report also shows how well a single labeler matches the majority and "matches at least one labeler", because face shape is a fuzzy call and a model cannot beat the labelers' own agreement.
- **The tuner never edits config.** It cross-validates (5 folds), compares the tuned setting with the current one **on faces held out of the fit**, and only advises a change with 30+ faces and at least a 5-point held-out gain. A test with random labels confirms it does not "find" improvement in noise.
- **The rating study ignores the participant's taste picks**, so "top 3" means the engine on shape, color and fit alone, and both arms use each style's suggested size so size cannot separate them. Participants are never told which frames are which.
- **Fixtures hold landmarks and a color summary, never a photo.** Exported files were checked to contain no image data.

## What was run, and what it shows

All on one real photo (test1). See `docs/eval/README.md` for the tables.

- **Robustness (16 image changes):** found a face every time; shape never changed; length/width std 0.008. Not the brief's stability test and a floor on the noise, not an estimate of it.
- **Exposure:** depth and undertone changed with brightness; confidence caught the brightening but not the x0.7 darkening.
- **Performance, one device (the app's browser pane):** 36 ms median detection, 13.9/s. Far lower than the 70 to 82/s seen in a normal Chrome window in M1, so unrepresentative. No phone.
- **Download size:** about 0.4 MB for the landing screen and about 7 MB more for the model and WebAssembly runtime.

## A fix found on the way

`scripts/copy-wasm.mjs` was copying the WebAssembly "module" variants (about 13.5 MB) that the app never loads. It now copies only the two it can use (deploy folder about 30 MB; most of that is the two WebAssembly runtimes, of which a browser fetches one), and the app was re-checked to still load its model and fetch only the SIMD file.

## Tests

270 in total (about 80 new): the statistics (including the textbook Fleiss' kappa example, 0.210), parsers and their error messages, each evaluation's arithmetic (for example 30 of 40 matching gives exactly 75%), the report text, the tuner (including no gain from random labels), the robustness summary, and the study (arms, blinding, reproducibility, CSV round trip).

The evaluator tests use faces made by stretching one real fixture. They check the sums, not the app's accuracy.

## What you need to do to finish M8

1. Read `docs/eval/PROTOCOL.md` and get consent.
2. Collect and label 30 to 50 faces; collect 10 captures of one person; three lighting conditions for a few people; 5 to 10 raters; a laptop and a low-end phone.
3. `npm run eval`, then read the data statuses first.
4. Only if the tuner advises it, apply a change by hand, and collect a fresh set to report accuracy.

## Open decisions

- **Preloading the model on the landing screen** would hide most of the 7 MB cold-start cost. Not done; say if you want it.
- **Thresholds for "enough data"** (30 / 10 / 3 / 5) follow the brief's ranges; raise them if you want stricter claims.
