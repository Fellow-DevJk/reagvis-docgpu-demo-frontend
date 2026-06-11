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
const GLARE_HOTSPOT_DELTA = 45; // a block this much brighter than the paper median = glare
const GLARE_HOTSPOT_MAX_EDGE = 0.03; // ...and this smooth (specular reflections have no text)
const GLARE_STREAK_BLOWN = 0.25; // a block with >this fraction clipped-white = a blown streak
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
    // Noise is measured on an optional NATIVE-resolution crop (msg.noiseBuffer);
    // if absent, it falls back to the downscaled frame inside computeMetrics.
    const noise = msg.noiseBuffer
      ? { buffer: msg.noiseBuffer, width: msg.noiseWidth, height: msg.noiseHeight }
      : null;
    const metrics = computeMetrics(msg.width, msg.height, msg.buffer, noise);
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

function computeMetrics(W, H, buffer, noiseFrame) {
  const data = new Uint8ClampedArray(buffer);
  const N = W * H;
  const gray = new Uint8Array(N);
  const hist = new Uint32Array(256); // luminance histogram for the p90 highlight
  const edgeMap = new Uint8Array(N); // strong-edge mask (filled in pass 2)

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
      hist[Y]++;
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

  // 90th-percentile luminance — the document's highlights/paper. Used for the
  // "too dark" test so a dark surround doesn't drag a well-lit doc under.
  let brightnessP90 = 255;
  let acc = 0;
  const p90Target = N * 0.9;
  for (let t = 0; t < 256; t++) {
    acc += hist[t];
    if (acc >= p90Target) {
      brightnessP90 = t;
      break;
    }
  }

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
      if (absLap >= EDGE_LAP) {
        edgeGlobal++;
        edgeMap[idx] = 1;
      }
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

  // Localized glare/reflection analysis on a coarse block grid. Two signals:
  //  - hotspot: a smooth region much brighter than the paper (glare on a dim page)
  //  - streak:  localized blown (clipped-white) blocks on an otherwise NON-uniformly
  //             -blown page (specular streaks on bright/laminated paper). A clean
  //             scan is UNIFORMLY blown, so it scores 0 here.
  const glareA = glareAnalysis(gray, edgeMap, W, H);
  const glareHotspotRatio = glareA.hotspot;
  const glareStreakRatio = glareA.streak;

  // ---------------- Noise (luma + chroma) on the NATIVE crop ----------------
  // Measured on msg.noiseBuffer (a native-resolution centre crop) so real grain
  // isn't averaged away by the global downscale. Falls back to the downscaled
  // RGBA frame when no native crop is supplied (e.g. PDFs).
  const noise = noiseFrame
    ? computeNoise(new Uint8ClampedArray(noiseFrame.buffer), noiseFrame.width, noiseFrame.height)
    : computeNoise(data, W, H);
  const noiseStd = noise.luma;
  const chromaNoiseStd = noise.chroma;

  // ---------------- Skew + gross-rotation via projection profile ----------------
  // Computed on a CENTRE crop (borders/frames/dark backgrounds otherwise pollute
  // the ink projections) with a text-like ink gate, so the metric reflects the
  // actual text lines: fine skew from the row-projection argmax, and a ~90°
  // rotation when column structure dominates row structure.
  const orient = analyzeOrientation(gray, W, H);
  const skewDeg = orient.skewDeg;
  const skewReliable = orient.reliable;
  const rotated90 = orient.rotated90;

  // ---------------- Screenshot bands ----------------
  // Flatness (variance) of the top and bottom 6% strips — a phone status bar or
  // a desktop title/nav bar is a near-uniform horizontal band. Aspect-ratio
  // matching is done on the main thread from the ORIGINAL dimensions.
  const topBandVar = bandVariance(gray, W, H, 0, Math.max(1, (H * 0.06) | 0));
  const botBandVar = bandVariance(gray, W, H, Math.min(H - 1, (H * 0.94) | 0), H);

  // ---------------- Occlusion ----------------
  // Largest connected dark blob at 1/4 resolution (iterative flood fill); also
  // measures the blob's INTERNAL edge density so a solid occluder (finger/object)
  // can be told apart from detailed dark content (an ID photo, QR, logo).
  const occ = largestDarkBlob(gray, W, H);

  return {
    procWidth: W,
    procHeight: H,
    brightness: brightness,
    brightnessP90: brightnessP90,
    inkRatio: inkRatio,
    veryDarkRatio: veryDarkRatio,
    luminanceVar: luminanceVar,
    quadMeans: quadMeans,
    shadowUnevenness: shadowUnevenness,
    glareCenterRatio: glareCenterRatio,
    glareHotspotRatio: glareHotspotRatio,
    glareStreakRatio: glareStreakRatio,
    blurVar: blurVar,
    edgeDensityGlobal: edgeDensityGlobal,
    centerEdgeDensity: centerEdgeDensity,
    noiseStd: noiseStd,
    chromaNoiseStd: chromaNoiseStd,
    skewDeg: skewDeg,
    skewReliable: skewReliable,
    rotated90: rotated90,
    topBandVar: topBandVar,
    botBandVar: botBandVar,
    occlusionRatio: occ.ratio,
    occlusionCentral: occ.central,
    occlusionEdgeDensity: occ.internalEdgeDensity,
  };
}

