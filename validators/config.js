/*
 * validators/config.js
 * ---------------------
 * Central, tunable configuration for the CLIENT-SIDE document intake validation
 * layer that runs BEFORE a document is submitted to the Reagvis forensic API.
 *
 * IMPORTANT PRODUCT FRAMING
 *   This layer does NOT decide whether a document is fake/authentic. That is the
 *   backend forensic model's job (async, after submission). This layer only
 *   decides whether a document is SUITABLE for reliable forensic analysis.
 *   There are exactly two outcomes per document: PASS or FAIL.
 *
 * SECURITY
 *   Client-side validation is a UX gate, NOT a security control. Everything here
 *   runs in the user's browser and is trivially bypassable (devtools, crafted
 *   requests, disabled JS). The BACKEND MUST INDEPENDENTLY RE-VALIDATE every
 *   accepted document (size, type/signature, decode, password, quality) before
 *   trusting it. Do not treat any value below as tamper-proof.
 *
 * TUNING
 *   Every threshold below is a DEMO default. Image-quality thresholds are tuned
 *   for a grayscale image whose longest side has been downscaled to ~1000px
 *   (see downscaleLongSide). Calibrate against real intake samples before relying
 *   on them. Values flagged "[DEMO — tune]" are the ones most likely to need it.
 */

