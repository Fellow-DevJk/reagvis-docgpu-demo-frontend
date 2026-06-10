#!/usr/bin/env python3
"""
verify_fixtures.py
==================
Sanity-checks the generated fixtures by RE-IMPLEMENTING the validation worker's
pixel math (workers/validation-worker.js) and the image-quality / orchestrator
thresholds (validators/config.js, image-quality.js, document-intake.js) in numpy,
then predicting the PASS/FAIL outcome + the headline check for each IMAGE fixture.

This is an offline cross-check (this repo has no browser/Node), so OCR (check 6)
and PDF rasterisation are NOT evaluated here — those fixtures are marked
"browser-only". For every pixel-based image it confirms the fixture really does
trip (or not trip) the intended check, with the SAME downscale-to-1000px,
Rec.601 luma, and thresholds as the shipped code.

Run after generate_fixtures.py:  python3 test-fixtures/verify_fixtures.py
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))

# --- mirror validators/config.js -------------------------------------------
CFG = dict(
    maxFileSizeBytes=50 * 1024 * 1024,
    minFileSizeBytes=1024,
    allowedExtensions={"pdf", "jpg", "jpeg", "png"},
    downscaleLongSide=1000,
    minImageWidth=1000,
    minImageHeight=1400,
    minEstimatedDpi=150,
    minBlurScore=100,
    minBrightness=45,
    maxBrightness=248,
    overexposedMaxEdgeDensity=0.01,
    maxGlareAreaRatio=0.15,
    glareMaxCenterEdgeDensity=0.02,
    maxShadowAreaRatio=0.10,
    maxShadowUnevenness=70,
    maxNoiseStd=12,
    maxSkewDegrees=12,
    maxOcclusionAreaRatio=0.15,
    screenshotScoreFail=0.75,
    maxBlankPageInkRatio=0.01,
    maxBlankLuminanceVar=120,
)
# worker internal constants
DARK, VERY_DARK, BLOWN, BLOWN_SAT, EDGE_LAP, FLAT_RANGE = 50, 30, 250, 12, 24, 120

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


def downscale_gray_rgb(img):
    w, h = img.size
    longside = max(w, h)
    if longside > CFG["downscaleLongSide"]:
        s = CFG["downscaleLongSide"] / longside
        img = img.resize((max(1, round(w * s)), max(1, round(h * s))),
                         Image.BOX)
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
    Y = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] +
         0.114 * rgb[..., 2]).astype(np.float32)
    return Y, rgb


def laplacian(Y):
    lap = (Y[:-2, 1:-1] + Y[2:, 1:-1] + Y[1:-1, :-2] + Y[1:-1, 2:] -
           4 * Y[1:-1, 1:-1])
    return lap


def metrics(path, orig_w, orig_h):
    img = Image.open(path)
    Y, rgb = downscale_gray_rgb(img)
    H, W = Y.shape
    N = H * W
    m = {}
    m["brightness"] = float(Y.mean())
    m["inkRatio"] = float((Y < DARK).mean())
    m["veryDarkRatio"] = float((Y < VERY_DARK).mean())
    m["luminanceVar"] = float(Y.var())
    # quadrants
    h2, w2 = H // 2, W // 2
    q = [
        Y[:h2, :w2].mean(), Y[:h2, w2:].mean(), Y[h2:, :w2].mean(),
        Y[h2:, w2:].mean()
    ]
    m["shadowUnevenness"] = float(max(q) - min(q))
    # center box 25-75
    cy0, cy1, cx0, cx1 = int(H * .25), int(H * .75), int(W * .25), int(W * .75)
    sat = rgb.max(2) - rgb.min(2)
    cmask = (Y[cy0:cy1, cx0:cx1] >= BLOWN) & (sat[cy0:cy1, cx0:cx1]
                                              < BLOWN_SAT)
    m["glareCenterRatio"] = float(cmask.mean()) if cmask.size else 0.0
    # laplacian / edges
    lap = laplacian(Y)
    m["blurVar"] = float(lap.var())
    edge = np.abs(lap) >= EDGE_LAP
    m["edgeDensityGlobal"] = float(edge.mean())
    ec = edge[cy0:cy1, cx0:cx1]
    m["centerEdgeDensity"] = float(ec.mean()) if ec.size else 0.0
    # noise in flat 3x3 windows (strided)
    m["noiseStd"] = flat_noise(Y)
    # skew
    m["skewReliable"] = (0.01 <= m["inkRatio"] < 0.6)
    m["skewDeg"] = skew_angle(Y) if m["skewReliable"] else 0.0
    # screenshot bands (top/bottom 6%)
    tb = Y[:max(1, int(H * .06)), :]
    bb = Y[min(H - 1, int(H * .94)):, :]
    m["topBandVar"], m["botBandVar"] = float(tb.var()), float(bb.var())
    # occlusion (1/4 res largest dark blob)
    m["occlusionRatio"], m["occlusionCentral"] = occlusion(Y)
    m["origW"], m["origH"] = orig_w, orig_h
    return m


def flat_noise(Y):
    H, W = Y.shape
    acc, n = 0.0, 0
    ys = range(1, H - 1, 2)
    xs = range(1, W - 1, 2)
    # vectorise: build 3x3 windows on a strided grid
    yi = np.arange(1, H - 1, 2)
    xi = np.arange(1, W - 1, 2)
    win = np.stack([
        Y[np.ix_(yi + dy, xi + dx)] for dy in (-1, 0, 1) for dx in (-1, 0, 1)
    ], 0)
    mn, mx = win.min(0), win.max(0)
    var = win.var(0)
    flat = (mx - mn) < FLAT_RANGE
    if flat.sum() == 0:
        return 0.0
    return float(np.sqrt(np.clip(var[flat], 0, None)).mean())


def skew_angle(Y):
    thr = otsu(Y)
    ink = (Y < thr).astype(np.float32)
    H, W = ink.shape
    maxt = np.tan(np.deg2rad(13))
    off = int(np.ceil(abs(maxt) * W)) + 1
    length = H + 2 * off
    xs = np.arange(W)
    yy = np.arange(H)[:, None]
    best_a, best_v = 0.0, -1.0
    angles = list(np.arange(-12, 12.001, 1))
    for deg in angles:
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
    ri = (yy + off + t * xs).astype(np.int32)  # H x W row indices
    np.clip(ri, 0, length - 1,
            out=ri)  # stay in-range (JS path is bounded too)
    rows = np.bincount(ri.ravel(), weights=ink.ravel(),
                       minlength=length)[:length]
    return float(rows.var())


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
        mB = sumB / wB
        mF = (sumall - sumB) / wF
        between = wB * wF * (mB - mF)**2
        if between > best:
            best, thr = between, t
    return thr


def occlusion(Y):
    sub = Y[::4, ::4]
    mask = (sub < DARK)
    from scipy import ndimage  # optional
    lbl, n = ndimage.label(mask)
    if n == 0:
        return 0.0, False
    sizes = ndimage.sum(mask, lbl, range(1, n + 1))
    big = int(np.argmax(sizes)) + 1
    ratio = sizes.max() / mask.size
    ys, xs = np.where(lbl == big)
    sh, sw = mask.shape
    central = bool(((xs > sw * .25) & (xs < sw * .75) & (ys > sh * .25) &
                    (ys < sh * .75)).any())
    return float(ratio), central


def evaluate(path):
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    size = os.path.getsize(path)
    fails = []
    # 1 size
    if size > CFG["maxFileSizeBytes"] or size < CFG["minFileSizeBytes"]:
        fails.append("size")
        return fails  # cheap fail short-circuits
    # 2 format
    if ext not in CFG["allowedExtensions"]:
        fails.append("format")
        return fails
    # 3 signature
    sig = sniff(path)
    if not sig or ext not in TYPE_EXT.get(sig, set()):
        fails.append("signature")
        return fails
    if sig == "pdf":
        return "browser-only"  # PDF decode/OCR/password need the browser
    # decode (catch truncated)
    try:
        im = Image.open(path)
        im.load()
        ow, oh = im.size
    except Exception:
        fails.append("corruption")
        return fails
    m = metrics(path, ow, oh)
    # 16 blank (pixel side; OCR assumed present for non-blank synthetic text)
    if m["inkRatio"] < CFG["maxBlankPageInkRatio"] and m["luminanceVar"] < CFG[
            "maxBlankLuminanceVar"]:
        fails.append("blank")
    # 10 resolution (images)
    dpi = round((max(ow, oh) / 11.69 + min(ow, oh) / 8.27) / 2)
    if min(ow, oh) < CFG["minImageWidth"] or max(
            ow, oh) < CFG["minImageHeight"] or dpi < CFG["minEstimatedDpi"]:
        fails.append("resolution")
    # 12 brightness
    if m["brightness"] < CFG["minBrightness"]:
        fails.append("brightness")
    elif m["brightness"] > CFG["maxBrightness"] and m[
            "edgeDensityGlobal"] < CFG["overexposedMaxEdgeDensity"]:
        fails.append("brightness")
    # 7 blur (skip if no content)
    has_content = m["inkRatio"] >= 0.008 or m["edgeDensityGlobal"] >= 0.01
    if has_content and m["blurVar"] < CFG["minBlurScore"]:
        fails.append("blur")
    # 9 glare
    if m["glareCenterRatio"] > CFG["maxGlareAreaRatio"] and m[
            "centerEdgeDensity"] < CFG["glareMaxCenterEdgeDensity"]:
        fails.append("glare")
    # 8 shadow
    if m["veryDarkRatio"] > CFG["maxShadowAreaRatio"] or m[
            "shadowUnevenness"] > CFG["maxShadowUnevenness"]:
        fails.append("shadow")
    # 15 occlusion
    if m["occlusionRatio"] > CFG["maxOcclusionAreaRatio"] and m[
            "occlusionCentral"]:
        fails.append("occlusion")
    # 14 screenshot
    ar, inv = ow / oh, oh / ow
    ratios = [16 / 9, 18 / 9, 19.5 / 9, 20 / 9]
    aspect = any(abs(ar - r) < 0.03 or abs(inv - r) < 0.03 for r in ratios)
    score = (0.5 if aspect else 0) + (0.25 if m["topBandVar"] < 25 else 0) + (
        0.25 if m["botBandVar"] < 25 else 0)
    if score >= CFG["screenshotScoreFail"]:
        fails.append("screenshot")
    # 11 skew
    if m["skewReliable"] and abs(m["skewDeg"]) > CFG["maxSkewDegrees"]:
        fails.append("skew")
    # 13 noise
    if m["noiseStd"] > CFG["maxNoiseStd"]:
        fails.append("noise")
    return fails, m


def headline(fails):
    for p in PRIORITY:
        if p in fails:
            return p
    return fails[0] if fails else None


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
            rows.append((sub, name, status, headline(fails) or "-"))
    print(f"{'dir':<13} {'fixture':<34} {'predicted':<12} {'headline check'}")
    print("-" * 78)
    bad = 0
    for sub, name, status, hc in rows:
        expect_pass = sub == "should-pass"
        ok = (status == "PASS") == expect_pass or status == "BROWSER-ONLY"
        flag = "" if ok else "  <-- UNEXPECTED"
        if not ok:
            bad += 1
        print(f"{sub:<13} {name:<34} {status:<12} {hc}{flag}")
    print("-" * 78)
    print("All pixel-based fixtures behaved as expected." if bad ==
          0 else f"{bad} fixture(s) did not match expectation.")


if __name__ == "__main__":
    main()
