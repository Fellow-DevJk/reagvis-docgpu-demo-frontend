# Figma Prompt — Reagvis Verify: Document Validation Demo

> Paste this whole brief into Figma Make / First Draft (or use it as a build spec).
> It describes ONE responsive web app screen with multiple states. Only the
> upload → validation-result flow needs to feel interactive; everything else is visual.

---

## 1. What to build

Design a **single-page web app demo** called **"Reagvis Verify — Document Validation"**. A user uploads a document (a government certificate such as a marriage / domicile / birth certificate) and the app runs it through an AI document-authenticity & capture-quality model, then displays a **validation report**: 16 individual checks, each marked pass / fail (with a reason), rolling up into one overall **ACCEPTED / REJECTED** verdict.

This is a showcase mockup — it should look like a polished, production product, not a wireframe. Fill every element with the realistic sample content given below (no lorem ipsum, no placeholder grey boxes).

Design these **four states** as separate frames:
1. **Idle / empty** — nothing uploaded yet
2. **File selected** — one document loaded, before running
3. **Analyzing** — running state (progress / skeleton)
4. **Results** — produce **two versions**: **4a ACCEPTED** (good document) and **4b REJECTED** (bad capture)

Primary canvas: **Desktop 1440 × 1024**. Also provide a **Mobile 390 × 844** version of the Results state.

---

## 2. Brand & visual system (Reagvis)

Premium, warm, editorial — deliberately *anti* generic-AI-SaaS. Think frosted glass, soft warm light, confident typography.

**Color palette**
- Page background: warm cream `#FAF3EA` (subtle vertical gradient to `#F4E9DA`)
- Card / surface: `#FFFFFF` at 92% opacity with frosted-glass blur over the cream
- Primary (brand orange): `#EA580C`; lighter `#FB923C`
- Primary gradient (buttons, accents): linear `#FB923C → #EA580C` (135°)
- Text — espresso: heading `#2A1B12`, body `#4A3528`, muted `#9A8472`
- Hairline borders: `#EAD9C6`
- Success: `#15803D` (pill bg `#DCFCE7`, text `#166534`)
- Fail: `#DC2626` (pill bg `#FEE2E2`, text `#991B1B`)
- Warning / borderline: `#D97706` (pill bg `#FEF3C7`, text `#92400E`)

**Typography**
- Display / big titles: **Playfair Display** (serif), 600/700
- UI, labels, buttons, check names: **Sora**, 500/600
- Body, metrics, reasons: **Manrope**, 400/500
- Sizes: H1 40px (Playfair), section header 15px Sora uppercase tracked +0.08em, check name 15px Sora, metric/reason 13px Manrope, badge 12px Sora 600.

**Shape & depth**
- Corner radius: cards 20px, inputs/rows 14px, badges/pills 999px
- Shadow: soft warm `0 12px 40px rgba(120, 72, 30, 0.10)`
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
- Grid: 12 columns, 80px outer margins, 24px gutters

---

## 3. Page layout (desktop)

**Top header bar** (sticky, frosted, full width, 72px tall)
- Left: Reagvis split-face logo mark + wordmark "Reagvis **Verify**" (Verify in orange)
- Center-left nav (text links, muted): Demo · Documentation · API
- Right: a small pill badge "Model: **DocGPU v1**" (orange outline), and a round avatar.

**Title block** (centered, max-width 760px, generous top padding 56px)
- H1 (Playfair Display): "Document Authenticity & Quality Check"
- Subtitle (Manrope, muted): "Upload a document to run 16 integrity, readability, capture-quality and authenticity checks. Get an instant accept / reject verdict with reasons."

**Main content — two columns** below the title (start at 12-col grid):
- **Left column (5 of 12):** Upload card + Document preview card (stacked)
- **Right column (7 of 12):** Validation Report card

---

## 4. Components