(function (global) {
  "use strict";

  const VALIDATION_CONFIG = {
    // ---------- Batch / file-level (cheap, near-instant) ----------
    maxFiles: 10, // mirrors the existing backend "max 10 docs per job" rule
    maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB hard ceiling
    minFileSizeBytes: 1024, // < 1 KB ⇒ empty / truncated / not a real document
    allowedExtensions: ["pdf", "jpg", "jpeg", "png"],

    // ---------- Readability (OCR) ----------
    // NOTE: Tesseract's page `confidence` is noisy/pessimistic on real-world
    // photos — it routinely reports 25-35 even when the text is fully legible and
    // hundreds of characters are extracted. So confidence is treated as a SOFT
    // signal: it only fails a document whose recognised text is also SHORT. Once
    // a document yields plenty of text (>= ocrAmpleTextLength) it is considered
    // readable regardless of the confidence number.
    minOcrConfidence: 45, // only applies when extracted text is short
    minOcrTextLength: 20, // below ⇒ effectively no readable text
    ocrAmpleTextLength: 80, // at/above this many chars ⇒ readable, ignore low confidence
    // OCR languages passed to Tesseract (space/plus separated, e.g. "eng+hin").
    // English-only OCR falsely rejects non-Latin documents — so add the scripts
    // you expect (Indian KYC: "eng+hin"), at the cost of a larger one-time data
    // download. Separately, a page that LOOKS like a document (plenty of ink/
    // structure) but yields little OCR text is treated as "can't assess" (skip),
    // NOT rejected — it is most likely a script we didn't load.
    ocrLanguages: "eng+hin",
    ocrContentRichInkRatio: 0.03, // ink ratio above which low-OCR ⇒ skip, not fail

    // ---------- Decode safety ----------
    // Reject absurd pixel dimensions BEFORE allocating a full-frame bitmap — a
    // 25000x25000 "image" decompresses to gigabytes and can crash the tab
    // (decompression bomb). 40 MP comfortably covers any real document scan/photo.
    maxImagePixels: 40 * 1000 * 1000,
    // PDFs: how many leading pages to actually validate (not just page 1). The
    // file fails if ANY checked page fails. Keep small for speed.
    pdfPagesToValidate: 2,

    // ---------- Image-quality (computed on the downscaled grayscale image) ----------
    // Pixel metrics are normalised by first downscaling the longest side to this
    // many pixels. Keeps thresholds stable across 2MP and 48MP inputs and
    // suppresses sensor noise that would otherwise fool the blur metric.
    downscaleLongSide: 1000,
    // Noise is the exception: it is measured on a NATIVE-resolution centre crop
    // (this many px max per side) because the downscale above averages real grain
    // away and hides it. See maxNoiseStd / maxChromaNoiseStd below.
    noiseCropMaxSide: 900,

    // Resolution / DPI — evaluated on the ORIGINAL pixel dimensions, IMAGES ONLY.
    // (PDFs are rasterised by us at a fixed scale, so DPI is not meaningful there.)
    // Enforced orientation-independently: short side vs minImageWidth, long side
    // vs minImageHeight.
    // Lowered from 1000x1400 / 150dpi: those rejected plenty of legible phone
    // photos / screenshots of documents. These are a loose floor to catch only
    // genuine thumbnails; real readability is governed by the OCR check. [tune]
    minImageWidth: 500, // short side
    minImageHeight: 700, // long side
    minEstimatedDpi: 60, // assuming the image frames a full A4 page

    // Focus / blur — variance of the Laplacian. LOWER = blurrier.
    minBlurScore: 100, // [DEMO — tune] sharp scans are typically > 300

    // Brightness — mean luminance (0..255).
    // NOTE: document scans are mostly white paper, so their MEAN luminance is
    // naturally high (~210-240). The spec suggested maxBrightness 230, but that
    // over-rejects clean white scans, so it is raised to 248 here to catch only
    // genuinely blown-out captures. Truly blank white pages are caught by the
    // dedicated blank-page check instead. [DEMO — tune]
    maxBrightness: 248, // above ⇒ blown out / overexposed
    // "Too dark" is judged on the 90th-percentile luminance (the document's
    // highlights / paper), NOT the global mean — so a document photographed on a
    // dark desk/background isn't falsely rejected just because the surround is
    // dark. If even the brightest ~10% of the frame is dim, it is underexposed.
    minBrightnessHighlight: 90, // p90 luminance below this ⇒ too dark
    // "Overexposed" only fires when the page ALSO has almost no edge structure —
    // otherwise a clean white scan with crisp text (lots of edges) is wrongly
    // rejected just for having a bright background.
    overexposedMaxEdgeDensity: 0.01,
    // Washed-out overexposure: a bright page that HAS structure (edges/text) but
    // almost no dark "ink" — the content is blown to light grey and hard to read.
    // This catches glare/flash washouts that the two rules above miss (mean just
    // under 248, some surviving edges). It is distinguished from a clean dark-text
    // scan (which has real ink, inkRatio ~2-3%), from a dark-background photo
    // (high ink), and from a blank page (no edges). [DEMO — tune]
    washoutMinBrightness: 215, // page must be bright
    washoutMinEdge: 0.03, // ...and have recoverable structure (not blank)
    washoutMaxInk: 0.015, // ...but almost no dark ink (content washed out)
    // ...and be soft/low-contrast (overexposure flattens contrast). The lower
    // bound (minBlurScore) keeps genuinely BLURRY images on the blur check, and
    // the upper bound keeps CRISP images (glare-with-text, screenshots) off this
    // check — only a washed, soft, bright page with no dark ink lands here.
    washoutMaxBlur: 1500,

    // Glare — a large, BLOWN-OUT (near-pure-white), texture-less region over the
    // central document area. We require low center edge-density too, so that a
    // normal text-on-white page (lots of edges) is NOT mistaken for glare.
    maxGlareAreaRatio: 0.15, // [DEMO — tune] fraction of center that is blown
    glareMaxCenterEdgeDensity: 0.02, // glare only if center has little text/structure

    // Shadow / uneven lighting. Conservative: requires BOTH a large very-dark
    // area AND strong quadrant unevenness, so a single dark element (an ID photo,
    // dark logo/banner, QR block) or a dark background doesn't trip a false
    // "shadow" rejection — only genuinely uneven illumination does.
    maxShadowAreaRatio: 0.1, // fraction of very-dark pixels
    maxShadowUnevenness: 95, // max-min of the four quadrant mean luminances [tune]

    // Noise / grain — mean local std-dev in FLAT regions of a NATIVE-resolution
    // centre crop (the global downscale averages real grain away, so noise must be
    // measured before it). Measured for luma AND chroma; chroma catches colour
    // speckle that luma misses. Clean scans read luma ~0.6 / chroma ~0; heavy grain
    // 20+. Fail only on clearly bad grain. [DEMO — tune on real samples]
    maxNoiseStd: 7, // native-resolution luma flat-region std
    maxChromaNoiseStd: 8, // native-resolution chroma flat-region std

    // Skew / rotation — estimated text-line tilt in degrees.
    maxSkewDegrees: 12, // |skew| above this ⇒ too rotated

    // Occlusion — a large, SOLID (low internal texture) blob over the central
    // document area: a finger/hand/object on the page. The solidity guard is what
    // separates an occluder from legitimate dark-but-detailed content (an ID
    // photo, QR code, stamp or logo), which has high internal edge density.
    maxOcclusionAreaRatio: 0.15, // [DEMO — tune] severe occlusion only
    occlusionMaxInternalEdgeDensity: 0.04, // blob is an occluder only if this "solid"

    // Screenshot — heuristic confidence score (0..1). Deliberately conservative
    // so only OBVIOUS screen captures fail (aspect ratio of a phone/desktop
    // screen AND a flat status/nav bar). TODO: replace with an ML classifier.
    screenshotScoreFail: 0.75, // [DEMO — tune]

    // Blank page — requires BOTH pixel evidence (almost no ink + flat) AND, when
    // OCR is available, almost no recognised text. Two signals avoid false blanks.
    maxBlankPageInkRatio: 0.01, // [DEMO — tune] < 1% "ink" pixels
    maxBlankLuminanceVar: 120, // low global luminance variance
  };

  // Magic-number signatures for the supported types. We sniff the real bytes
  // instead of trusting file.name / file.type (both user-controlled).
  //   PDF  : "%PDF"            -> 25 50 44 46
  //   JPEG : SOI marker        -> FF D8 FF
  //   PNG  : signature         -> 89 50 4E 47 0D 0A 1A 0A
  const MAGIC_SIGNATURES = [
    { type: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
    { type: "jpg", bytes: [0xff, 0xd8, 0xff] },
    { type: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ];

  // Map a sniffed canonical type to the set of extensions that legitimately
  // carry it, so "photo.jpeg" (jpg signature) is accepted but "evil.pdf"
  // (really a zip/exe) is rejected.
  const TYPE_TO_EXTENSIONS = {
    pdf: ["pdf"],
    jpg: ["jpg", "jpeg"],
    png: ["png"],
  };

  global.VALIDATION_CONFIG = VALIDATION_CONFIG;
  global.VALIDATION_MAGIC = MAGIC_SIGNATURES;
  global.VALIDATION_TYPE_TO_EXTENSIONS = TYPE_TO_EXTENSIONS;
})(typeof self !== "undefined" ? self : this);
