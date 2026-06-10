/*
 * validators/ocr.js
 * -----------------
 * OCR readability check (canonical check 6), backed by Tesseract.js v7.
 *
 * WHY THIS IS NOT A `workers/ocr-worker.js`:
 *   Tesseract.js already runs the actual OCR/WASM inside its OWN dedicated web
 *   worker, so calling worker.recognize() from the main thread does NOT block
 *   the UI — the heavy work is already off-thread and we just await a promise.
 *   Wrapping it in a second hand-rolled classic Web Worker (via importScripts of
 *   the Tesseract UMD bundle) only adds cross-origin/marshalling complexity for
 *   zero responsiveness benefit, so we deliberately keep OCR on the main thread.
 *   (Verified against the Tesseract.js docs during research.)
 *
 * GRACEFUL DEGRADATION:
 *   If the Tesseract CDN script didn't load, or the language data can't be
 *   fetched (offline/locked-down network), runOcr() throws. The orchestrator
 *   treats that as a SKIP (does not block the document), because a network/CDN
 *   problem is not the document's fault and shouldn't break the whole demo. A
 *   document that DID run OCR but scored poorly is still failed normally.
 */

(function (global) {
  "use strict";

  const CFG = global.VALIDATION_CONFIG;

  // One reusable worker for the whole session (creating one per image wastes the
  // multi-MB language-data load). Created lazily on first use.
  let workerPromise = null;

  function ensureWorker() {
    if (workerPromise) return workerPromise;
    if (typeof global.Tesseract === "undefined" || !global.Tesseract.createWorker) {
      return Promise.reject(new Error("Tesseract.js is not loaded"));
    }
    // v5+/v7 API: createWorker is async and pre-loads the language directly.
    workerPromise = global.Tesseract.createWorker("eng").catch(function (err) {
      // Reset so a later attempt can retry rather than reusing a failed promise.
      workerPromise = null;
      throw err;
    });
    return workerPromise;
  }

  // Run OCR on a source Tesseract accepts: HTMLCanvasElement, OffscreenCanvas,
  // Blob/File, HTMLImageElement, data: URL or http(s) URL string. We pass the
  // already-downscaled canvas produced during decode.
  // Returns { confidence (0..100), text, textLength }.
  async function runOcr(source) {
    const worker = await ensureWorker();
    const result = await worker.recognize(source);
    const data = (result && result.data) || {};
    const text = typeof data.text === "string" ? data.text : "";
    // Count meaningful (non-whitespace) characters so runs of spaces/newlines
    // from a blank page don't read as "text present".
    const textLength = text.replace(/\s+/g, "").length;
    const confidence = typeof data.confidence === "number" ? data.confidence : 0;
    return { confidence: confidence, text: text, textLength: textLength };
  }

  // Build check 6 (OCR readability) from an OCR result, honouring config
  // thresholds. `blankSuspected` lets the orchestrator suppress a redundant
  // "unreadable" message when the dedicated blank-page check already fired.
  function evaluate(ocr, blankSuspected) {
    if (!ocr || ocr.skipped) {
      return {
        id: "ocr",
        n: 6,
        label: "OCR readability",
        status: "skip",
        detail: "Skipped (OCR engine unavailable — backend will re-check).",
      };
    }
    const lowConfidence = ocr.confidence < CFG.minOcrConfidence;
    const tooLittleText = ocr.textLength < CFG.minOcrTextLength;
    const detail = "confidence " + Math.round(ocr.confidence) + ", text " + ocr.textLength + " chars";
    if ((lowConfidence || tooLittleText) && !blankSuspected) {
      return {
        id: "ocr",
        n: 6,
        label: "OCR readability",
        status: "fail",
        detail: detail,
        message: "The document text could not be read reliably. Please upload a clearer version.",
      };
    }
    return {
      id: "ocr",
      n: 6,
      label: "OCR readability",
      status: lowConfidence || tooLittleText ? "skip" : "pass",
      detail: detail,
    };
  }

  function terminate() {
    if (workerPromise) {
      const p = workerPromise;
      workerPromise = null;
      p.then(function (w) {
        try {
          w.terminate();
        } catch (e) {
          /* ignore */
        }
      }).catch(function () {});
    }
  }

  global.ReagvisOcr = {
    runOcr: runOcr,
    evaluate: evaluate,
    terminate: terminate,
  };
})(typeof self !== "undefined" ? self : this);
