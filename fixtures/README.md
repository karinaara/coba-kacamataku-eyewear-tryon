# Fixtures

Inputs for `npm run eval`. Read `docs/eval/PROTOCOL.md` before adding anything: these files describe real people's faces.

**A fixture holds face landmarks and a small color summary. It never holds a photo.** Landmarks still identify a face shape, so use codes (`p01`), get consent, and do not publish this folder.

```
fixtures/
  faceshape/            <code>.json per person, plus labels.csv (id,labeler1,labeler2,labeler3)
  stability/<person>/   capture01.json ... capture10.json   (10 captures of one person)
  color/<person>/       daylight.json, indoor-warm.json, indoor-cool.json
  ratings/              CSV exports from the rating study (?study)
  perf/                 JSON exports from the performance page (?perf)
  test1.landmarks.json  one real face used by the unit tests (not read by npm run eval)
```

Make fixture files with the collector page (`/?collect`) and read results with `npm run eval`.

A file the evaluation cannot read stops the run and names the file, so numbers never change silently.
