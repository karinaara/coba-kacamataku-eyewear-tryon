# M4 notes: frame generator

Open the gallery with `npm run dev`, then http://localhost:5173/?gallery

## Numbers (browser pane, one run)

| Check | Result |
|---|---|
| Frames in the catalog | 5,376 (16 styles x 28 colors x 3 sizes x 4 lens tints) |
| Distinct pictures | 1,792 (S/M/L draw identically; size only changes how the frame is fitted) |
| Generated without error | 5,376 / 5,376 |
| Decoded as a real image in the browser | 1,792 / 1,792, 0 failures |
| Generate one SVG, average | 0.040 ms |
| Cached frame drawn to a canvas | 0.011 ms (cache lookup 0.0016 ms) |
| First rasterization of an uncached frame | about 23 ms each when all 1,792 were pushed through (42 s total, 6 at a time). The "139.7 ms" in the on-screen report is per-frame latency while 6 were queued, in a throttled pane, so it overstates the cost of one. |

So the "under 5 ms after cache" target is met. **The first time a frame is shown it is not**: expect a tens-of-milliseconds hitch. M5 should prefetch the next and previous carousel frames.

In unit tests every distinct picture also passes a well-formedness check (balanced tags, unique ids, every `url(#id)` resolves, no NaN/undefined) and all 1,792 differ from each other.

## Decisions made without asking

- **Style dimensions** are mm-like units (like "52-18" frame sizing) rather than "face-width units"; the generator rescales every frame front to 1000 units, so only proportions matter. Same result, easier to reason about.
- **Any color on any style.** A style's `builds` (acetate / metal / mixed) says what it is naturally made of but does not restrict colors, otherwise the catalog would be well under 5,000. A metal color on an acetate style is drawn as a metallic-finish rim, an acetate color on a metal style as thin enameled wire.
- **Sizes share one picture.** S/M/L carry `fitFactor` 0.94 / 1.0 / 1.06 for the try-on (M5). The raster cache key leaves size out.
- **Two-tone (browline only):** the chosen color on the brow bar, with a gold lower rim for warm colors and silver for the rest.
- **Temperature:** hue 28 to 115 degrees is warm, low chroma (under 12) is neutral, everything else cool. By that rule gunmetal and slate come out neutral, not cool. Rose Gold, Burgundy and Blush are the borderline hues; check the gallery table before M7 uses them.
- **Family mapping for M7's compatibility matrix** is in `config/frames.ts` (for example butterfly and shield-lite map to "oversized", half-rim to "rectangle", rimless to "oval", wellington to "wayfarer").
- **Raster cache:** 64 bitmaps at 640 px wide, least recently used out. 5,376 bitmaps would not fit in memory.

## Not done / not tested

- Frames have only been looked at as flat front views. Fit on a face, roll and yaw are M5.
- Temples are short front-view stubs only; they are not meant to look right from the side.
- Half-rim, rimless and clear lenses are subtle on a light background by design; check them on a real face in M5.
- The look is my judgment of what reads as each style. No one with eyewear expertise has reviewed the proportions.
- Not tested on a phone or in Safari/Firefox (only the Chromium browser pane). SVG-to-bitmap decoding differs between browsers.