### 4.1 Upload card (left)
- White frosted card, 20px radius, padding 24px.
- A **drag-and-drop zone**: dashed border 2px in orange `#FB923C`, radius 16px, soft cream-tint fill, 180px tall. Centered inside: an upload/cloud icon, text "**Drag & drop documents here**" (Sora 600) and "or click to browse — PDF, JPG, PNG · max 10 files" (Manrope muted).
- **Idle state:** zone empty as above.
- **File-selected state:** below the zone show an uploaded-file chip row: small document thumbnail, filename `domicile_certificate_uttarakhand.pdf`, size `4.2 MB`, and an ✕ remove icon. (Show 1 file; design supports a stacked list.)
- Primary button under the card, full width, 52px tall, gradient `#FB923C→#EA580C`, white Sora 600 label "**Run Validation**", with a small spark/scan icon. In idle state this button is disabled (40% opacity).

### 4.2 Document preview card (left, below upload)
- White card. Header label "Document preview" (Sora uppercase, muted).
- Shows a realistic thumbnail of an Indian government certificate (a UCC Uttarakhand-style certificate page — header crest, title "Certificate of Domicile", fields, a seal/signature block). In the **REJECTED** version, overlay subtle red dashed bounding boxes on the problem regions (a blur region, a glare hotspot top-right, a finger occluding the bottom-left corner) with tiny labels.

### 4.3 Validation Report card (right) — the hero of the demo

**Report header (inside card top):**
- Left: "Validation Report" (Sora 600, 18px) + filename in muted small text.
- Right: the **overall verdict** as a large pill:
  - ACCEPTED version → green pill "✓ ACCEPTED" + sub-line "14 / 16 checks passed · confidence 96%"
  - REJECTED version → red pill "✕ REJECTED" + sub-line "11 / 16 passed · recapture recommended"
- A thin horizontal summary bar under the header: a segmented progress strip (green / amber / red segments proportional to pass / warn / fail counts).

**Then four grouped sections**, each with a small uppercase Sora section header and a count chip (e.g. "FILE INTEGRITY · 5/5"). Inside each section, render the checks as **rows**.

**Row anatomy (apply to every check):**
- Leading status icon in a 28px circle: green filled ✓ (pass), red filled ✕ (fail), amber ! (warning).
- Check name (Sora 500, 15px, espresso).
- Result / metric line under or beside the name (Manrope 13px, muted) — for score checks show the measured value vs threshold.
- For score-type checks add a thin 4px progress bar (rounded) tinted by status, OR a numeric chip like `240 DPI`.
- Trailing status badge pill: green "PASS" / red "FAIL" / amber "WARN".
- On FAIL/WARN, a second muted reason line in italic + a small ⓘ info dot.
- Row dividers: 1px `#EAD9C6` hairline, 16px vertical padding.

**Card footer actions** (mirroring the real Reagvis demo): two ghost/secondary buttons — "Download Report (JSON)" and "Open Printable Report (PDF)" — plus a tertiary "Re-run" text link.

---

## 5. The 16 checks — exact content

Group them in this order. For each row use the sample **PASS** content in the ACCEPTED frame and the sample **FAIL** content in the REJECTED frame.

### Group A — File Integrity *(binary: PASS / FAIL)*
| # | Check name | PASS result | FAIL result (reason) |
|---|---|---|---|
| 1 | File size limit | `4.2 MB / 10 MB` | `12.4 MB — exceeds 10 MB limit` |
| 2 | Allowed formats | `PDF — accepted` | `TIFF not allowed (PDF, JPG, PNG only)` |
| 3 | File extension vs MIME type | `.pdf matches application/pdf` | `.jpg declared, but MIME is application/pdf — mismatch` |
| 4 | File corruption check | `Structure intact, fully readable` | `Truncated byte stream — file unreadable` |
| 5 | Password / encryption detection | `No encryption detected` | `Password-protected — contents unreadable` |

### Group B — Readability *(OCR binary + score)*
| # | Check name | PASS result | FAIL result (reason) |
|---|---|---|---|
| 6 | OCR success rate | `94% characters recognized` (bar) | `38% recognized — below 70% threshold` |
| 7 | Blank page detection | `Content detected on all pages` | `Page 2 appears blank` |

