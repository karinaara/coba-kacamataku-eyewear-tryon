# M6 notes: color analysis

Reach it from the Try on screen: "Your colors" card, then "See details". Everything is a **starting value**; nothing is calibrated on labeled photos (that is M8).

## What it reads

- **Skin:** both cheeks and the forehead (same regions as the quality gate, shrunk to 80%). Pixels are converted to CIELAB and kept only inside a skin chroma window; the darkest 20% (shadow) and brightest 10% (specular) are dropped; each region's median is combined weighted by pixel count. The forehead only counts where it looks like the cheeks, so hair or fabric drops out.
- **Depth:** ITA = atan2(L* - 50, b*) in degrees, bands from the brief (very light above 55, light 41 to 55, medium 28 to 41, tan 10 to 28, brown -30 to 10, deep below -30).
- **Undertone:** hue h = atan2(b*, a*). Below 49 degrees = cool, above 58 = warm, between = neutral, mapped to a 0..1 warmth bar (42 to 66 degrees). A label within 40% of a band edge is shown as "cool, close to neutral" etc.
- **Hair:** a box just above the mesh top, aligned to the eye line. Skipped if it looks like skin (bald or short hair), or if the user ticks "I wear a head covering".
- **Eyes:** iris ring (45 to 90% of the iris radius, catchlights and pupil edge trimmed) and the brightest 40% of the eye opening outside the iris as eye white.
- **Contrast:** |skin L* - hair L*| weighted 70/30 with the eye difference. Low under 20, high from 35.
- **Confidence (0 to 1, High 0.7+, Medium 0.45+):** the product of six factors: cheek lighting, clipped/crushed pixels, left/right cheek agreement, colour cast seen in the eye white, glasses, and number of skin pixels read. Shown with plain-language reasons.
- **Confirm your undertone:** three questions (wrist veins, jewelry, sun). Answers are blended with the photo: weight = 1 - confidence, kept between 25% and 80%, scaled by how many were answered. Offered open when confidence is under 0.6, otherwise available under "Refine".

## What was run: test1.jpg at different exposures and tints, in the real app

| Variant | Confidence | Depth | Undertone | Notes |
|---|---|---|---|---|
| Original | High 94% | Tan | cool, hue 47.5 (1.5 degrees from the neutral edge) | |
| Darker x0.8 | High 99% | Brown | cool | depth already shifted |
| Darker x0.6 | High 75% | Deep | cool | |
| Darker x0.45 | Low 43% | Deep | cool | |
| Darker x0.3 | Low 28% | Deep | cool | hair box then looked skin-like (before the threshold was tightened) |
| Brighter x1.4 | Low 20% | Medium | neutral | cheeks lit unevenly (delta L* 20.7) |
| Brighter x1.9 | Low 28% | Light | neutral | |
| Orange tint | Medium 63% | Brown | neutral (hue +8) | cast 15.1 detected |
| Blue tint | Medium 52% | Deep | cool (hue -18) | cast 15.8 detected |

So low light, over-exposure, uneven light and a colour cast all lower confidence as intended.

## Limits to know about

- **Depth follows exposure.** A 20% darker copy of the same photo moved Tan to Brown while still reporting High confidence. Confidence only catches lighting that is far outside the good range. A phone photo cannot give absolute skin depth without a white reference we trust.
- **Undertone is fragile.** A tint moves the hue by 8 to 18 degrees, wider than the whole neutral band. Confidence drops to Medium in those cases, not Low.
- **The hue bands are guesses.** Your test1 sits 1.5 degrees from a band edge, which is why it reads "cool, close to neutral". With different bands it could be neutral.
- **A hijab is read as hair** unless "I wear a head covering" is ticked. On test1 that changes contrast from Medium (hijab fabric vs skin) to High (eyes vs skin). There is no automatic detection.
- **Sclera correction exists but is OFF** (`COLOR.correction.strength = 0`). The eye white sits in the eyelid's shadow and has its own tint. On the tinted copies it points the right way (warm tint: cast +13.7 b*, hue +8; cool tint: -15.7 b*, hue -18) but one photo is not validation. Turn it on in `src/core/config/color.ts` once real photos support it.
- **Black hair on deep skin** is the pairing most at risk of being mistaken for a bald scalp. The cutoff was tightened to 9 (Lab distance) and a synthetic test covers it; no real deep-skin photo has been tried.

## Bug found and fixed on the way

On the three questions, a fast second tap overwrote the first answer (each button built the new answers from a stale copy). Answers now merge into the latest state.

## Not tested

- A real camera capture through the color path (it is the same snapshot the quality gate uses, but not exercised live).
- Any skin tone other than test1's; beards, glasses, makeup, children.
- Hair of other colors on a real face. Only synthetic painted hair and the hijab fabric in test1.
