# M7 notes: recommendation engine

Everything is rule based and every number is a **starting value** in `src/core/config/recommend.ts`. The shape x frame matrix is the brief's; the rest are my guesses. None of it has been checked against real people's ratings (that is M8).

## How a frame is scored

`total = 0.4 * shape + 0.3 * color + 0.2 * fit + 0.1 * taste` (weights from the brief). Colors do not interact with styles, so a **style** is ranked on shape, fit and taste, a **color** on skin and eye/hair harmony, and a **(style, color) pair** combines all four.

- **Shape:** sum over the six face shapes of P(shape) x the brief's compatibility matrix, plus two small named rules: taller lenses help an oblong face (up to +0.10 x P(oblong)), and lenses as wide at the bottom as the top lose up to 0.08 x P(heart).
- **Color:** four parts, weighted 45 / 25 / 15 / 15:
  - undertone vs the frame's warm/cool/neutral (metals and neutrals get +0.05 as safe choices; a shaky "close to neutral" label hedges 40% toward its neighbour);
  - lightness gap to your skin (invisible under 6 L*, clear from 22; see-through frames count half);
  - chroma vs your contrast level (low contrast dislikes vivid colors);
  - harmony with hair and eyes (a bonus for echoing them or for a clean lightness gap from the hair).
  Then it is **flattened toward 0.55 by the photo's confidence** (never below 25%), so a shaky reading keeps the palette broad.
- **Fit:** frame width (mm x size) / cheekbone width, ideal 0.96 with a 6% tolerance, falling off smoothly to a floor; plus whether the lens centers line up with your pupils. The best of S / M / L is suggested (M wins ties).
- **Taste:** a Minimal / Classic / Bold chip and like / dislike taps. A like is +0.20 on the style (+0.08 spill on same-family styles) and +0.15 on the color, capped at +/-0.40 and +/-0.30, so a few taps never decide everything.

Every part that mattered writes a plain sentence. Reasons and cautions appear on the Try on screen (for the current frame), on Why this? (top 3 frames, best colors, what to avoid), and under "Might not suit you".

## What was run (your photo through the real app)

Ranking order of the 16 styles:

| Taste chip | Order |
|---|---|
| Any | Rimless, Oval, Wellington, Wayfarer, Square, Browline, Half-rim, Round, Panto, Cat-eye, Rectangle, Aviator, Shield lite, Octagon, Hexagon, Butterfly |
| Bold | Oval, Wellington, Rimless, Wayfarer, **Cat-eye**, Square, **Shield lite**, ..., Round, Panto, Rectangle, Butterfly |
| Minimal | Rimless, Oval, **Half-rim**, Wellington, Round, ..., Cat-eye, Octagon, Hexagon, Shield lite, Butterfly |

Choosing Any again restores the first order exactly. Best colors (starred) by input:

| Photo | Skin read | Best colors |
|---|---|---|
| Original | Tan, cool-to-neutral, High | Jet Black, Charcoal, Silver, Blush, Gunmetal |
| Warm tint | Brown, neutral, Medium | Jet Black, Silver, Crystal Clear, Charcoal, Chocolate |
| Cool tint | Deep, cool, Medium | Sage, Blush, Clear Pink, Clear Blue, Navy |
| Very dark | Deep, close to neutral, Low | Crystal Clear, Silver, Sage, Blush, Clear Pink (with a "kept broad" note) |

Also checked in the browser: selection (style, color, size) survives a trip to Why this?; nothing is written to storage until "Remember my picks" is on, and what is written is only style/color ids and small numbers; turning it off erases it; picks come back after a reload.

Tests (199 in total): 40 for the engine and 6 for preferences cover face shape moving the ranking (round favors angular, oblong favors oversized, square favors soft), undertone, skin depth, chroma, harmony, confidence flattening, fit and size choice (narrow face S, wide face L, smooth fall-off), taste caps and family spill, avoid lists, and reason text.

## A change to M5 you should know about

To make fit meaningful, frames now have **real widths** (from the style's mm dimensions: 117 mm for Round up to 145 mm for Butterfly) and are sized on screen using the **iris as a ruler** (11.7 mm). In M5 every frame was exactly as wide as the cheekbones, which would have made the fit score always 0.94, 1.0 or 1.06 and tell you nothing. The cheekbone rule is still the fallback when the iris is under 5 px.

## Limits to know about

- **The iris ruler is only good to about +/-10%** (people's irises vary by about 8%), which is wider than the 6% step between sizes. Your photo reads as a 115 mm face (about 10% under a typical adult female average), so **15 of 16 styles get "Small"**. I cannot tell from one photo whether your face is small or the ruler reads small. If sizes feel wrong on real faces, `FIT.irisMm` and `RECOMMEND.fit.idealRatio` are the two numbers to tune.
- **The heart-face rule follows the brief literally** (wide-bottomed lenses lose points). Common styling advice for heart faces is the opposite (bottom-heavy frames balance a wide forehead). It is one small number (`rules.bottomHeavy.strength`); set it to 0 to switch it off.
- **Clear and translucent frames rank well for neutral, tan skin** (low chroma, "neutral" temperature, safe bonus). The engine knows nothing about how see-through frames actually look on skin.
- **Taste starts with no data.** The tags that call a style minimal, classic or bold are my judgment.
- Not tested: other faces, a deep-skin photo, a live-camera run through the new screen, a phone.
