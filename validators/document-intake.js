/*
 * validators/document-intake.js
 * -----------------------------
 * Top-level orchestrator for client-side document intake validation. It runs the
 * full per-file pipeline and produces a single PASS/FAIL outcome per document:
 *
 *   Phase A (cheap, near-instant, runs for ALL files first so obvious problems
 *            surface immediately):
 *     1 File size      2 Allowed format      3 Extension vs real signature
 *
 *   Phase B (expensive, runs sequentially only for files that passed Phase A):
 *     4 Decode/corruption   5 Password/encryption   (PDF.js / createImageBitmap)
 *     7-15 Image quality (validators/image-quality.js + the compute worker)
 *     6 OCR readability  +  16 Blank page  (validators/ocr.js + pixel signals)
 *
 * Performance: cheap checks gate the expensive ones; OCR (the slowest) runs last;
 * heavy work is processed one file at a time (bounded memory, single shared OCR
 * worker) so the UI stays responsive. PDF parsing and the pixel math both run off
 * the main thread (PDF.js's internal worker; our compute worker).
 *
 * SECURITY: this is a UX gate only. The backend MUST re-validate independently.
 */

(function (global) {
  "use strict";

  const CFG = global.VALIDATION_CONFIG;
  const MAGIC = global.VALIDATION_MAGIC;
  const TYPE_TO_EXT = global.VALIDATION_TYPE_TO_EXTENSIONS;

  // --- PDF.js (v3.11.174 legacy UMD) configuration ---------------------------
  // v3.11.174 is the last release shipping a classic <script>-loadable UMD build
  // (v4+ is ESM-only). The worker URL MUST be the exact same version as the lib.
  const PDFJS_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174";
  const PDFJS_WORKER_URL = PDFJS_BASE + "/legacy/build/pdf.worker.min.js";
  // cMap / standard-font data lets scanned/CJK or non-embedded-font PDFs rasterise
  // correctly instead of rendering blank glyphs.
  const PDF_FONT_OPTS = {
    cMapUrl: PDFJS_BASE + "/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: PDFJS_BASE + "/standard_fonts/",
  };
  if (typeof global.pdfjsLib !== "undefined") {
    global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  }

  // --- User-facing messages for orchestrator-owned checks --------------------
  // (Image-quality messages live in image-quality.js next to their thresholds.)
  const MSG = {
    unsupported_type: "This file type is not supported. Upload a PDF, JPG, JPEG, or PNG.",
    mime_mismatch:
      "This file's contents don't match its extension. Upload a genuine PDF, JPG, JPEG, or PNG.",
    too_large: "This file is larger than the 50 MB limit. Please upload a smaller file.",
    too_small: "This file looks empty or truncated. Please upload a complete document.",
    dimensions_too_large: "This image's pixel dimensions are too large to process safely. Please resize it and try again.",
    corrupt_pdf: "This PDF appears to be corrupted or unreadable. Please re-export it and try again.",
    corrupt_image: "This image appears to be corrupted. Please upload a valid JPG, JPEG, or PNG.",
    pdf_password: "This PDF is password protected. Please upload an unlocked version.",
    pdf_init: "Couldn't initialise the PDF reader (network/CDN issue). Check your connection and try again.",
    blank: "This page appears blank. Please upload the correct document.",
    rejected: "This document was rejected for forensic analysis.",
    batch_too_many: "Too many documents — please select at most " + CFG.maxFiles + ".",
  };

  // Canonical 16-point checklist, used to render a complete details view even
  // when later checks never ran (decode failed, etc.).
  const CANON = [
    { id: "size", n: 1, label: "File size" },
    { id: "format", n: 2, label: "Allowed format" },
    { id: "signature", n: 3, label: "Extension vs signature" },
    { id: "corruption", n: 4, label: "File integrity" },
    { id: "password", n: 5, label: "Password / encryption" },
    { id: "ocr", n: 6, label: "OCR readability" },
    { id: "blur", n: 7, label: "Blur / focus" },
    { id: "shadow", n: 8, label: "Shadow / lighting" },
    { id: "glare", n: 9, label: "Glare" },
    { id: "resolution", n: 10, label: "DPI / resolution" },
    { id: "skew", n: 11, label: "Skew / rotation" },
    { id: "brightness", n: 12, label: "Brightness" },
    { id: "noise", n: 13, label: "Noise / grain" },
    { id: "screenshot", n: 14, label: "Screenshot" },
    { id: "occlusion", n: 15, label: "Occlusion" },
    { id: "blank", n: 16, label: "Blank page" },
  ];

  // Headline priority: when several checks fail, show the most actionable one.
  const PRIORITY = [
    "format",
    "signature",
    "size",
    "corruption",
    "password",
    "blank",
    "resolution",
    "brightness",
    "blur",
    "glare",
    "shadow",
    "occlusion",
    "screenshot",
    "skew",
    "noise",
    "ocr",
  ];

  // ---- small helpers --------------------------------------------------------
  function extOf(name) {
    const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
  }

  function prettySize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function detectSignature(head) {
    for (let i = 0; i < MAGIC.length; i++) {
      const sig = MAGIC[i];
      let ok = true;
      for (let b = 0; b < sig.bytes.length; b++) {
        if (head[b] !== sig.bytes[b]) {
          ok = false;
          break;
        }
      }
      if (ok) return sig.type;
    }
    return null;
  }

  function makeCanvas(w, h) {
    // A detached (not-in-DOM) canvas element: fine to render/read on the main
    // thread and accepted directly by Tesseract.recognize().
    const c = global.document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  // ---- Phase A: cheap checks ------------------------------------------------
  // Returns { ok, kind, checks:[...], failure:{id,message} }
  async function cheapChecks(file) {
    const checks = [];
    const ext = extOf(file.name);

    // 1 — File size
    if (file.size > CFG.maxFileSizeBytes) {
      checks.push(mk("size", 1, "File size", "fail", prettySize(file.size) + " > 50 MB", MSG.too_large));
      return { ok: false, checks: checks, failure: { id: "size", message: MSG.too_large } };
    }
    if (file.size < CFG.minFileSizeBytes) {
      checks.push(mk("size", 1, "File size", "fail", prettySize(file.size) + " (suspiciously tiny)", MSG.too_small));
      return { ok: false, checks: checks, failure: { id: "size", message: MSG.too_small } };
    }
    checks.push(mk("size", 1, "File size", "pass", prettySize(file.size)));

    // 2 — Allowed format (extension)
    if (CFG.allowedExtensions.indexOf(ext) === -1) {
      checks.push(mk("format", 2, "Allowed format", "fail", "." + (ext || "?"), MSG.unsupported_type));
      return { ok: false, checks: checks, failure: { id: "format", message: MSG.unsupported_type } };
    }
    checks.push(mk("format", 2, "Allowed format", "pass", "." + ext));

    // 3 — Extension vs real signature (don't trust file.name / file.type)
    let head;
    try {
      head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    } catch (err) {
      checks.push(mk("signature", 3, "Extension vs signature", "fail", "could not read header", MSG.mime_mismatch));
      return { ok: false, checks: checks, failure: { id: "signature", message: MSG.mime_mismatch } };
    }
    // We route decoding by the SNIFFED content type, not the extension — so a
    // benign rename (a real PNG named .jpg, or vice-versa) is fine. We only reject
    // when the content isn't one of our supported types at all (e.g. a zip/exe
    // renamed .pdf). The dangerous "lie" is caught because its signature is
    // unknown, not because the extension disagrees.
    const sig = detectSignature(head);
    if (!sig) {
      checks.push(mk("signature", 3, "Extension vs signature", "fail", "content not PDF/JPG/PNG (ext ." + ext + ")", MSG.mime_mismatch));
      return { ok: false, checks: checks, failure: { id: "signature", message: MSG.mime_mismatch } };
    }
    const matches = (TYPE_TO_EXT[sig] || []).indexOf(ext) !== -1;
    checks.push(
      mk(
        "signature",
        3,
        "Extension vs signature",
        "pass",
        matches ? "content is " + sig + ", matches ." + ext : "content is " + sig + " (ext ." + ext + ") — processing by content"
      )
    );
    return { ok: true, kind: sig, checks: checks };
  }

  function mk(id, n, label, status, detail, message) {
    const c = { id: id, n: n, label: label, status: status, detail: detail };
    if (message) c.message = message;
    return c;
  }

  // ---- Decode (corruption + password) ---------------------------------------
  // Returns { failure?, isPdf, frames:[{canvas, imageData, noiseImageData,
  // origWidth, origHeight, pageIndex}], decodeChecks:[...] }
  async function decode(file, kind) {
    if (kind === "pdf") return decodePdf(file);
    return decodeImage(file, kind);
  }

  // Native-resolution centre crop (for noise) of an ImageBitmap/<img>/canvas.
  function nativeCropImageData(source, sw, sh) {
    try {
      const cw = Math.max(1, Math.min(sw, CFG.noiseCropMaxSide));
      const ch = Math.max(1, Math.min(sh, CFG.noiseCropMaxSide));
      const sx = Math.floor((sw - cw) / 2);
      const sy = Math.floor((sh - ch) / 2);
      const c = makeCanvas(cw, ch);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(source, sx, sy, cw, ch, 0, 0, cw, ch);
      return ctx.getImageData(0, 0, cw, ch);
    } catch (e) {
      return null;
    }
  }

  // Read pixel dimensions from the PNG/JPEG header WITHOUT decoding, so a
  // decompression bomb is rejected before createImageBitmap allocates gigabytes.
  async function readImageDimensions(file, kind) {
    try {
      if (kind === "png") {
        const b = new Uint8Array(await file.slice(0, 24).arrayBuffer());
        if (b.length < 24) return null;
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        return { w: dv.getUint32(16), h: dv.getUint32(20) };
      }
      if (kind === "jpg") {
        const b = new Uint8Array(await file.slice(0, 131072).arrayBuffer());
        let o = 2; // skip SOI (FF D8)
        while (o + 9 < b.length) {
          if (b[o] !== 0xff) {
            o++;
            continue;
          }
          const marker = b[o + 1];
          const isSOF =
            (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf);
          if (isSOF) {
            const h = (b[o + 5] << 8) | b[o + 6];
            const w = (b[o + 7] << 8) | b[o + 8];
            return { w: w, h: h };
          }
          if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
            o += 2;
            continue;
          }
          const len = (b[o + 2] << 8) | b[o + 3];
          if (len <= 0) break;
          o += 2 + len;
        }
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  // Truncation guard: a complete JPEG ends with the EOI marker (FF D9), a complete
  // PNG with the fixed IEND chunk. createImageBitmap may PARTIALLY decode a
  // truncated file without throwing, so we check the tail explicitly.
  async function isTruncated(file, kind) {
    try {
      const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 8)).arrayBuffer());
      if (tail.length < 2) return true;
      if (kind === "jpg") {
        return !(tail[tail.length - 2] === 0xff && tail[tail.length - 1] === 0xd9);
      }
      if (kind === "png") {
        const iend = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
        if (tail.length < 8) return true;
        for (let i = 0; i < 8; i++) if (tail[i] !== iend[i]) return true;
        return false;
      }
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  function renderFrameFromSource(source, ow, oh, pageIndex, isPdf) {
    const longSide = Math.max(ow, oh);
    const scale = longSide > CFG.downscaleLongSide ? CFG.downscaleLongSide / longSide : 1;
    const tw = Math.max(1, Math.round(ow * scale));
    const th = Math.max(1, Math.round(oh * scale));
    const canvas = makeCanvas(tw, th);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(source, 0, 0, tw, th);
    const imageData = ctx.getImageData(0, 0, tw, th);
    // Native-res crop for noise — only meaningful for camera/scanner images;
    // PDFs are vector-rendered (no sensor grain), so skip it for them.
    const noiseImageData = isPdf ? null : nativeCropImageData(source, ow, oh);
    return { canvas: canvas, imageData: imageData, noiseImageData: noiseImageData, origWidth: ow, origHeight: oh, pageIndex: pageIndex };
  }

  async function decodePdf(file) {
    if (typeof global.pdfjsLib === "undefined") {
      return {
        failure: { id: "corruption", message: MSG.pdf_init },
        decodeChecks: [
          mk("corruption", 4, "File integrity", "fail", "PDF.js not loaded", MSG.pdf_init),
          mk("password", 5, "Password / encryption", "na", "Not checked (reader unavailable)."),
        ],
      };
    }
    let ab;
    try {
      ab = await file.arrayBuffer();
    } catch (err) {
      return decodeFail("corruption", MSG.corrupt_pdf, "read error", true);
    }

    let pdf;
    try {
      // Pass a COPY: getDocument neuters the buffer it receives.
      pdf = await global.pdfjsLib.getDocument(Object.assign({ data: ab.slice(0) }, PDF_FONT_OPTS)).promise;
    } catch (err) {
      const name = (err && err.name) || "";
      if (name === "PasswordException") {
        return {
          failure: { id: "password", message: MSG.pdf_password },
          decodeChecks: [
            mk("corruption", 4, "File integrity", "pass", "Valid PDF (but encrypted)."),
            mk("password", 5, "Password / encryption", "fail", "PasswordException", MSG.pdf_password),
          ],
        };
      }
      return decodeFail("corruption", MSG.corrupt_pdf, name || "load error", true);
    }

    const total = pdf.numPages || 1;
    const pagesToCheck = Math.max(1, Math.min(total, CFG.pdfPagesToValidate || 1));
    const frames = [];
    try {
      for (let pageNum = 1; pageNum <= pagesToCheck; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const dpr = global.devicePixelRatio || 1;
        const baseScale = Math.min(2.0, 1.5 * dpr);
        const vp0 = page.getViewport({ scale: baseScale });
        const longSide = Math.max(vp0.width, vp0.height);
        const scale = longSide > CFG.downscaleLongSide ? (baseScale * CFG.downscaleLongSide) / longSide : baseScale;
        const vp = page.getViewport({ scale: scale });
        const canvas = makeCanvas(Math.max(1, Math.ceil(vp.width)), Math.max(1, Math.ceil(vp.height)));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        frames.push({
          canvas: canvas,
          imageData: imageData,
          noiseImageData: null,
          origWidth: canvas.width,
          origHeight: canvas.height,
          pageIndex: pageNum,
        });
        if (page.cleanup) page.cleanup();
      }
    } catch (err) {
      try {
        pdf.cleanup();
        pdf.destroy();
      } catch (e) {
        /* ignore */
      }
      return decodeFail("corruption", MSG.corrupt_pdf, "render: " + ((err && err.message) || err), true);
    }
    try {
      pdf.cleanup();
      pdf.destroy();
    } catch (e) {
      /* ignore */
    }

    const pagesNote = total > pagesToCheck ? pagesToCheck + " of " + total + " pages checked" : total + " page(s) rendered";
    return {
      isPdf: true,
      frames: frames,
      decodeChecks: [
        mk("corruption", 4, "File integrity", "pass", "PDF parsed; " + pagesNote + "."),
        mk("password", 5, "Password / encryption", "pass", "Not encrypted."),
      ],
    };
  }

  async function decodeImage(file, kind) {
    // Bomb guard 1: reject absurd dimensions from the header BEFORE decoding.
    const dims = await readImageDimensions(file, kind);
    if (dims && dims.w * dims.h > CFG.maxImagePixels) {
      return decodeBomb(dims.w + "x" + dims.h);
    }
    // Truncation guard: a partial file may still decode to a gray frame.
    if (await isTruncated(file, kind)) {
      return decodeFail("corruption", MSG.corrupt_image, "truncated (missing end marker)", false);
    }

    let bmp = null;
    let imgEl = null;
    let objectUrl = null;
    let ow = 0;
    let oh = 0;
    try {
      if (typeof global.createImageBitmap === "function") {
        try {
          // imageOrientation:"from-image" applies EXIF orientation (matching the
          // <img> fallback), so portrait phone photos aren't decoded sideways.
          bmp = await global.createImageBitmap(file, { imageOrientation: "from-image" });
          ow = bmp.width;
          oh = bmp.height;
        } catch (err) {
          bmp = null; // fall through to <img> fallback (older Safari, odd encodings)
        }
      }
      if (!bmp) {
        const loaded = await loadViaImgElement(file);
        if (!loaded) return decodeFail("corruption", MSG.corrupt_image, "decode failed", false);
        imgEl = loaded.img;
        objectUrl = loaded.url;
        ow = imgEl.naturalWidth;
        oh = imgEl.naturalHeight;
      }
      if (!ow || !oh) return decodeFail("corruption", MSG.corrupt_image, "zero dimensions", false);
      // Bomb guard 2: covers formats whose header we couldn't pre-parse.
      if (ow * oh > CFG.maxImagePixels) return decodeBomb(ow + "x" + oh);

      let frame;
      try {
        frame = renderFrameFromSource(bmp || imgEl, ow, oh, 1, false);
      } catch (err) {
        return decodeFail("corruption", MSG.corrupt_image, "draw/getImageData failed", false);
      }

      return {
        isPdf: false,
        frames: [frame],
        decodeChecks: [
          mk("corruption", 4, "File integrity", "pass", "Image decoded (" + ow + "x" + oh + ")."),
          mk("password", 5, "Password / encryption", "na", "Not applicable (images aren't encrypted)."),
        ],
      };
    } finally {
      if (bmp && bmp.close) bmp.close();
      if (objectUrl) global.URL.revokeObjectURL(objectUrl);
    }
  }

  function decodeBomb(dimsLabel) {
    return {
      failure: { id: "size", message: MSG.dimensions_too_large },
      decodeChecks: [
        mk("corruption", 4, "File integrity", "fail", dimsLabel + "px exceeds pixel limit", MSG.dimensions_too_large),
        mk("password", 5, "Password / encryption", "na", "Not checked (image too large)."),
      ],
    };
  }

  function loadViaImgElement(file) {
    return new Promise(function (resolve) {
      const url = global.URL.createObjectURL(file);
      const img = new global.Image();
      img.onload = function () {
        resolve({ img: img, url: url });
      };
      img.onerror = function () {
        global.URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  function decodeFail(id, message, detail, isPdf) {
    return {
      failure: { id: id, message: message },
      decodeChecks: [
        mk("corruption", 4, "File integrity", "fail", detail, message),
        mk("password", 5, "Password / encryption", isPdf ? "na" : "na", "Not checked (decode failed)."),
      ],
    };
  }

  // ---- Blank page (check 16): pixel evidence AND (when available) OCR evidence
  function evaluateBlank(metrics, ocr) {
    if (!metrics) {
      return mk("blank", 16, "Blank page", "skip", "Skipped (quality metrics unavailable).");
    }
    const pixelBlank =
      metrics.inkRatio < CFG.maxBlankPageInkRatio && metrics.luminanceVar < CFG.maxBlankLuminanceVar;
    const ocrAvailable = ocr && !ocr.skipped;
    const ocrBlank = ocrAvailable ? ocr.textLength < CFG.minOcrTextLength : true;
    const detail =
      "ink " +
      (metrics.inkRatio * 100).toFixed(2) +
      "%, var " +
      Math.round(metrics.luminanceVar) +
      (ocrAvailable ? ", text " + ocr.textLength + " chars" : ", OCR n/a");
    if (pixelBlank && ocrBlank) {
      return mk("blank", 16, "Blank page", "fail", detail, MSG.blank);
    }
    return mk("blank", 16, "Blank page", "pass", detail);
  }

  function qualitySkipped() {
    return [7, 8, 9, 10, 11, 12, 13, 14, 15].map(function (n) {
      const c = CANON[n - 1];
      return mk(c.id, c.n, c.label, "skip", "Skipped (quality engine unavailable — backend will re-check).");
    });
  }

  // Per-check aggregation across PDF pages: fail beats pass beats skip beats na.
  const STATUS_RANK = { fail: 3, pass: 2, skip: 1, na: 0 };
  function mergeChecks(map, checks, pageIndex) {
    checks.forEach(function (c) {
      const tagged = pageIndex
        ? { id: c.id, n: c.n, label: c.label, status: c.status, detail: "p" + pageIndex + ": " + c.detail, message: c.message }
        : c;
      const prev = map.get(c.id);
      if (!prev || (STATUS_RANK[c.status] || 0) > (STATUS_RANK[prev.status] || 0)) map.set(c.id, tagged);
    });
  }

  // ---- Phase B: heavy stage -------------------------------------------------
  async function heavyStage(file, cheap, hooks, index) {
    const kind = cheap.kind;
    // Seed with the passing cheap-check records (1 size, 2 format, 3 signature)
    // so they show as ✓ in the details instead of "Not run".
    const baseChecks = (cheap.checks || []).slice();
    const dec = await decode(file, kind);
    const decodeChecks = dec.decodeChecks || [];
    if (dec.failure) {
      return finalize(file, index, kind, baseChecks.concat(decodeChecks), null, null);
    }

    const frames = dec.frames || [];
    const agg = new Map(); // check id -> worst result across pages
    let limited = false;
    let firstMetrics = null;
    let firstOcr = null;
    let page1Blank = null;

    for (let f = 0; f < frames.length; f++) {
      const frame = frames[f];
      const tag = frames.length > 1 ? frame.pageIndex : 0;

      if (hooks.stage) hooks.stage(index, "quality");
      let metrics = null;
      try {
        metrics = await global.ReagvisImageQuality.runMetrics(frame.imageData, frame.noiseImageData);
      } catch (err) {
        console.warn("[intake] quality worker failed:", err);
        limited = true;
      }
      const qChecks = metrics
        ? global.ReagvisImageQuality.evaluate(metrics, { isPdf: dec.isPdf, origWidth: frame.origWidth, origHeight: frame.origHeight }).checks
        : qualitySkipped();

      if (hooks.stage) hooks.stage(index, "readability");
      let ocr = { skipped: true };
      try {
        ocr = await global.ReagvisOcr.runOcr(frame.canvas);
      } catch (err) {
        console.warn("[intake] OCR skipped (engine unavailable):", err);
        ocr = { skipped: true };
        limited = true;
      }

      const blankCheck = evaluateBlank(metrics, ocr);
      const contentRich = metrics ? metrics.inkRatio >= CFG.ocrContentRichInkRatio : false;
      const ocrCheck = global.ReagvisOcr.evaluate(ocr, blankCheck.status === "fail", contentRich);

      if (f === 0) {
        firstMetrics = metrics;
        firstOcr = ocr;
        page1Blank = blankCheck; // only page 1's blank state counts as "blank doc"
      }
      // A blank TRAILING page (back side) is benign — don't let its quality/OCR
      // checks fail the whole document.
      if (f > 0 && blankCheck.status === "fail") continue;

      mergeChecks(agg, qChecks, tag); // 7-15
      mergeChecks(agg, [ocrCheck], tag); // 6
    }

    if (page1Blank) mergeChecks(agg, [page1Blank], 0); // 16

    const checks = baseChecks.concat(decodeChecks, Array.from(agg.values()));
    const result = finalize(file, index, kind, checks, firstMetrics, firstOcr);
    if (limited) result.limited = true;
    return result;
  }

  // ---- Aggregation ----------------------------------------------------------
  function fillCanonical(partial) {
    const byId = {};
    partial.forEach(function (c) {
      byId[c.id] = c;
    });
    return CANON.map(function (def) {
      return byId[def.id] || mk(def.id, def.n, def.label, "na", "Not run.");
    });
  }

  function pickHeadline(failedChecks) {
    for (let i = 0; i < PRIORITY.length; i++) {
      const id = PRIORITY[i];
      for (let j = 0; j < failedChecks.length; j++) {
        if (failedChecks[j].id === id) return failedChecks[j].message || MSG.rejected;
      }
    }
    return failedChecks[0] ? failedChecks[0].message || MSG.rejected : MSG.rejected;
  }

  function finalize(file, index, kind, partialChecks, metrics, ocr) {
    const checks = fillCanonical(partialChecks);
    const failed = checks.filter(function (c) {
      return c.status === "fail";
    });
    const status = failed.length ? "fail" : "pass";
    const headline = status === "fail" ? pickHeadline(failed) : "Ready for forensic analysis.";
    // Keep raw scores in the debug payload (console/details), never user-facing.
    return {
      index: index,
      name: file.name,
      size: file.size,
      sizePretty: prettySize(file.size),
      kind: kind || null,
      status: status,
      headline: headline,
      checks: checks,
      failedCount: failed.length,
      debug: { metrics: metrics || null, ocr: ocr || null },
    };
  }

  // Lightweight per-file rejection used when the whole batch exceeds the file
  // cap (no heavy decode/OCR work performed).
  function batchRejected(file, index, cheap) {
    return {
      index: index,
      name: file.name,
      size: file.size,
      sizePretty: prettySize(file.size),
      kind: (cheap && cheap.kind) || null,
      status: "fail",
      headline: MSG.batch_too_many,
      checks: fillCanonical((cheap && cheap.checks) ? cheap.checks.slice() : []),
      failedCount: 1,
      debug: { metrics: null, ocr: null },
    };
  }

  function computeOverall(finals, total) {
    if (total > CFG.maxFiles) {
      return { status: "failed", total: total, passed: 0, failed: total, message: MSG.batch_too_many, files: finals };
    }
    let passed = 0;
    let failed = 0;
    finals.forEach(function (f) {
      if (!f) return;
      if (f.status === "pass") passed++;
      else failed++;
    });
    const allDone = finals.every(Boolean);
    const status = allDone && failed === 0 && total > 0 ? "passed" : "failed";
    // Degrade-open: if a passing document had a heavy check skipped because an
    // engine (quality worker / OCR) wasn't available, flag the reduced scrutiny.
    const limited = finals.some(function (f) {
      return f && f.status === "pass" && f.limited;
    });
    let message;
    if (!total) message = "Select a document to begin intake checks.";
    else if (status === "passed")
      message =
        (passed === 1
          ? "Document accepted for forensic analysis."
          : "All " + passed + " documents accepted for forensic analysis.") +
        (limited ? " (some checks unavailable — backend will re-validate)" : "");
    else
      message =
        failed === 1 && total === 1
          ? "Document rejected — action required."
          : failed + " of " + total + " document(s) rejected — action required.";
    return { status: status, total: total, passed: passed, failed: failed, message: message, limited: limited, files: finals };
  }

  // ---- Public API -----------------------------------------------------------
  // validate(files, hooks): hooks = { stage(i,stage), fileResult(i,result), overall(o) }
  // Returns the overall result object.
  async function validate(files, hooks) {
    hooks = hooks || {};
    const list = Array.prototype.slice.call(files || []);
    const finals = new Array(list.length);
    const overLimit = list.length > CFG.maxFiles;

    // Phase A — cheap checks for every file in parallel (all fast).
    const cheapResults = await Promise.all(
      list.map(async function (file, i) {
        if (hooks.stage) hooks.stage(i, "preparing");
        const cheap = await cheapChecks(file);
        if (!cheap.ok) {
          const res = finalize(file, i, cheap.kind, cheap.checks.slice(), null, null);
          finals[i] = res;
          if (hooks.fileResult) hooks.fileResult(i, res);
        }
        return cheap;
      })
    );

    // Phase B — heavy stage, one file at a time, only for Phase-A survivors.
    // When the batch exceeds the file cap we skip the expensive stage entirely
    // and reject each survivor with the batch message (avoids runaway OCR work).
    for (let i = 0; i < list.length; i++) {
      if (finals[i]) continue; // already failed a cheap check
      if (overLimit) {
        const res = batchRejected(list[i], i, cheapResults[i]);
        finals[i] = res;
        if (hooks.fileResult) hooks.fileResult(i, res);
        continue;
      }
      const cheap = cheapResults[i];
      const res = await heavyStage(list[i], cheap, hooks, i);
      finals[i] = res;
      if (hooks.fileResult) hooks.fileResult(i, res);
    }

    const overall = computeOverall(finals, list.length);
    if (hooks.overall) hooks.overall(overall);
    return overall;
  }

  function dispose() {
    try {
      global.ReagvisImageQuality && global.ReagvisImageQuality.terminate();
    } catch (e) {
      /* ignore */
    }
    try {
      global.ReagvisOcr && global.ReagvisOcr.terminate();
    } catch (e) {
      /* ignore */
    }
  }

  global.ReagvisIntake = {
    validate: validate,
    dispose: dispose,
    CANON: CANON,
    config: CFG,
  };
})(typeof self !== "undefined" ? self : this);
