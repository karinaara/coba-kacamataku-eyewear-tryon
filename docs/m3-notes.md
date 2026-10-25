# M3 notes: measurements and face shape

Everything here is a starting value. No labeled photos exist yet, so **nothing in M3 is validated for accuracy** (that is M8).

## What test1 produced (one person, hijab; regression value, not a claim)

| Quantity | Value |
|---|---|
| Length / width (with 15% hairline estimate; 1.21 without) | 1.39 |
| Forehead / cheekbones | 0.88 |
| Jaw / cheekbones | 0.78 |
| Chin angle | 110 degrees |
| Jaw sharpest turn | 20.5 degrees |
| Result | Oval 89%, Round 8%, Oblong 2%, Heart 1% |

## Decisions made without asking (all in `src/core/config/`)

- `hairlineExtension = 1.15` (measure.ts): one global guess. Landmark 10 is below the hairline; with a hijab the hairline is not visible at all. Length is the least certain number.
- `jawAngularity` is the **sharpest single turn** along the jaw outline (degrees, higher = more angular), not the brief's "straightness / low curvature". Reason: total curvature between the jaw angle and the chin is set by the end directions, so a round and a square jaw score about the same; only the concentration of the turn tells them apart. Needs checking against real jaws.
- Chin categories are soft ramps from `chinAngle` and `jawAngularity` (`CHIN_MODEL`). "Mixed" is `(1 - strongest) * 1.5`. The ramp endpoints (95/110 degrees, 25/45 degrees) are guesses.
- Softmax temperature 1.5, sigmas 0.12 / 0.06 / 0.07, chin weight 0.6. These control how confident the percentages look. They were not fitted to anything.
- Pose normalization: roll is taken from the iris line and rotated out; x is stretched by 1/cos(yaw), y by 1/cos(pitch). No depth (z). Only valid for the small angles the quality gate allows. Roll correction only matters for the yaw stretch, because distances are rotation-invariant.

## Tested

- Pose normalization: ratios recovered within 0.01 after re-projecting the real fixture with 20 degrees of roll, 20 degrees of yaw, and both together.
- Classifier: each perfect prototype ranks first; probabilities sum to 1; a face midway between shapes splits the probability; longer faces move toward oblong; narrower jaws move toward heart.
- End to end in the browser pane: upload, Continue, Analyzing (4 lines revealed), Result, Why this?

## Not tested

- Any labeled face. Only one real person is in the fixtures, with no label.
- Live camera through the new screens (the M2 capture flow feeds the same path, and was exercised with a fake camera).
- Dark skin, beards, glasses, hair covering the face edge, children.
- Whether 89% is a sensible confidence. A face that looks rounder than "Oval" to the eye still got 89%, so the spread parameters are probably too tight. Calibrate in M8.