// Mean local std-dev of luma AND chroma in FLAT 3x3 windows of an RGBA frame.
// Flat windows (small luma range) exclude text/edges so only sensor grain is
// measured. Chroma uses cheap Cr=R-Y / Cb=B-Y proxies and catches colour speckle
// that luma misses. Strided for speed.
function computeNoise(rgba, W, H) {
  let lumaSum = 0;
  let chromaSum = 0;
  let n = 0;
  for (let y = 1; y < H - 1; y += 2) {
    for (let x = 1; x < W - 1; x += 2) {
      let sY = 0, s2Y = 0, sCr = 0, s2Cr = 0, sCb = 0, s2Cb = 0;
      let mn = 255, mx = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const p = ((y + dy) * W + (x + dx)) * 4;
          const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
          const Yv = 0.299 * r + 0.587 * g + 0.114 * b;
          const cr = r - Yv;
          const cb = b - Yv;
          sY += Yv; s2Y += Yv * Yv;
          sCr += cr; s2Cr += cr * cr;
          sCb += cb; s2Cb += cb * cb;
          const yv = Yv | 0;
          if (yv < mn) mn = yv;
          if (yv > mx) mx = yv;
        }
      }
      if (mx - mn < FLAT_RANGE) {
        lumaSum += Math.sqrt(Math.max(0, s2Y / 9 - (sY / 9) * (sY / 9)));
        const crStd = Math.sqrt(Math.max(0, s2Cr / 9 - (sCr / 9) * (sCr / 9)));
        const cbStd = Math.sqrt(Math.max(0, s2Cb / 9 - (sCb / 9) * (sCb / 9)));
        chromaSum += (crStd + cbStd) / 2;
        n++;
      }
    }
  }
  return { luma: n ? lumaSum / n : 0, chroma: n ? chromaSum / n : 0 };
}

// Estimate fine skew and detect a ~90° rotation, on a CENTRE crop so frames and
// dark backgrounds don't pollute the ink projections. Returns reliable:false
// when the crop's ink isn't text-like (too little, or a big dark region).
function analyzeOrientation(gray, W, H) {
  const m = 0.12; // drop the outer 12% on each side
  const x0 = (W * m) | 0,
    x1 = (W * (1 - m)) | 0,
    y0 = (H * m) | 0,
    y1 = (H * (1 - m)) | 0;
  const cw = x1 - x0,
    ch = y1 - y0;
  if (cw < 8 || ch < 8) return { skewDeg: 0, rotated90: false, reliable: false };

  const crop = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    const src = (y0 + y) * W + x0;
    for (let x = 0; x < cw; x++) crop[y * cw + x] = gray[src + x];
  }

  const thr = otsuThreshold(crop, cw * ch);
  const ink = new Uint8Array(cw * ch);
  let inkCount = 0;
  for (let i = 0; i < crop.length; i++) {
    const v = crop[i] < thr ? 1 : 0;
    ink[i] = v;
    inkCount += v;
  }
  const inkRatio = inkCount / (cw * ch);
  // Text-like only: a near-blank crop or a big solid dark region (background,
  // shadow, occluder) can't give a meaningful skew/rotation estimate.
  if (inkRatio < 0.01 || inkRatio > 0.35) return { skewDeg: 0, rotated90: false, reliable: false };

  const rowSum = new Float64Array(ch);
  const colSum = new Float64Array(cw);
  for (let y = 0; y < ch; y++) {
    const base = y * cw;
    for (let x = 0; x < cw; x++) {
      if (ink[base + x]) {
        rowSum[y]++;
        colSum[x]++;
      }
    }
  }
  // Upright text ⇒ rows alternate text/gap ⇒ rowVar dominates. A genuine ~90°
  // rotation makes columns dominate by a LARGE factor (real rotations measure
  // ~20x); the 4x bar clears the residual asymmetry a thin dark border leaves.
  const rotated90 = variance(colSum) > variance(rowSum) * 4.0;
  const skewDeg = estimateSkew(crop, cw, ch);
  return { skewDeg: skewDeg, rotated90: rotated90, reliable: true };
}