### Group C — Capture Quality *(score + threshold)*
| # | Check name | PASS result | FAIL result (reason) |
|---|---|---|---|
| 8 | Blur detection | `Sharpness 0.82 (sharp)` | `Sharpness 0.21 — image too blurry` |
| 9 | Shadow detection | `No significant shadow` | `Heavy shadow over 22% of document` |
| 10 | Glare detection | `No glare hotspots` | `Specular glare detected, top-right` |
| 11 | DPI check | `240 DPI` | `96 DPI — below 200 DPI minimum` |
| 12 | Skew / rotation detection | `Skew 0.4°` | `Rotated 17° — exceeds 5° tolerance` |
| 13 | Brightness check | `Brightness 0.58 (optimal)` | `Overexposed — brightness 0.94` |
| 14 | Noise / grain detection | `Low noise (SNR 34 dB)` | `High grain — SNR 11 dB` |

### Group D — Content & Authenticity *(binary)*
| # | Check name | PASS result | FAIL result (reason) |
|---|---|---|---|
| 15 | Screenshot detection | `No screen-capture artifacts` | `Screenshot detected — UI chrome / device metadata present` |
| 16 | Occlusion detection | `Full document visible` | `Object occluding bottom-left corner` |

**ACCEPTED frame:** all 16 PASS except show check #13 Brightness as a **WARN** (`Brightness 0.78 — slightly bright`) so the report looks real → verdict "14/16 passed" reads as 14 pass + 1 warn + … adjust counts to: 15 PASS, 1 WARN, 0 FAIL, verdict **ACCEPTED**.

**REJECTED frame:** Groups A and B all PASS; in Group C fail #8 Blur, #10 Glare, #11 DPI (use FAIL content above), and in Group D fail #16 Occlusion. Everything else PASS. Counts: 11 PASS, 0 WARN, 5… → set to **11 PASS / 5 FAIL → REJECTED**. (Wait: 16 total − 4 fails − keep #13 pass = 12 pass / 4 fail; show verdict "12 / 16 passed · REJECTED · recapture recommended".)

> Verdict rule to reflect in the design: ANY File-Integrity (Group A) failure → instant REJECTED regardless of other checks; otherwise REJECTED if 2+ quality/authenticity checks fail, else ACCEPTED (warnings allowed).

---

## 6. Analyzing state (frame 3)
- Keep the layout; replace the Validation Report body with a scanning animation feel: a shimmering scan-line over the document thumbnail, and the 16 rows shown as skeleton placeholders (pulsing grey-cream bars) with the icon circles spinning. Header shows "Analyzing document…" and a thin indeterminate progress bar in the orange gradient. Run-Validation button shows a spinner + "Analyzing".

---

## 7. Mobile (390 × 844, Results)
- Single column: header → verdict pill (full width) → summary strip → upload chip (collapsed) → the four grouped sections stacked → footer actions as full-width buttons.
- Rows: status icon + name on line 1, metric + badge on line 2, reason on line 3.

---

## 8. Prototype wiring (Figma interactions)
- Idle → (on drop-zone click) → File selected
- File selected → (on "Run Validation" click) → Analyzing → (after delay / on click) → Results (ACCEPTED)
- Add an off-canvas toggle or a second flow to reach Results (REJECTED) for the demo.
- "Open Printable Report (PDF)" → optional overlay showing a clean printable A4 report layout (verdict header + the 16 checks as a simple list). Nice-to-have, not required.

---

## 9. Do / Don't
- DO use the warm cream background everywhere — never pure white page.
- DO keep generous whitespace and let Playfair Display headlines breathe.
- DO make the verdict pill and the pass/fail badges the most visually dominant feedback.
- DON'T use cold blue/purple "techy" gradients, neon, or dark mode.
- DON'T use stocky icon sets — use thin, consistent line icons (1.5px stroke).
- DON'T leave any placeholder text — use the exact sample content above.
