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
    const sig = detectSignature(head);
    const okExts = sig ? TYPE_TO_EXT[sig] || [] : [];
    if (!sig || okExts.indexOf(ext) === -1) {
      checks.push(
        mk("signature", 3, "Extension vs signature", "fail", "sig " + (sig || "unknown") + " vs ." + ext, MSG.mime_mismatch)
      );
      return { ok: false, checks: checks, failure: { id: "signature", message: MSG.mime_mismatch } };
    }
    checks.push(mk("signature", 3, "Extension vs signature", "pass", "sig " + sig + " matches ." + ext));

    return { ok: true, kind: sig, checks: checks };
  }

  function mk(id, n, label, status, detail, message) {
    const c = { id: id, n: n, label: label, status: status, detail: detail };
    if (message) c.message = message;
    return c;
  }

  // ---- Decode (corruption + password) ---------------------------------------
  // Returns { failure?, isPdf, canvas, imageData, origWidth, origHeight, decodeChecks:[...] }
  async function decode(file, kind) {
    if (kind === "pdf") return decodePdf(file);
    return decodeImage(file);
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
      // InvalidPDFException / MissingPDFException / anything else ⇒ corrupt.
      return decodeFail("corruption", MSG.corrupt_pdf, name || "load error", true);
    }

    let canvas, imageData, ow, oh;
    try {
      const page = await pdf.getPage(1);
      const dpr = global.devicePixelRatio || 1;
      const baseScale = Math.min(2.0, 1.5 * dpr);
      const vp0 = page.getViewport({ scale: baseScale });
      const longSide = Math.max(vp0.width, vp0.height);
      // Render directly at a scale that lands the long side near downscaleLongSide.
      const scale = longSide > CFG.downscaleLongSide ? (baseScale * CFG.downscaleLongSide) / longSide : baseScale;
      const vp = page.getViewport({ scale: scale });
      canvas = makeCanvas(Math.max(1, Math.ceil(vp.width)), Math.max(1, Math.ceil(vp.height)));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#ffffff"; // PDF pages can be transparent — composite on white.
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ow = canvas.width;
      oh = canvas.height;
      if (page.cleanup) page.cleanup();
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

    return {
      isPdf: true,
      canvas: canvas,
      imageData: imageData,
      origWidth: ow,
      origHeight: oh,
      decodeChecks: [
        mk("corruption", 4, "File integrity", "pass", "PDF parsed; page 1 rendered."),
        mk("password", 5, "Password / encryption", "pass", "Not encrypted."),
      ],
    };
  }

  async function decodeImage(file) {
    let bmp = null;
    let imgEl = null;
    let objectUrl = null;
    let ow = 0;
    let oh = 0;
    try {
      if (typeof global.createImageBitmap === "function") {
        try {
          bmp = await global.createImageBitmap(file);
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

      const longSide = Math.max(ow, oh);
      const scale = longSide > CFG.downscaleLongSide ? CFG.downscaleLongSide / longSide : 1;
      const tw = Math.max(1, Math.round(ow * scale));
      const th = Math.max(1, Math.round(oh * scale));
      const canvas = makeCanvas(tw, th);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#ffffff"; // composite transparent PNGs over white.
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(bmp || imgEl, 0, 0, tw, th);

      let imageData;
      try {
        imageData = ctx.getImageData(0, 0, tw, th);
      } catch (err) {
        return decodeFail("corruption", MSG.corrupt_image, "getImageData failed", false);
      }

      return {
        isPdf: false,
        canvas: canvas,
        imageData: imageData,
        origWidth: ow,
        origHeight: oh,
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

  // ---- Phase B: heavy stage -------------------------------------------------
  async function heavyStage(file, kind, hooks, index) {
    let checks = [];
    const dec = await decode(file, kind);
    checks = checks.concat(dec.decodeChecks);
    if (dec.failure) {
      return finalize(file, index, kind, checks, null, null);
    }

    if (hooks.stage) hooks.stage(index, "quality");
    let metrics = null;
    try {
      metrics = await global.ReagvisImageQuality.runMetrics(dec.imageData);
      const qEval = global.ReagvisImageQuality.evaluate(metrics, {
        isPdf: dec.isPdf,
        origWidth: dec.origWidth,
        origHeight: dec.origHeight,
      });
      checks = checks.concat(qEval.checks);
    } catch (err) {
      // Native pixel math failing is unexpected; degrade rather than block.
      console.warn("[intake] quality worker failed:", err);
      checks = checks.concat(qualitySkipped());
    }

    if (hooks.stage) hooks.stage(index, "readability");
    let ocr = { skipped: true };
    try {
      ocr = await global.ReagvisOcr.runOcr(dec.canvas);
    } catch (err) {
      console.warn("[intake] OCR skipped (engine unavailable):", err);
      ocr = { skipped: true };
    }

    const blankCheck = evaluateBlank(metrics, ocr);
    checks.push(blankCheck);
    checks.push(global.ReagvisOcr.evaluate(ocr, blankCheck.status === "fail"));

    return finalize(file, index, kind, checks, metrics, ocr);
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
    let message;
    if (!total) message = "Select a document to begin intake checks.";
    else if (status === "passed")
      message =
        passed === 1
          ? "Document accepted for forensic analysis."
          : "All " + passed + " documents accepted for forensic analysis.";
    else
      message =
        failed === 1 && total === 1
          ? "Document rejected — action required."
          : failed + " of " + total + " document(s) rejected — action required.";
    return { status: status, total: total, passed: passed, failed: failed, message: message, files: finals };
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
      const res = await heavyStage(list[i], cheap.kind, hooks, i);
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
