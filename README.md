# Reagvis DocGPU Demo Frontend

Static demo frontend for presentation/UAT.

## Frontend (UCC portal re-skin)

The UI is a static, **no-build** hash-routed single-page app styled as the UCC
government portal (adapted from the `react-frontend-migration` design, rebuilt in
vanilla HTML/CSS/JS — no React, no bundler). The **validation engine**
(`/validators`, `/workers`) and the **API + report logic** in `app.js` are
unchanged; only the UI was re-skinned.

- Screens (hash routes): `#/home` → `#/login` → `#/flow` (3-step wizard; step 3
  is the validator) → `#/confirm`, plus standalone `#/verify`.
- `ui/router.js` (router + icons), `ui/portal.js` (chrome + screens),
  `ui/verify.js` (validator wired to the real `ReagvisIntake` engine + the real
  upload/submit pipeline), `ui/connection.js` (Connection/Dev panel).
- **Connection panel** (bottom-right "⚙ Connection"): API Base URL + Bearer Token
  + optional x-origin-verify + Job ID. Runtime-only — never persisted.
- Flow: select files → **Run verification** (16 real checks, grouped with a
  pass/fail verdict stamp) → on PASS, **Submit** fires the forensic job and lands
  on Confirm with a handoff ("you may safely leave"). Confirm offers an optional
  **View forensic report** (polls the job, renders the styled report + printable
  PDF + JSON) and **Download intake JSON**.
- `legacy-vanilla/` holds a snapshot of the previous single-page UI for rollback.

## What it does

1. Upload up to 10 docs (`pdf/jpg/jpeg/png`)
2. Call `POST /uploads/presign` per file
3. Upload each file to S3 via presigned URL
4. Call `POST /jobs`
5. Poll `GET /jobs/{jobId}` until terminal
6. Fetch `GET /jobs/{jobId}/report`
7. Render styled forensic report preview
8. Export report JSON
9. Open printable report page for **Save as PDF**

## Run

Open `index.html` directly, or host the folder via any static hosting.

Input required:

- `API Base URL` (default: `https://api.verify.reagvis.com`)
- `Bearer Token` (tenant API key)
- Optional `x-origin-verify` (only when backend requires it)

## Document intake validation (client-side)

Before any upload/submit, selected documents pass through a client-side **intake
validation** layer that decides only whether each document is *suitable for
reliable forensic analysis* — **PASS** or **FAIL**. It does **not** decide
authenticity; the backend forensic model does that asynchronously after
submission. Validation starts automatically on file selection; the run button is
disabled until every selected document passes.

Layout:

- `validators/config.js` — `VALIDATION_CONFIG` (all tunable thresholds) + magic
  signatures. **Start tuning here.**
- `validators/document-intake.js` — orchestrator: cheap checks → decode
  (PDF.js / `createImageBitmap`) → quality + OCR → PASS/FAIL aggregation.
  Exposes `window.ReagvisIntake.validate(files, hooks)`.
- `validators/image-quality.js` — manages the compute worker; applies thresholds.
- `validators/ocr.js` — OCR confidence via Tesseract.js (runs on the main thread;
  Tesseract already offloads OCR to its own worker, so the UI stays responsive).
- `workers/validation-worker.js` — dependency-free pixel math in a Web Worker.

16 checks: file size, allowed format, extension-vs-signature, corruption,
password/encryption, OCR readability, blur, shadow, glare, DPI/resolution, skew,
brightness, noise, screenshot, occlusion, blank page. The compact card shows
PASS/FAIL; per-check values are behind **View validation details**.

CDN libraries (pinned, classic UMD, no build step):

- PDF.js **3.11.174 legacy** — last `<script>`-loadable UMD build (v4+ is ESM-only).
- Tesseract.js **7.0.0** — auto-fetches core/wasm/`eng` data from its CDN.

Heuristics & tuning: the image-quality checks are demo heuristics over a grayscale
image downscaled to ~1000px; thresholds in `config.js` (those marked
`[DEMO — tune]`) need calibration on real intake samples. Screenshot/occlusion are
deliberately conservative (with `TODO`s to swap in ML models). Several checks
(OCR, the quality engine) **degrade to "skip"** if their CDN library can't load,
rather than blocking the demo.

> **Security:** client-side validation is a UX gate, **not** a security control —
> it is trivially bypassable. The backend MUST independently re-validate every
> accepted document (size, type/signature, decode, password, quality).

## Notes

- Browser popup permission is required for printable PDF export page.
- If your hosting origin is not CORS-allowed by backend, browser calls fail.
- The demo renders report from `/jobs/{jobId}/report` JSON (operator view), not portal-only internals.
- First OCR run downloads the Tesseract English language data (a few MB); it is then cached.
- After upload, the backend scanner may still be finalizing S3 metadata. The submit
  flow retries `POST /jobs` with the same uploaded S3 URIs for retryable scanner
  pending / transient gateway responses; it does not re-upload files.
