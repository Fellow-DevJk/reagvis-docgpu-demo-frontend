/*
 * workers/validation-worker.js
 * ----------------------------
 * A CLASSIC, dependency-free Web Worker that computes raw image-quality metrics
 * from a downscaled RGBA frame, off the main UI thread.
 *
 * Design notes
 *   - It returns RAW METRIC VALUES only. All PASS/FAIL threshold decisions live
 *     on the main thread (validators/image-quality.js + config.js) so there is a
 *     single source of truth for thresholds and no need to importScripts() the
 *     config into the worker (which avoids cross-origin/CSP worker headaches).
 *   - Input is expected to be ALREADY downscaled (longest side ~1000px) by the
 *     caller, via OffscreenCanvas/createImageBitmap on the main thread. This keeps
 *     thresholds resolution-independent and suppresses sensor noise.
 *   - The pixel buffer is TRANSFERRED in (zero-copy) and transferred back out, so
 *     no large array is cloned across the worker boundary.
 *
 * Algorithms are intentionally plain-JS (no OpenCV.js): variance-of-Laplacian
 * for focus, Rec.601 luma for brightness, projection-profile for skew, and
 * single-pass accumulators for the rest. See each function for the formula.
 */

"use strict";

// ---- Internal computation constants (about HOW a metric is measured, not about
//      product PASS/FAIL — those thresholds live in config.js on the main thread).
const DARK_LEVEL = 50; // luminance below this counts as "ink" / dark pixel
const VERY_DARK_LEVEL = 30; // luminance below this counts toward shadow
const BLOWN_LEVEL = 250; // luminance at/above this is a blown (clipped white) pixel
const BLOWN_MAX_SAT = 12; // ...and chroma below this ⇒ specular/white, not coloured
const EDGE_LAP = 24; // |Laplacian| at/above this counts as a structural edge
// 3x3 window range below this is "flat" (used for the noise estimate). It must be
// LARGE enough that a genuinely noisy-but-textureless window still qualifies as
// flat — otherwise the noise check is unreachable (a window noisy enough to
// exceed maxNoiseStd would also exceed the range and be excluded). 120 admits
// noise up to ~σ40 while still excluding real text edges (range > ~150).
const FLAT_RANGE = 120;

self.onmessage = function (e) {
  const msg = e.data || {};
  if (msg.type !== "quality") return;
  try {
    const metrics = computeMetrics(msg.width, msg.height, msg.buffer);
    // Transfer the (now metrics-only) result; nothing large to send back, but we
    // explicitly do NOT send the pixel buffer back to free it promptly.
    self.postMessage({ type: "quality", id: msg.id, ok: true, metrics: metrics });
  } catch (err) {
    self.postMessage({
      type: "quality",
      id: msg.id,
      ok: false,
      error: String((err && err.message) || err),
    });
  }
};