function variance(arr) {
  let s = 0, s2 = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[i];
    s2 += arr[i] * arr[i];
  }
  const m = s / arr.length;
  return s2 / arr.length - m * m;
}

// Localized glare/reflection detector over a coarse block grid. For each block it
// measures mean brightness, edge density, and blown (clipped-white) fraction, then
// among "content" blocks (bright enough to be document, not dark background)
// returns two ratios:
//   hotspot — blocks much brighter than the paper median AND smooth (no text):
//             a specular highlight on a dim/under-lit page.
//   streak  — blocks heavily blown (clipped white), but ONLY when the page is not
//             uniformly blown (a clean bright scan is uniformly blown → 0): a
//             specular reflection streak on bright/laminated paper.
function glareAnalysis(gray, edgeMap, W, H) {
  const bs = Math.max(8, (H / 16) | 0);
  const means = [];
  const edges = [];
  const blown = [];
  for (let by = 0; by + bs <= H; by += bs) {
    for (let bx = 0; bx + bs <= W; bx += bs) {
      let sum = 0;
      let ec = 0;
      let bc = 0;
      let n = 0;
      for (let y = by; y < by + bs; y++) {
        const row = y * W;
        for (let x = bx; x < bx + bs; x++) {
          const v = gray[row + x];
          sum += v;
          ec += edgeMap[row + x];
          if (v >= BLOWN_LEVEL) bc++;
          n++;
        }
      }
      means.push(sum / n);
      edges.push(ec / n);
      blown.push(bc / n);
    }
  }
  const content = [];
  for (let i = 0; i < means.length; i++) if (means[i] >= 100) content.push(i);
  if (content.length === 0) return { hotspot: 0, streak: 0 };
  const cm = content.map(function (i) { return means[i]; }).sort(function (a, b) { return a - b; });
  const cb = content.map(function (i) { return blown[i]; }).sort(function (a, b) { return a - b; });
  const paperMed = cm[cm.length >> 1];
  const medBlown = cb[cb.length >> 1];
  let hotspot = 0;
  let streak = 0;
  for (let k = 0; k < content.length; k++) {
    const i = content[k];
    if (means[i] > paperMed + GLARE_HOTSPOT_DELTA && edges[i] < GLARE_HOTSPOT_MAX_EDGE) hotspot++;
    if (blown[i] > GLARE_STREAK_BLOWN) streak++;
  }
  return {
    hotspot: hotspot / content.length,
    // A uniformly-blown page (clean bright scan) is not glare — only count streaks
    // when most of the page is NOT blown.
    streak: medBlown < 0.5 ? streak / content.length : 0,
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
  const comp = [];
  let biggest = 0;
  let biggestCentral = false;
  let biggestCells = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let central = false;
    stack.length = 0;
    comp.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
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
    if (comp.length > biggest) {
      biggest = comp.length;
      biggestCentral = central;
      biggestCells = comp.slice();
    }
  }

  // Internal edge density of the biggest blob, sampled at full resolution: a
  // SOLID occluder (finger/object) has few internal edges; detailed content (an
  // ID photo, QR, logo) has many — letting the caller spare such content.
  let internalEdgeDensity = 0;
  if (biggestCells && biggestCells.length) {
    let edges = 0;
    let checked = 0;
    for (let j = 0; j < biggestCells.length; j++) {
      const cx = (biggestCells[j] % sw) * 4;
      const cy = ((biggestCells[j] / sw) | 0) * 4;
      if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= H - 1) continue;
      const i = cy * W + cx;
      const lap = gray[i - W] + gray[i + W] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      if ((lap < 0 ? -lap : lap) >= EDGE_LAP) edges++;
      checked++;
    }
    if (checked) internalEdgeDensity = edges / checked;
  }

  return { ratio: biggest / mask.length, central: biggestCentral, internalEdgeDensity: internalEdgeDensity };
}
