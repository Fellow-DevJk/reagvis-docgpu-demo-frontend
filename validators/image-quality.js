/*
 * validators/image-quality.js
 * ---------------------------
 * Main-thread side of the image-quality checks. It owns ONE shared compute
 * worker (workers/validation-worker.js), ships it a downscaled RGBA frame, and
 * turns the raw metrics it returns into PASS/FAIL check results using the
 * thresholds in VALIDATION_CONFIG.
 *
 * Checks owned here (see the canonical 16-point list):
 *   7 Blur · 8 Shadow/lighting · 9 Glare · 10 DPI/resolution · 11 Skew ·
 *   12 Brightness · 13 Noise · 14 Screenshot · 15 Occlusion
 * It also returns the raw blank-page signals (ink ratio + luminance variance);
 * the orchestrator combines those with OCR to finalise check 16 (blank page).
 *
 * Threshold decisions live HERE, not in the worker, so config.js is the single
 * source of truth and the worker needs no importScripts().
 */

(function (global) {
  "use strict";

  const CFG = global.VALIDATION_CONFIG;

  // Safety net: a worker reply that never arrives (dropped message, dead worker)
  // must not hang the whole batch — runMetrics rejects after this and the
  // orchestrator degrades that file's quality checks to "skip".
  const QUALITY_TIMEOUT_MS = 20000;

  // --- Shared worker (lazy, reused across all files in the session) ----------
  let worker = null;
  let seq = 0;
  const pending = new Map();

  function getWorker() {
    if (worker) return worker;
    // Resolve relative to the page (document.baseURI) so it works under a subpath
    // host. A classic worker from a same-origin URL is allowed on static hosting.
    const url = new global.URL("workers/validation-worker.js", global.document.baseURI);
    worker = new global.Worker(url);
    worker.onmessage = function (e) {
      const msg = e.data || {};
      const resolver = pending.get(msg.id);
      if (!resolver) return;
      pending.delete(msg.id);
      if (msg.ok) resolver.resolve(msg.metrics);
      else resolver.reject(new Error(msg.error || "quality worker failed"));
    };
    worker.onerror = function (err) {
      // A hard worker error (e.g. the worker script failed to load) rejects all
      // in-flight work AND tears down the worker, so the next runMetrics() rebuilds
      // it instead of reusing a dead one (which would otherwise hang forever).
      const e = new Error("validation worker error: " + (err.message || "unknown"));
      try {
        if (worker) worker.terminate();
      } catch (_) {
        /* ignore */
      }
      worker = null;
      pending.forEach((r) => r.reject(e));
      pending.clear();
    };
    return worker;
  }

  // Compute raw metrics for an ImageData frame. TRANSFERS the pixel buffer(s) to
  // the worker (zero-copy); the passed ImageData (and optional native-resolution
  // noiseImageData) are detached afterwards and must not be reused by the caller.
  function runMetrics(imageData, noiseImageData) {
    return new Promise(function (resolve, reject) {
      let w;
      try {
        w = getWorker();
      } catch (err) {
        reject(err);
        return;
      }
      const id = ++seq;
      const timer = global.setTimeout(function () {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error("quality worker timed out"));
        }
      }, QUALITY_TIMEOUT_MS);
      // Wrap settle handlers so the timeout is always cleared.
      pending.set(id, {
        resolve: function (v) {
          global.clearTimeout(timer);
          resolve(v);
        },
        reject: function (e) {
          global.clearTimeout(timer);
          reject(e);
        },
      });
      const buffer = imageData.data.buffer;
      const msg = { type: "quality", id: id, width: imageData.width, height: imageData.height, buffer: buffer };
      const transfer = [buffer];
      if (noiseImageData && noiseImageData.data.buffer !== buffer) {
        msg.noiseBuffer = noiseImageData.data.buffer;
        msg.noiseWidth = noiseImageData.width;
        msg.noiseHeight = noiseImageData.height;
        transfer.push(noiseImageData.data.buffer);
      }
      try {
        w.postMessage(msg, transfer);
      } catch (err) {
        // postMessage can throw (e.g. detached buffer); reject rather than hang.
        const r = pending.get(id);
        pending.delete(id);
        if (r) r.reject(err);
        else reject(err);
      }
    });
  }

  // ---- helpers --------------------------------------------------------------
  function r2(n) {
    return Math.round(n * 100) / 100;
  }

  function estimateDpi(origW, origH) {
    // Assume the image frames a full A4 page: long side = 297mm = 11.69in,
    // short side = 210mm = 8.27in. Cross-check both and average.
    const longPx = Math.max(origW, origH);
    const shortPx = Math.min(origW, origH);
    return Math.round((longPx / 11.69 + shortPx / 8.27) / 2);
  }

  // Conservative screenshot aspect-ratio set — only the TALL phone-screen ratios.
  // 4:3 AND 16:9 are deliberately EXCLUDED: both are far too common for genuine
  // document scans/photos (a 16:9 landscape doc with plain top/bottom margins
  // would otherwise false-trip as a screenshot).
  const SCREEN_RATIOS = [18 / 9, 19.5 / 9, 20 / 9];
  function aspectLooksLikeScreen(origW, origH) {
    const a = origW / origH;
    const inv = origH / origW;
    const tol = 0.03;
    for (let i = 0; i < SCREEN_RATIOS.length; i++) {
      const r = SCREEN_RATIOS[i];
      if (Math.abs(a - r) < tol || Math.abs(inv - r) < tol) return true;
    }
    return false;
  }

  // Evaluate metrics into check results.
  //   metrics : object from runMetrics()
  //   opts    : { isPdf, origWidth, origHeight }
  // Returns { checks: [...], raw: metrics } where each check is
  //   { id, n, label, status: 'pass'|'fail'|'skip'|'na', detail, message? }
  function evaluate(metrics, opts) {
    const isPdf = !!opts.isPdf;
    const ow = opts.origWidth;
    const oh = opts.origHeight;
    const checks = [];

    function add(id, n, label, status, detail, message) {
      const c = { id: id, n: n, label: label, status: status, detail: detail };
      if (message) c.message = message;
      checks.push(c);
    }

    // 7 — Blur (variance of Laplacian). Skipped when there is essentially no
    // content (blank/near-blank), where the metric is unreliable — the blank
    // check handles that case.
    const hasContent = metrics.inkRatio >= 0.008 || metrics.edgeDensityGlobal >= 0.01;
    if (!hasContent) {
      add("blur", 7, "Blur / focus", "skip", "Skipped (page has too little content to assess focus).");
    } else if (metrics.blurVar < CFG.minBlurScore) {
      add(
        "blur",
        7,
        "Blur / focus",
        "fail",
        "Focus score " + r2(metrics.blurVar) + " < " + CFG.minBlurScore,
        "This document is too blurry for reliable forensic analysis. Please upload a clearer scan."
      );
    } else {
      add("blur", 7, "Blur / focus", "pass", "Focus score " + r2(metrics.blurVar));
    }

    // 8 — Shadow / uneven lighting. Conservative: requires BOTH a large very-dark
    // area AND strong quadrant unevenness, so a single dark element (ID photo,
    // dark logo, QR) or a dark background doesn't trigger a false shadow reject.
    const shadowBad =
      metrics.veryDarkRatio > CFG.maxShadowAreaRatio && metrics.shadowUnevenness > CFG.maxShadowUnevenness;
    add(
      "shadow",
      8,
      "Shadow / lighting",
      shadowBad ? "fail" : "pass",
      "Dark area " +
        (metrics.veryDarkRatio * 100).toFixed(1) +
        "%, unevenness " +
        r2(metrics.shadowUnevenness),
      shadowBad
        ? "Heavy shadow or uneven lighting is obscuring part of the document. Please retake it in even lighting."
        : undefined
    );

    // 9 — Glare. Fires either when a large blown-out region covers the center
    // (whole-center wash, with little structure there) OR when there's a LOCALIZED
    // specular reflection — a smooth hotspot much brighter than the paper — on an
    // otherwise readable page.
    const hotspot = metrics.glareHotspotRatio || 0;
    const streak = metrics.glareStreakRatio || 0;
    const glareBad =
      (metrics.glareCenterRatio > CFG.maxGlareAreaRatio &&
        metrics.centerEdgeDensity < CFG.glareMaxCenterEdgeDensity) ||
      hotspot > CFG.glareHotspotMaxRatio ||
      streak > CFG.glareStreakMaxRatio;
    add(
      "glare",
      9,
      "Glare",
      glareBad ? "fail" : "pass",
      "Center blown " +
        (metrics.glareCenterRatio * 100).toFixed(1) +
        "%, center edges " +
        (metrics.centerEdgeDensity * 100).toFixed(1) +
        "%, hotspot " +
        (hotspot * 100).toFixed(1) +
        "%, streak " +
        (streak * 100).toFixed(1) +
        "%",
      glareBad
        ? "The image has glare/reflection on the document. Please retake the photo without flash or reflections."
        : undefined
    );

    // 10 — Resolution. IMAGES ONLY (PDFs are vector-rasterised by us). The pass/
    // fail uses ACTUAL pixel dimensions only — the DPI number is an unreliable
    // guess (it assumes the frame is exactly an A4 page) so it's shown for
    // context but never used to reject.
    if (isPdf) {
      add("resolution", 10, "DPI / resolution", "na", "Not applicable (PDF is rendered at a fixed scale).");
    } else {
      const dpi = estimateDpi(ow, oh);
      const minDim = Math.min(ow, oh);
      const maxDim = Math.max(ow, oh);
      const tooSmall = minDim < CFG.minImageWidth || maxDim < CFG.minImageHeight;
      const detail = ow + "x" + oh + "px (~" + dpi + " dpi est.)";
      if (tooSmall) {
        add(
          "resolution",
          10,
          "DPI / resolution",
          "fail",
          detail,
          "This image's resolution is too low for reliable forensic analysis. Please upload a higher-resolution scan or photo."
        );
      } else {
        add("resolution", 10, "DPI / resolution", "pass", detail);
      }
    }

    // 11 — Skew / rotation. Detect both a ~90° rotation (text runs sideways) and
    // fine tilt, with a message that matches the actual problem.
    if (!metrics.skewReliable) {
      add("skew", 11, "Skew / rotation", "skip", "Skipped (not enough text lines to estimate skew).");
    } else if (metrics.rotated90) {
      add(
        "skew",
        11,
        "Skew / rotation",
        "fail",
        "Text appears sideways (~90° rotation)",
        "This document looks rotated sideways. Please rotate it upright and re-upload."
      );
    } else if (Math.abs(metrics.skewDeg) > CFG.maxSkewDegrees) {
      add(
        "skew",
        11,
        "Skew / rotation",
        "fail",
        "Estimated skew " + r2(metrics.skewDeg) + "°",
        "The document is too tilted for reliable analysis. Please straighten it and retake."
      );
    } else {
      add("skew", 11, "Skew / rotation", "pass", "Estimated skew " + r2(metrics.skewDeg) + "°");
    }

    // 12 — Brightness. "Too dark" uses the 90th-percentile luminance (the
    // document's highlights), so a doc on a dark surface isn't falsely rejected.
    // "Too bright" uses the mean and is gated on low edge content, so a clean
    // white scan with crisp text isn't mistaken for overexposed.
    const brightDetail =
      "p90 " + r2(metrics.brightnessP90) + ", mean " + r2(metrics.brightness) + ", edges " + (metrics.edgeDensityGlobal * 100).toFixed(1) + "%";
    if (metrics.brightnessP90 < CFG.minBrightnessHighlight) {
      add(
        "brightness",
        12,
        "Brightness",
        "fail",
        brightDetail,
        "This image is too dark to read reliably. Please retake it in better lighting."
      );
    } else if (metrics.brightness > CFG.maxBrightness && metrics.edgeDensityGlobal < CFG.overexposedMaxEdgeDensity) {
      add(
        "brightness",
        12,
        "Brightness",
        "fail",
        brightDetail,
        "This image is overexposed (too bright). Please retake it without direct glare or flash."
      );
    } else if (
      metrics.brightness > CFG.washoutMinBrightness &&
      metrics.edgeDensityGlobal > CFG.washoutMinEdge &&
      metrics.inkRatio < CFG.washoutMaxInk &&
      metrics.blurVar >= CFG.minBlurScore &&
      metrics.blurVar < CFG.washoutMaxBlur
    ) {
      // Bright + has structure + almost no dark ink + soft (low-contrast, but not
      // blurry) ⇒ the document is washed out by overexposure.
      add(
        "brightness",
        12,
        "Brightness",
        "fail",
        brightDetail + ", ink " + (metrics.inkRatio * 100).toFixed(2) + "%",
        "This image is overexposed — the document is washed out and hard to read. Please retake it in even lighting, without flash."
      );
    } else {
      add("brightness", 12, "Brightness", "pass", brightDetail);
    }

    // 13 — Noise / grain (severe only). Native-resolution luma OR chroma noise;
    // chroma catches colour speckle (common in low-light photos) that luma misses.
    const chroma = metrics.chromaNoiseStd || 0;
    const noiseBad = metrics.noiseStd > CFG.maxNoiseStd || chroma > CFG.maxChromaNoiseStd;
    const noiseDetail = "luma " + r2(metrics.noiseStd) + ", chroma " + r2(chroma);
    if (noiseBad) {
      add(
        "noise",
        13,
        "Noise / grain",
        "fail",
        noiseDetail,
        "This image is too noisy or grainy for reliable analysis. Please upload a cleaner scan."
      );
    } else {
      add("noise", 13, "Noise / grain", "pass", noiseDetail);
    }

    // 14 — Screenshot. IMAGES ONLY, conservative (aspect ratio of a screen AND a
    // flat UI band). TODO: replace with a trained screenshot classifier.
    if (isPdf) {
      add("screenshot", 14, "Screenshot", "na", "Not applicable (PDF input).");
    } else {
      const aspectHit = aspectLooksLikeScreen(ow, oh);
      const topFlat = metrics.topBandVar < 25;
      const botFlat = metrics.botBandVar < 25;
      const score = (aspectHit ? 0.5 : 0) + (topFlat ? 0.25 : 0) + (botFlat ? 0.25 : 0);
      const detail =
        "score " + r2(score) + " (aspect " + (aspectHit ? "y" : "n") + ", bars " + (topFlat ? "T" : "-") + (botFlat ? "B" : "-") + ")";
      if (score >= CFG.screenshotScoreFail) {
        add(
          "screenshot",
          14,
          "Screenshot",
          "fail",
          detail,
          "This looks like a screen capture, which isn't suitable for forensic analysis. Please upload an original scan or photo of the document."
        );
      } else {
        add("screenshot", 14, "Screenshot", "pass", detail);
      }
    }

    // 15 — Occlusion (large, central, SOLID dark blob). The solidity guard (low
    // internal edge density) is what spares legitimate dark-but-detailed content
    // (ID photo, QR, stamp, logo), which has high internal texture.
    const occEdge = metrics.occlusionEdgeDensity || 0;
    const occBad =
      metrics.occlusionRatio > CFG.maxOcclusionAreaRatio &&
      metrics.occlusionCentral &&
      occEdge < CFG.occlusionMaxInternalEdgeDensity;
    add(
      "occlusion",
      15,
      "Occlusion",
      occBad ? "fail" : "pass",
      "Largest blob " +
        (metrics.occlusionRatio * 100).toFixed(1) +
        "%" +
        (metrics.occlusionCentral ? " central" : "") +
        ", internal edges " +
        (occEdge * 100).toFixed(1) +
        "%",
      occBad
        ? "Part of the document is covered or obstructed. Please retake it with the full page visible."
        : undefined
    );

    return { checks: checks, raw: metrics };
  }

  function terminate() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    pending.clear();
  }

  global.ReagvisImageQuality = {
    runMetrics: runMetrics,
    evaluate: evaluate,
    estimateDpi: estimateDpi,
    terminate: terminate,
  };
})(typeof self !== "undefined" ? self : this);