function computeMetrics(W, H, buffer) {
  const data = new Uint8ClampedArray(buffer);
  const N = W * H;
  const gray = new Uint8Array(N);

  // ---------------- Pass 1: single RGBA sweep ----------------
  // Accumulates: grayscale, mean brightness, ink/very-dark ratios, per-quadrant
  // means (uneven lighting), center blown-pixel ratio (glare candidate), and a
  // numerically-stable global luminance variance (Welford) for blank detection.
  let sumY = 0;
  let dark = 0;
  let veryDark = 0;
  const qSum = [0, 0, 0, 0];
  const qCnt = [0, 0, 0, 0];
  let centerCount = 0;
  let blownCenter = 0;
  let mean = 0;
  let M2 = 0;

  const cx0 = W * 0.25;
  const cx1 = W * 0.75;
  const cy0 = H * 0.25;
  const cy1 = H * 0.75;

  for (let y = 0, i = 0, p = 0; y < H; y++) {
    const topHalf = y < H / 2 ? 0 : 2;
    const inYCenter = y >= cy0 && y < cy1;
    for (let x = 0; x < W; x++, i++, p += 4) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      // Rec.601 luma on raw (gamma-encoded) sRGB bytes — the standard cheap
      // choice for these heuristics; do NOT linearize.
      const Y = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
      gray[i] = Y;
      sumY += Y;

      // Welford online variance of luminance.
      const k = i + 1;
      const d = Y - mean;
      mean += d / k;
      M2 += d * (Y - mean);

      if (Y < DARK_LEVEL) dark++;
      if (Y < VERY_DARK_LEVEL) veryDark++;

      const quad = topHalf + (x < W / 2 ? 0 : 1);
      qSum[quad] += Y;
      qCnt[quad]++;

      if (inYCenter && x >= cx0 && x < cx1) {
        centerCount++;
        if (Y >= BLOWN_LEVEL) {
          const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
          const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
          if (mx - mn < BLOWN_MAX_SAT) blownCenter++;
        }
      }
    }
  }

  const brightness = sumY / N;
  const inkRatio = dark / N;
  const veryDarkRatio = veryDark / N;
  const luminanceVar = N > 1 ? M2 / N : 0;
  const quadMeans = [
    qSum[0] / Math.max(1, qCnt[0]),
    qSum[1] / Math.max(1, qCnt[1]),
    qSum[2] / Math.max(1, qCnt[2]),
    qSum[3] / Math.max(1, qCnt[3]),
  ];
  const shadowUnevenness = Math.max.apply(null, quadMeans) - Math.min.apply(null, quadMeans);
  const glareCenterRatio = centerCount ? blownCenter / centerCount : 0;

  // ---------------- Pass 2: Laplacian neighbourhood ----------------
  // blurVar = variance of the 3x3 Laplacian (kernel [[0,1,0],[1,-4,1],[0,1,0]]).
  // Also counts structural edges globally and in the center box (the latter is
  // used to distinguish glare-over-content from a normal text page).
  let lapSum = 0;
  let lapSum2 = 0;
  let lapN = 0;
  let edgeGlobal = 0;
  let edgeCenter = 0;
  let centerInterior = 0;
  for (let y = 1; y < H - 1; y++) {
    const inYCenter = y >= cy0 && y < cy1;
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const lap = gray[idx - W] + gray[idx + W] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
      lapSum += lap;
      lapSum2 += lap * lap;
      lapN++;
      const absLap = lap < 0 ? -lap : lap;
      if (absLap >= EDGE_LAP) edgeGlobal++;
      if (inYCenter && x >= cx0 && x < cx1) {
        centerInterior++;
        if (absLap >= EDGE_LAP) edgeCenter++;
      }
    }
  }
  const lapMean = lapN ? lapSum / lapN : 0;
  const blurVar = lapN ? lapSum2 / lapN - lapMean * lapMean : 0;
  const edgeDensityGlobal = lapN ? edgeGlobal / lapN : 0;
  const centerEdgeDensity = centerInterior ? edgeCenter / centerInterior : 0;

  // ---------------- Pass 3: noise in FLAT regions ----------------
  // Mean local std-dev over 3x3 windows, counting only "flat" windows (small
  // range) so that text/edges don't inflate the noise estimate. Strided for speed.
  let noiseSum = 0;
  let noiseN = 0;
  for (let y = 1; y < H - 1; y += 2) {
    for (let x = 1; x < W - 1; x += 2) {
      let s = 0;
      let s2 = 0;
      let mn = 255;
      let mx = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const row = (y + dy) * W + x;
        for (let dx = -1; dx <= 1; dx++) {
          const v = gray[row + dx];
          s += v;
          s2 += v * v;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      if (mx - mn < FLAT_RANGE) {
        const lv = s2 / 9 - (s / 9) * (s / 9);
        noiseSum += Math.sqrt(Math.max(0, lv));
        noiseN++;
      }
    }
  }
  const noiseStd = noiseN ? noiseSum / noiseN : 0;

  // ---------------- Skew via projection profile ----------------
  // Only meaningful when there is text (ink) on the page. Binarise (Otsu), then
  // for each candidate angle build the horizontal row-sum profile of ink pixels
  // and pick the angle that MAXIMISES the variance of that profile (text rows
  // align into sharp peaks at the true skew).
  let skewDeg = 0;
  let skewReliable = false;
  if (inkRatio >= 0.01 && inkRatio < 0.6) {
    skewDeg = estimateSkew(gray, W, H);
    skewReliable = true;
  }

  // ---------------- Screenshot bands ----------------
  // Flatness (variance) of the top and bottom 6% strips — a phone status bar or
  // a desktop title/nav bar is a near-uniform horizontal band. Aspect-ratio
  // matching is done on the main thread from the ORIGINAL dimensions.
  const topBandVar = bandVariance(gray, W, H, 0, Math.max(1, (H * 0.06) | 0));
  const botBandVar = bandVariance(gray, W, H, Math.min(H - 1, (H * 0.94) | 0), H);

  // ---------------- Occlusion ----------------
  // Largest connected dark blob at 1/4 resolution (iterative flood fill); flag
  // when it is both large and overlaps the center.
  const occ = largestDarkBlob(gray, W, H);

  return {
    procWidth: W,
    procHeight: H,
    brightness: brightness,
    inkRatio: inkRatio,
    veryDarkRatio: veryDarkRatio,
    luminanceVar: luminanceVar,
    quadMeans: quadMeans,
    shadowUnevenness: shadowUnevenness,
    glareCenterRatio: glareCenterRatio,
    blurVar: blurVar,
    edgeDensityGlobal: edgeDensityGlobal,
    centerEdgeDensity: centerEdgeDensity,
    noiseStd: noiseStd,
    skewDeg: skewDeg,
    skewReliable: skewReliable,
    topBandVar: topBandVar,
    botBandVar: botBandVar,
    occlusionRatio: occ.ratio,
    occlusionCentral: occ.central,
  };
}

