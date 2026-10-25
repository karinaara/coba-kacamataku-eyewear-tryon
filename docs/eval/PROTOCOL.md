# Evaluation protocol

How to collect the data the evaluation needs, so the numbers mean something. Everything here is run by the people doing the study; the app only provides the tools (`?collect`, `?study`, `?perf`) and the report (`npm run eval`).

## 0. Consent and privacy first

Face landmarks describe a face, so treat every fixture as **biometric data** (UU PDP applies).

- Get **explicit, written consent** before taking or analyzing anyone's photo. Say what is kept (face landmarks and a small color summary), what is not kept (the photo itself: the tools never save it), who will see it, and that they can withdraw and have their files deleted.
- Identify people by a **code** (`p01`, `p02`), never a name. Keep the code-to-person list somewhere else, not in this folder.
- Do **not** publish or commit `fixtures/` to a public place. Share only the aggregate report.
- Suggested consent line: *"I agree that a computer program measures my face from a photo for a study of eyeglass suggestions. Only numbers describing my face shape and skin color are saved, not the photo, under a code and not my name. I can ask for them to be deleted at any time."*

## 1. Face shape against human labelers (target: 30 to 50 people, 3 labelers)

**People.** Aim for variety that matches who the app is for: a range of skin tones, with and without head coverings, different ages, with and without glasses. A set of 40 near-identical faces says little. Note which groups are thin.

**Photos.** Front-facing, neutral mouth, eyes open, even daylight or lamp light, hair off the forehead where the person is comfortable, at arm's length. One photo per person.

**Collect.** Open `http://localhost:5173/?collect`, leave **Person** and **Lighting condition** empty, choose the photos, then **Save all fixtures**. Each file is named after the photo (rename photos to codes first). Put the files in `fixtures/faceshape/`.

**Label.** Three people label **independently**, from the photo only. They must **not** see the app's answer, and must not talk to each other until all are done. Each picks the single best of: oval, round, square, oblong, heart, diamond. Use `fixtures/faceshape/labels.csv`:

```
id,labeler1,labeler2,labeler3
p01,oval,oval,round
p02,heart,heart,heart
```

(The three should be different people, ideally not the product owner for all three.)

**Short descriptions for labelers** (commonly used; adjust only if all labelers agree to):
- **Oval:** longer than wide, forehead a little wider than the jaw, softly rounded chin.
- **Round:** about as long as wide, full cheeks, soft jaw and chin.
- **Square:** about as long as wide, forehead and jaw similar in width, strong angular jaw.
- **Oblong:** clearly long, forehead, cheeks and jaw similar in width.
- **Heart:** wide forehead, narrow pointed chin.
- **Diamond:** narrow forehead and jaw, widest at the cheekbones, pointed chin.

**What you will get:** top-1 and top-2 accuracy against the majority label, a confusion matrix, per-shape precision and recall, and how much the labelers agree with each other (Fleiss' kappa). Expect real disagreement between labelers. That is normal, and it limits how high any score can go.

## 2. Measurement stability (same person, 10 captures)

One person, 10 separate captures, over about 15 minutes. Between captures: put the phone down and pick it up, re-seat, let the expression reset, touch the hair, change distance a little (within what the quality gate accepts).

Open `?collect`, fill **Person** only (for example `p01`), choose the 10 photos, save into `fixtures/stability/p01/`. More than one person is better.

You get the spread of each ratio (std and coefficient of variation) and how often the primary shape flips between captures.

## 3. Color stability across lighting

Same person, same phone, three conditions: **daylight** (near a window, no direct sun), **indoor-warm** (yellow bulb), **indoor-cool** (white LED). No makeup changes between shots.

Open `?collect`, fill **Person** and **Lighting condition** (type exactly `daylight`, `indoor-warm`, `indoor-cool`), choose the photo, save into `fixtures/color/p01/`. Repeat for more people, especially medium to deep skin tones, where heuristics drift most.

You get the skin color shift (delta E) and hue shift against daylight, whether the undertone flipped, and whether confidence dropped when the color moved.

## 4. "Does this frame suit me?" (5 to 10 people)

Each person uses **their own photo**. Open `http://localhost:5173/?study`, the person takes or uploads a photo, continues to the try-on screen, and taps **Rate these frames (study)**. They enter their code and rate six frames from 1 to 5: three of the app's top picks and three random ones, shuffled. They are not told which is which. Do not coach.

At the end **Save ratings CSV** and put the file in `fixtures/ratings/`. The study ignores their taste picks, so the "top three" reflect the engine on shape, color and fit only.

You get the mean rating of the top picks vs random frames, a 95% interval from resampling participants, and how many people rated the top picks higher.

## 5. Performance

Open `http://localhost:5173/?perf` on **a laptop in a normal browser window** and on **a low-end Android phone** (over your deployed or LAN address; the camera needs HTTPS or localhost). Name the device, choose camera, **Run measurement**, **Save result JSON** into `fixtures/perf/`. Close other apps; note battery saver in the note field.

## 6. Run the report

```bash
npm run eval
```

Writes `docs/eval/report.md` and `report.json`. Every section opens with a data status. Minimums before a section counts: 30 labeled faces, 10 captures of one person, 3 lighting conditions, 5 raters who rated both arms, and a phone measurement. **Do not quote a section marked "No data yet" or "Not enough data".**

## 7. Tuning, and what not to claim

The report ends with a tuning section. It searches hairline extension, softmax temperature, feature spread and chin weight, and measures the gain on faces **held out of the fit** (5-fold). It never edits config. It only advises a change if there are 30+ labeled faces and the held-out gain is at least 5 points. If it does, apply the change by hand and commit a note like:

> Tuned `MEASURE.hairlineExtension` 1.15 to 1.20 on 42 labeled faces (3 labelers, kappa 0.52): held-out top-1 61% to 68%. Data: fixtures/faceshape as of 2026-xx-xx.

Then **collect a fresh set** to report accuracy. Do not report a tuned setting's accuracy on the faces it was tuned on.
