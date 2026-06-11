#!/usr/bin/env python3
"""
verify_fixtures.py
==================
Sanity-checks the generated fixtures by RE-IMPLEMENTING the validation worker's
pixel math (workers/validation-worker.js) and the image-quality / orchestrator
thresholds (validators/config.js, image-quality.js, document-intake.js) in numpy,
then predicting the PASS/FAIL outcome + the headline check for each IMAGE fixture.

Offline cross-check only (no browser/Node): OCR (check 6), PDF rasterisation,
password and EXIF orientation are NOT evaluated here and are marked BROWSER-ONLY.
Everything else mirrors the shipped code: downscale-to-1000px for most metrics,
a NATIVE-resolution centre crop for luma+chroma noise, p90-highlight brightness,
solidity-gated occlusion, and 90-degree rotation detection.

Run after generate_fixtures.py:  python3 test-fixtures/verify_fixtures.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))

# --- mirror validators/config.js -------------------------------------------
CFG = dict(
    maxFileSizeBytes=50 * 1024 * 1024,
    minFileSizeBytes=1024,
    maxImagePixels=40 * 1000 * 1000,
    allowedExtensions={"pdf", "jpg", "jpeg", "png"},
    downscaleLongSide=1000,
    noiseCropMaxSide=900,
    minImageWidth=500,
    minImageHeight=700,
    minBlurScore=200,
    maxBrightness=248,
    minBrightnessHighlight=90,
    overexposedMaxEdgeDensity=0.01,
    washoutMinBrightness=215,
    washoutMinEdge=0.03,
    washoutMaxInk=0.015,
    washoutMaxBlur=1500,
    maxGlareAreaRatio=0.15,
    glareMaxCenterEdgeDensity=0.02,
    maxShadowAreaRatio=0.10,
    maxShadowUnevenness=95,
    maxNoiseStd=12,
    maxChromaNoiseStd=8,
    maxSkewDegrees=12,
    maxOcclusionAreaRatio=0.15,
    occlusionMaxInternalEdgeDensity=0.04,
    screenshotScoreFail=0.75,
    maxBlankPageInkRatio=0.01,
    maxBlankLuminanceVar=120,
)
# worker internal constants
DARK, VERY_DARK, BLOWN, BLOWN_SAT, EDGE_LAP, FLAT_RANGE = 50, 30, 250, 12, 24, 120
SCREEN_RATIOS = [18 / 9, 19.5 / 9, 20 / 9]  # 4:3 and 16:9 excluded

PRIORITY = [
    "format", "signature", "size", "corruption", "password", "blank",
    "resolution", "brightness", "blur", "glare", "shadow", "occlusion",
    "screenshot", "skew", "noise", "ocr"
]

MAGIC = {"pdf": b"%PDF", "jpg": b"\xff\xd8\xff", "png": b"\x89PNG\r\n\x1a\n"}
TYPE_EXT = {"pdf": {"pdf"}, "jpg": {"jpg", "jpeg"}, "png": {"png"}}


def sniff(path):
    head = open(path, "rb").read(16)
    for t, sig in MAGIC.items():
        if head.startswith(sig):
            return t
    return None


def downscale_gray_rgb(im):
    w, h = im.size
    longside = max(w, h)
    if longside > CFG["downscaleLongSide"]:
        s = CFG["downscaleLongSide"] / longside
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.BOX)
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    Y = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] +
         0.114 * rgb[..., 2]).astype(np.float32)
    return Y, rgb


def native_center_crop(im, maxside):
    im = im.convert("RGB")
    w, h = im.size
    cw, ch = min(w, maxside), min(h, maxside)
    l, t = (w - cw) // 2, (h - ch) // 2
    return np.asarray(im.crop((l, t, l + cw, t + ch)), dtype=np.float32)


def laplacian(Y):
    return Y[:-2, 1:-1] + Y[2:,
                            1:-1] + Y[1:-1, :-2] + Y[1:-1,
                                                     2:] - 4 * Y[1:-1, 1:-1]


def flat_noise_lc(rgb):
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    Y = 0.299 * R + 0.587 * G + 0.114 * B
    Cr, Cb = R - Y, B - Y
    H, W = Y.shape
    yi = np.arange(1, H - 1, 2)
    xi = np.arange(1, W - 1, 2)

    def win(M):
        return np.stack([
            M[np.ix_(yi + dy, xi + dx)] for dy in (-1, 0, 1)
            for dx in (-1, 0, 1)
        ], 0)

    wy = win(Y)
    flat = (wy.max(0) - wy.min(0)) < FLAT_RANGE
    if flat.sum() == 0:
        return 0.0, 0.0
    luma = np.sqrt(np.clip(wy.var(0), 0, None))[flat].mean()
    chroma = ((np.sqrt(np.clip(win(Cr).var(0), 0, None)) +
               np.sqrt(np.clip(win(Cb).var(0), 0, None))) / 2)[flat].mean()
    return float(luma), float(chroma)


def metrics(im):
    Y, rgb = downscale_gray_rgb(im)
    H, W = Y.shape
    m = {}
    m["brightness"] = float(Y.mean())
    m["brightnessP90"] = float(np.percentile(Y, 90))
    m["inkRatio"] = float((Y < DARK).mean())
    m["veryDarkRatio"] = float((Y < VERY_DARK).mean())
    m["luminanceVar"] = float(Y.var())
    h2, w2 = H // 2, W // 2
    q = [
        Y[:h2, :w2].mean(), Y[:h2, w2:].mean(), Y[h2:, :w2].mean(),
        Y[h2:, w2:].mean()
    ]
    m["shadowUnevenness"] = float(max(q) - min(q))
    cy0, cy1, cx0, cx1 = int(H * .25), int(H * .75), int(W * .25), int(W * .75)
    sat = rgb.max(2) - rgb.min(2)
    cmask = (Y[cy0:cy1, cx0:cx1] >= BLOWN) & (sat[cy0:cy1, cx0:cx1]
                                              < BLOWN_SAT)
    m["glareCenterRatio"] = float(cmask.mean()) if cmask.size else 0.0
    lap = laplacian(Y)
    m["blurVar"] = float(lap.var())
    edge = np.abs(lap) >= EDGE_LAP
    m["edgeDensityGlobal"] = float(edge.mean())
    ec = edge[cy0 - 1:cy1 - 1, cx0 - 1:cx1 - 1]
    m["centerEdgeDensity"] = float(ec.mean()) if ec.size else 0.0
    # noise on the NATIVE crop (luma + chroma)
    luma, chroma = flat_noise_lc(
        native_center_crop(im, CFG["noiseCropMaxSide"]))
    m["noiseStd"], m["chromaNoiseStd"] = luma, chroma
    # skew + 90-degree rotation (on a centre crop; see analyze_orientation)
    m["skewDeg"], m["rotated90"], m["skewReliable"] = analyze_orientation(Y)
    tb = Y[:max(1, int(H * .06)), :]
    bb = Y[min(H - 1, int(H * .94)):, :]
    m["topBandVar"], m["botBandVar"] = float(tb.var()), float(bb.var())
    m["occlusionRatio"], m["occlusionCentral"], m[
        "occlusionEdgeDensity"] = occlusion(Y)
    return m


def otsu(Y):
    hist, _ = np.histogram(Y, bins=256, range=(0, 256))
    total = Y.size
    sumall = np.dot(np.arange(256), hist)
    sumB = wB = 0.0
    best, thr = 0.0, 127
    for t in range(256):
        wB += hist[t]
        if wB == 0:
            continue
        wF = total - wB
        if wF == 0:
            break
        sumB += t * hist[t]
        mB, mF = sumB / wB, (sumall - sumB) / wF
        between = wB * wF * (mB - mF)**2
        if between > best:
            best, thr = between, t
    return thr


def analyze_orientation(Y):
    H, W = Y.shape
    mm = 0.12
    x0, x1, y0, y1 = int(W * mm), int(W * (1 - mm)), int(H * mm), int(H *
                                                                      (1 - mm))
    crop = Y[y0:y1, x0:x1]
    if crop.shape[0] < 8 or crop.shape[1] < 8:
        return 0.0, False, False
    ink = (crop < otsu(crop)).astype(np.float32)
    inkRatio = float(ink.mean())
    if inkRatio < 0.01 or inkRatio > 0.35:
        return 0.0, False, False
    rotated90 = float(ink.sum(0).var()) > float(ink.sum(1).var()) * 4.0
    return skew_angle(ink), rotated90, True


def skew_angle(ink):
    H, W = ink.shape
    maxt = np.tan(np.deg2rad(13))
    off = int(np.ceil(abs(maxt) * W)) + 1
    length = H + 2 * off
    xs = np.arange(W)
    yy = np.arange(H)[:, None]
    best_a, best_v = 0.0, -1.0
    for deg in list(np.arange(-12, 12.001, 1)):
        v = profile_var(ink, xs, yy, np.tan(np.deg2rad(deg)), off, length)
        if v > best_v:
            best_v, best_a = v, deg
    for d in np.arange(-1, 1.001, 0.25):
        deg = best_a + d
        v = profile_var(ink, xs, yy, np.tan(np.deg2rad(deg)), off, length)
        if v > best_v:
            best_v, best_a = v, deg
    return round(best_a * 100) / 100


def profile_var(ink, xs, yy, t, off, length):
    ri = (yy + off + t * xs).astype(np.int32)
    np.clip(ri, 0, length - 1, out=ri)
    rows = np.bincount(ri.ravel(), weights=ink.ravel(),
                       minlength=length)[:length]
    return float(rows.var())


def occlusion(Y):
    sub = Y[::4, ::4]
    mask = (sub < DARK)
    lbl, n = ndimage.label(mask)
    if n == 0:
        return 0.0, False, 0.0
    sizes = ndimage.sum(mask, lbl, range(1, n + 1))
    big = int(np.argmax(sizes)) + 1
    ratio = sizes.max() / mask.size
    ys, xs = np.where(lbl == big)
    sh, sw = mask.shape
    central = bool(((xs > sw * .25) & (xs < sw * .75) & (ys > sh * .25) &
                    (ys < sh * .75)).any())
    # internal edge density of the biggest blob, sampled at full(downscaled) res
    H, W = Y.shape
    fx, fy = xs * 4, ys * 4
    keep = (fx >= 1) & (fy >= 1) & (fx < W - 1) & (fy < H - 1)
    fx, fy = fx[keep], fy[keep]
    if fx.size == 0:
        return float(ratio), central, 0.0
    lap = (Y[fy - 1, fx] + Y[fy + 1, fx] + Y[fy, fx - 1] + Y[fy, fx + 1] -
           4 * Y[fy, fx])
    internal = float((np.abs(lap) >= EDGE_LAP).mean())
    return float(ratio), central, internal


def evaluate(path):
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    size = os.path.getsize(path)
    fails = []
    # 1 size (bytes)
    if size > CFG["maxFileSizeBytes"] or size < CFG["minFileSizeBytes"]:
        return ["size"]
    # 2 format
    if ext not in CFG["allowedExtensions"]:
        return ["format"]
    # 3 signature (relaxed: only the content type must be supported)
    sig = sniff(path)
    if not sig:
        return ["signature"]
    if sig == "pdf":
        return "browser-only"  # PDF decode/OCR/password/multipage need the browser
    # 1b dimension bomb (read header dims without full decode)
    try:
        ow, oh = Image.open(path).size
    except Exception:
        return ["corruption"]
    if ow * oh > CFG["maxImagePixels"]:
        return ["size"]
    # decode (catch truncated)
    try:
        im = Image.open(path)
        im.load()
        ow, oh = im.size
    except Exception:
        return ["corruption"]
    m = metrics(im)

    # 16 blank (pixel-only here; OCR is browser-only)
    if m["inkRatio"] < CFG["maxBlankPageInkRatio"] and m["luminanceVar"] < CFG[
            "maxBlankLuminanceVar"]:
        fails.append("blank")
    # 10 resolution (pixel dims only; DPI informational)
    if min(ow, oh) < CFG["minImageWidth"] or max(ow,
                                                 oh) < CFG["minImageHeight"]:
        fails.append("resolution")
    # 12 brightness (p90 highlight for dark; mean+edges for bright)
    if m["brightnessP90"] < CFG["minBrightnessHighlight"]:
        fails.append("brightness")
    elif m["brightness"] > CFG["maxBrightness"] and m[
            "edgeDensityGlobal"] < CFG["overexposedMaxEdgeDensity"]:
        fails.append("brightness")
    elif (m["brightness"] > CFG["washoutMinBrightness"]
          and m["edgeDensityGlobal"] > CFG["washoutMinEdge"]
          and m["inkRatio"] < CFG["washoutMaxInk"]
          and CFG["minBlurScore"] <= m["blurVar"] < CFG["washoutMaxBlur"]):
        fails.append("brightness")  # washed-out overexposure
    # 7 blur
    has_content = m["inkRatio"] >= 0.008 or m["edgeDensityGlobal"] >= 0.01
    if has_content and m["blurVar"] < CFG["minBlurScore"]:
        fails.append("blur")
    # 9 glare
    if m["glareCenterRatio"] > CFG["maxGlareAreaRatio"] and m[
            "centerEdgeDensity"] < CFG["glareMaxCenterEdgeDensity"]:
        fails.append("glare")
    # 8 shadow (BOTH conditions)
    if m["veryDarkRatio"] > CFG["maxShadowAreaRatio"] and m[
            "shadowUnevenness"] > CFG["maxShadowUnevenness"]:
        fails.append("shadow")
    # 15 occlusion (large + central + SOLID)
    if (m["occlusionRatio"] > CFG["maxOcclusionAreaRatio"]
            and m["occlusionCentral"] and m["occlusionEdgeDensity"]
            < CFG["occlusionMaxInternalEdgeDensity"]):
        fails.append("occlusion")
    # 14 screenshot
    ar, inv = ow / oh, oh / ow
    aspect = any(
        abs(ar - r) < 0.03 or abs(inv - r) < 0.03 for r in SCREEN_RATIOS)
    score = (0.5 if aspect else 0) + (0.25 if m["topBandVar"] < 25 else 0) + (
        0.25 if m["botBandVar"] < 25 else 0)
    if score >= CFG["screenshotScoreFail"]:
        fails.append("screenshot")
    # 11 skew / rotation
    if m["skewReliable"] and (m["rotated90"]
                              or abs(m["skewDeg"]) > CFG["maxSkewDegrees"]):
        fails.append("skew")
    # 13 noise (luma OR chroma)
    if m["noiseStd"] > CFG["maxNoiseStd"] or m["chromaNoiseStd"] > CFG[
            "maxChromaNoiseStd"]:
        fails.append("noise")
    return fails, m


def headline(fails):
    for p in PRIORITY:
        if p in fails:
            return p
    return fails[0] if fails else "-"


def main():
    rows = []
    for sub in ("should-pass", "should-fail"):
        d = os.path.join(HERE, sub)
        for name in sorted(os.listdir(d)):
            path = os.path.join(d, name)
            res = evaluate(path)
            if res == "browser-only":
                rows.append((sub, name, "BROWSER-ONLY", "-"))
                continue
            fails = res[0] if isinstance(res, tuple) else res
            status = "PASS" if not fails else "FAIL"
            rows.append((sub, name, status, headline(fails)))
    print(f"{'dir':<13} {'fixture':<36} {'predicted':<12} {'headline check'}")
    print("-" * 80)
    bad = 0
    for sub, name, status, hc in rows:
        expect_pass = sub == "should-pass"
        ok = (status == "PASS") == expect_pass or status == "BROWSER-ONLY"
        flag = "" if ok else "  <-- UNEXPECTED"
        if not ok:
            bad += 1
        print(f"{sub:<13} {name:<36} {status:<12} {hc}{flag}")
    print("-" * 80)
    print("All pixel-based fixtures behaved as expected." if bad ==
          0 else f"{bad} fixture(s) did not match expectation.")


if __name__ == "__main__":
    main()