// Otsu's threshold over a grayscale histogram.
function otsuThreshold(gray, N) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) hist[gray[i]]++;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = N - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

function estimateSkew(gray, W, H) {
  const thr = otsuThreshold(gray, W * H);
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < ink.length; i++) ink[i] = gray[i] < thr ? 1 : 0;

  // Use a CONSTANT bin layout (same `off`/`len`) for EVERY candidate angle, so
  // the row-sum profile variances are directly comparable across angles. If each
  // angle sized its own array, larger angles would get more empty padding bins,
  // which deflates their variance and biases the estimate toward 0° (under-
  // reporting skew). Size for the widest angle we ever evaluate (±13°, covering
  // the ±12° scan plus the 0.25° refine), then reuse one buffer.
  const maxRad = (13 * Math.PI) / 180;
  const off = Math.ceil(Math.abs(Math.tan(maxRad)) * W) + 1;
  const len = H + 2 * off;
  const rows = new Float64Array(len);

  let bestAngle = 0;
  let bestVar = -1;
  for (let deg = -12; deg <= 12; deg += 1) {
    const v = profileVariance(ink, W, H, (deg * Math.PI) / 180, off, len, rows);
    if (v > bestVar) {
      bestVar = v;
      bestAngle = deg;
    }
  }
  // Refine ±1° around the coarse best, at 0.25° steps.
  const coarse = bestAngle;
  for (let d = -1; d <= 1.0001; d += 0.25) {
    const deg = coarse + d;
    const v = profileVariance(ink, W, H, (deg * Math.PI) / 180, off, len, rows);
    if (v > bestVar) {
      bestVar = v;
      bestAngle = deg;
    }
  }
  return Math.round(bestAngle * 100) / 100;
}

// Variance of the row-sum profile after a shear approximation of rotation by
// `rad`. Row index of pixel (x,y) ≈ y + x*tan(theta); the FIXED offset/length
// (sized for the widest angle by the caller) keep every pixel in range and make
// variances comparable across angles. `rows` is a reused scratch buffer.
function profileVariance(ink, W, H, rad, off, len, rows) {
  rows.fill(0);
  const t = Math.tan(rad);
  for (let y = 0; y < H; y++) {
    const base = y * W;
    const yOff = y + off;
    for (let x = 0; x < W; x++) {
      if (ink[base + x]) {
        const ri = (yOff + t * x) | 0;
        rows[ri]++;
      }
    }
  }
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < len; i++) {
    s += rows[i];
    s2 += rows[i] * rows[i];
  }
  const m = s / len;
  return s2 / len - m * m;
}

function bandVariance(gray, W, H, y0, y1) {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const base = y * W;
    for (let x = 0; x < W; x++) {
      const v = gray[base + x];
      s += v;
      s2 += v * v;
      n++;
    }
  }
  if (!n) return 0;
  const m = s / n;
  return s2 / n - m * m;
}

// Largest connected component of dark pixels at 1/4 resolution (4-neighbour,
// iterative stack to avoid recursion blow-ups). Returns its area ratio (relative
// to the coarse mask) and whether it overlaps the center box.
function largestDarkBlob(gray, W, H) {
  const sw = Math.max(1, (W / 4) | 0);
  const sh = Math.max(1, (H / 4) | 0);
  const mask = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      mask[y * sw + x] = gray[y * 4 * W + x * 4] < DARK_LEVEL ? 1 : 0;
    }
  }
  const seen = new Uint8Array(sw * sh);
  const stack = [];
  let biggest = 0;
  let biggestCentral = false;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let size = 0;
    let central = false;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop();
      size++;
      const cx = c % sw;
      const cy = (c / sw) | 0;
      if (cx > sw * 0.25 && cx < sw * 0.75 && cy > sh * 0.25 && cy < sh * 0.75) central = true;
      // 4-neighbours, respecting row boundaries.
      if (cx > 0 && mask[c - 1] && !seen[c - 1]) {
        seen[c - 1] = 1;
        stack.push(c - 1);
      }
      if (cx < sw - 1 && mask[c + 1] && !seen[c + 1]) {
        seen[c + 1] = 1;
        stack.push(c + 1);
      }
      if (cy > 0 && mask[c - sw] && !seen[c - sw]) {
        seen[c - sw] = 1;
        stack.push(c - sw);
      }
      if (cy < sh - 1 && mask[c + sw] && !seen[c + sw]) {
        seen[c + sw] = 1;
        stack.push(c + sw);
      }
    }
    if (size > biggest) {
      biggest = size;
      biggestCentral = central;
    }
  }
  return { ratio: biggest / mask.length, central: biggestCentral };
}
