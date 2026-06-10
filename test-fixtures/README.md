# Intake validation test fixtures

Sample documents/images for exercising the client-side intake validation layer
(`validators/*`, `workers/validation-worker.js`). Drag a file into the demo's
file picker and confirm the **PASS/FAIL** outcome and message below.

- `should-pass/` — suitable documents that must be **Accepted**.
- `should-fail/` — each targets one check and must be **Rejected**.

Regenerate / re-tune:

```sh
python3 test-fixtures/generate_fixtures.py   # (re)build all fixtures
python3 test-fixtures/verify_fixtures.py     # offline cross-check vs the worker math + thresholds
```

`verify_fixtures.py` re-implements the worker's pixel math and the config
thresholds in numpy and predicts each image's outcome, so you can confirm a
fixture really trips the intended check without a browser. (OCR, PDF rendering
and PDF encryption are browser-only and are reported as `BROWSER-ONLY`.)

## should-pass (Accepted)

| File | Notes |
|------|-------|
| `doc-clean-portrait.png` | Clean A4 doc, 1240×1754, crisp text |
| `doc-clean.jpg` | Same as a JPEG |
| `doc-clean-landscape.png` | Landscape orientation (checks are orientation-independent) |
| `doc-dense-text.png` | Text-dense page |
| `doc-mild-skew.png` | ~4° tilt — below the 12° fail threshold |
| `doc-clean.pdf` | Valid PDF (PDF.js renders page 1; OCR reads the text) |

## should-fail (Rejected) — one per check

| File | Check (#) | Expected message family |
|------|-----------|-------------------------|
| `fail-tiny.png` | File size (1) | empty / truncated |
| `fail-unsupported.gif` / `.bmp` / `.webp` | Allowed format (2) | unsupported file type |
| `fail-mime-text-as-png.png` | Extension vs signature (3) | contents don't match extension |
| `fail-mime-png-as-pdf.pdf` | Extension vs signature (3) | contents don't match extension |
| `fail-corrupt.png` / `fail-corrupt.jpg` | Corruption (4) | corrupted image |
| `fail-corrupt.pdf` | Corruption (4) | corrupted PDF *(browser)* |
| `fail-password.pdf` | Password (5) | password protected *(browser; user pw `secret4242`)* |
| `fail-blur.png` | Blur (7) | too blurry |
| `fail-shadow.png` | Shadow/lighting (8) | uneven lighting / shadow |
| `fail-glare.png` | Glare (9) | severe glare over content |
| `fail-low-res.png` | DPI/resolution (10) | resolution too low |
| `fail-skew.png` | Skew (11) | too tilted/rotated (~22°) |
| `fail-too-dark.png` | Brightness (12) | too dark |
| `fail-overexposed.png` | Brightness/Blank (12/16) | overexposed → reads near-blank |
| `fail-noise.png` | Noise (13) | too noisy/grainy |
| `fail-screenshot.png` | Screenshot (14) | looks like a screen capture |
| `fail-occlusion.png` | Occlusion (15) | document is covered/obstructed |
| `fail-blank.png` | Blank page (16) | page appears blank |

Notes:
- When several checks fail, the **headline** message follows the priority order in
  `document-intake.js` (e.g. `fail-overexposed.png` legitimately reads as *blank*,
  since a washed-out page has almost no recoverable content).
- Thresholds live in `validators/config.js`; the ones marked `[DEMO — tune]` are
  the most likely to need calibration on your real intake samples.
- The `should-fail` heavy fixtures (`fail-noise.png`) are large because noise is
  incompressible — that's expected.
