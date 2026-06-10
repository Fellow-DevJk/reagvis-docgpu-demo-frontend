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
    minOcrConfidence: 55, // Tesseract page confidence (0..100); below ⇒ unreadable
    minOcrTextLength: 20, // characters of recognised text; below ⇒ unreadable/blank

    // ---------- Image-quality (computed on the downscaled grayscale image) ----------
    // Pixel metrics are normalised by first downscaling the longest side to this
    // many pixels. Keeps thresholds stable across 2MP and 48MP inputs and
    // suppresses sensor noise that would otherwise fool the blur metric.
    downscaleLongSide: 1000,

    // Resolution / DPI — evaluated on the ORIGINAL pixel dimensions, IMAGES ONLY.
    // (PDFs are rasterised by us at a fixed scale, so DPI is not meaningful there.)
    // Enforced orientation-independently: short side vs minImageWidth, long side
    // vs minImageHeight.
    minImageWidth: 1000,
    minImageHeight: 1400,
    minEstimatedDpi: 150, // assuming the image frames a full A4 page

    // Focus / blur — variance of the Laplacian. LOWER = blurrier.
    minBlurScore: 100, // [DEMO — tune] sharp scans are typically > 300

    // Brightness — mean luminance (0..255).
    // NOTE: document scans are mostly white paper, so their MEAN luminance is
    // naturally high (~210-240). The spec suggested maxBrightness 230, but that
    // over-rejects clean white scans, so it is raised to 248 here to catch only
    // genuinely blown-out captures. Truly blank white pages are caught by the
    // dedicated blank-page check instead. [DEMO — tune]
    minBrightness: 45, // below ⇒ too dark
    maxBrightness: 248, // above ⇒ blown out / overexposed
    // "Overexposed" only fires when the page ALSO has almost no edge structure —
    // otherwise a clean white scan with crisp text (lots of edges) is wrongly
    // rejected just for having a bright background.
    overexposedMaxEdgeDensity: 0.01,

    // Glare — a large, BLOWN-OUT (near-pure-white), texture-less region over the
    // central document area. We require low center edge-density too, so that a
    // normal text-on-white page (lots of edges) is NOT mistaken for glare.
    maxGlareAreaRatio: 0.15, // [DEMO — tune] fraction of center that is blown
    glareMaxCenterEdgeDensity: 0.02, // glare only if center has little text/structure

    // Shadow / uneven lighting.
    maxShadowAreaRatio: 0.1, // [DEMO — tune] fraction of very-dark pixels
    maxShadowUnevenness: 70, // max-min of the four quadrant mean luminances

    // Noise / grain — mean local std-dev measured in FLAT regions only (so text
    // edges don't inflate it), AFTER the ~1000px downscale (which itself averages
    // out a lot of noise). HIGHER = grainier. Fail only on severe noise: clean
    // scans read ~1, mild real noise ~8, heavy grain ~14+. [DEMO — tune]
    maxNoiseStd: 12,

    // Skew / rotation — estimated text-line tilt in degrees.
    maxSkewDegrees: 12, // |skew| above this ⇒ too rotated

    // Occlusion — a large dark blob covering the central document area
    // (finger/hand over the page, object on top, torn corner, etc.).
    maxOcclusionAreaRatio: 0.15, // [DEMO — tune] severe occlusion only

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
