#!/usr/bin/env python3
"""
generate_fixtures.py
====================
Generates a comprehensive set of test documents/images for the client-side
document intake validation layer (validators/* + workers/validation-worker.js).

Each fixture is crafted to exercise ONE (or a small family of) the 16 checks, so
you can drag them into the demo and confirm the expected PASS/FAIL outcome and
the user-facing message. See test-fixtures/README.md for the full expectation
table. Re-run with:  python3 test-fixtures/generate_fixtures.py

Requires: Pillow, numpy, and (for the password/corrupt PDFs) ghostscript `gs`.
"""

import os
import shutil
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
PASS_DIR = os.path.join(HERE, "should-pass")
FAIL_DIR = os.path.join(HERE, "should-fail")

FONT_PATH = "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf"

# A4 at 150 dpi (comfortably above the 150-dpi / 1000x1400 floors).
A4_W, A4_H = 1240, 1754

SAMPLE_LINES = [
    "REPUBLIC OF EXAMPLE  -  IDENTITY VERIFICATION RECORD",
    "",
    "Full Name:        JORDAN ALEX MORGAN",
    "Date of Birth:    14 MARCH 1987",
    "Document Number:  X1234567",
    "Address:          221B BAKER STREET, NEW CITY, 100190",
    "Issued:           02 JANUARY 2021      Expires: 02 JANUARY 2031",
    "",
    "This document certifies that the named individual has been registered",
    "with the national identity authority. The information recorded above",
    "was verified against supporting documentation at the time of issue.",
    "Any alteration of this record renders it invalid. Report suspected",
    "fraud to the issuing office quoting the document number shown.",
    "",
    "Authorised Signature: ____________________     Seal No: 88-204-117",
]


def font(size, bold=False):
    path = FONT_BOLD if bold else FONT_PATH
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default(size=size)


def render_document(w=A4_W,
                    h=A4_H,
                    lines=SAMPLE_LINES,
                    size=30,
                    bg=255,
                    fg=20,
                    margin=90):
    """A clean white 'document' with crisp, OCR-readable black text and a border."""
    img = Image.new("RGB", (w, h), (bg, bg, bg))
    d = ImageDraw.Draw(img)
    # outer frame (gives the quality checks some structure / edges)
    d.rectangle([margin - 30, margin - 30, w - margin + 30, h - margin + 30],
                outline=(fg, fg, fg),
                width=3)
    f = font(size)
    fbold = font(size + 8, bold=True)
    y = margin
    for i, line in enumerate(lines):
        use = fbold if i == 0 else f
        d.text((margin, y), line, fill=(fg, fg, fg), font=use)
        y += int((size + 8) * 1.55) if i == 0 else int(size * 1.5)
    return img


def to_gray_arr(img):
    return np.asarray(img.convert("L"), dtype=np.float32)


def save(img, path, **kw):
    img.save(path, **kw)
    print("  wrote", os.path.relpath(path, HERE),
          f"({os.path.getsize(path)} B)")


def reset_dirs():
    for d in (PASS_DIR, FAIL_DIR):
        if os.path.isdir(d):
            shutil.rmtree(d)
        os.makedirs(d)


def make_pass():
    print("[should-pass]")
    base = render_document()
    save(base, os.path.join(PASS_DIR, "doc-clean-portrait.png"))
    save(base, os.path.join(PASS_DIR, "doc-clean.jpg"), quality=92)

    land = render_document(w=A4_H, h=A4_W, size=30)
    save(land, os.path.join(PASS_DIR, "doc-clean-landscape.png"))

    dense = render_document(lines=SAMPLE_LINES * 2, size=24)
    save(dense, os.path.join(PASS_DIR, "doc-dense-text.png"))

    # Mild skew (~4 deg) — below the 12 deg fail threshold, should still PASS.
    skew = base.rotate(-4,
                       expand=False,
                       fillcolor=(255, 255, 255),
                       resample=Image.BICUBIC)
    save(skew, os.path.join(PASS_DIR, "doc-mild-skew.png"))

    # Valid PDF: embed a document image; PDF.js rasterises it and OCR reads the
    # rendered text pixels.
    save(base,
         os.path.join(PASS_DIR, "doc-clean.pdf"),
         format="PDF",
         resolution=150.0)
    return base


def make_fail(base):
    print("[should-fail]")

    # 7 Blur ---------------------------------------------------------------
    # Radius 2.5: drops focus score below 100 but keeps enough center edge
    # structure that the (higher-priority) glare check does NOT also trip.
    blur = base.filter(ImageFilter.GaussianBlur(2.5))
    save(blur, os.path.join(FAIL_DIR, "fail-blur.png"))

    # 12 Brightness (too dark) --------------------------------------------
    arr = np.asarray(base, dtype=np.float32) * 0.12
    dark = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    save(dark, os.path.join(FAIL_DIR, "fail-too-dark.png"))

    # 12 Brightness (overexposed) / 16 Blank family — washed almost to white.
    white = Image.new("RGB", base.size, (255, 255, 255))
    over = Image.blend(base, white, 0.93)
    save(over, os.path.join(FAIL_DIR, "fail-overexposed.png"))

    # 9 Glare — text in the top & bottom QUARTERS only (keeps global edges/ink so
    # brightness & blank pass), leaving the central box (25-75%) a fully blown
    # white region with no structure → glare fires as the headline.
    glare = Image.new("RGB", (A4_W, A4_H), (255, 255, 255))
    gd = ImageDraw.Draw(glare)
    gf = font(18)
    y = 35
    for line in SAMPLE_LINES:  # top quarter (ends well above the 25% line)
        gd.text((90, y), line, fill=(20, 20, 20), font=gf)
        y += 24
    y = A4_H - 20 - len(SAMPLE_LINES) * 24  # bottom quarter (starts below 75%)
    for line in SAMPLE_LINES:
        gd.text((90, y), line, fill=(20, 20, 20), font=gf)
        y += 24
    save(glare, os.path.join(FAIL_DIR, "fail-glare.png"))

    # 8 Shadow / uneven lighting — left third heavily darkened (quadrant
    # unevenness), right side normal.
    sh = np.asarray(base, dtype=np.float32).copy()
    grad = np.ones(sh.shape[1], dtype=np.float32)
    third = sh.shape[1] // 2
    grad[:third] = np.linspace(0.12, 1.0, third)
    sh *= grad[None, :, None]
    shadow = Image.fromarray(np.clip(sh, 0, 255).astype(np.uint8))
    save(shadow, os.path.join(FAIL_DIR, "fail-shadow.png"))

    # 13 Noise / grain — gaussian sensor noise on a NON-white (gray ~205)
    # background so the noise isn't clipped to white; flat-region std then reads
    # ~the true sigma. (Pure-white pages clip noise and mute the metric.)
    graybg = render_document(bg=205, fg=25)
    # sigma 40 survives the ~1000px downscale (which averages noise down) to a
    # flat-region std of ~14, above the maxNoiseStd=12 gate.
    arr = np.asarray(graybg, dtype=np.float32) + np.random.normal(
        0, 40, (A4_H, A4_W, 3))
    noisy = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    save(noisy, os.path.join(FAIL_DIR, "fail-noise.png"))

    # 11 Skew — strongly rotated (~22 deg).
    sk = base.rotate(-22,
                     expand=False,
                     fillcolor=(255, 255, 255),
                     resample=Image.BICUBIC)
    save(sk, os.path.join(FAIL_DIR, "fail-skew.png"))

    # 10 DPI / resolution — too small.
    low = render_document(w=600, h=850, size=15, margin=40)
    save(low, os.path.join(FAIL_DIR, "fail-low-res.png"))

    # 16 Blank page — pure white.
    save(Image.new("RGB", (A4_W, A4_H), (255, 255, 255)),
         os.path.join(FAIL_DIR, "fail-blank.png"))

    # 14 Screenshot — phone aspect (1080x2340 ~= 19.5:9) with flat status & nav
    # bars top and bottom.
    shot = Image.new("RGB", (1080, 2340), (255, 255, 255))
    inner = render_document(w=1000,
                            h=1900,
                            lines=SAMPLE_LINES,
                            size=26,
                            margin=50)
    shot.paste(inner, (40, 230))
    sd = ImageDraw.Draw(shot)
    # LIGHT flat UI bars (like a light-mode status/nav bar). Light (not dark) so
    # they don't trip the higher-priority shadow check (very-dark ratio), while
    # staying uniform enough (low band variance) to read as screenshot UI bars.
    sd.rectangle([0, 0, 1080, 140], fill=(214, 217, 224))  # status bar (flat)
    sd.rectangle([0, 2180, 1080, 2340], fill=(214, 217, 224))  # nav bar (flat)
    save(shot, os.path.join(FAIL_DIR, "fail-screenshot.png"))

    # 15 Occlusion — large mid-gray blob (Y~40: counts as occlusion, but above the
    # very-dark shadow level) covering the central document area.
    occ = base.copy()
    od = ImageDraw.Draw(occ)
    w, h = occ.size
    od.rectangle([w * 0.22, h * 0.28, w * 0.78, h * 0.72], fill=(40, 40, 40))
    save(occ, os.path.join(FAIL_DIR, "fail-occlusion.png"))

    # 2 Allowed format — real GIF / BMP / WEBP (unsupported extensions). These
    # only need to exercise the extension gate, so keep them small.
    small = base.resize((480, 679), Image.BOX)
    for ext in ("gif", "bmp", "webp"):
        small.save(os.path.join(FAIL_DIR, "fail-unsupported." + ext))
        print("  wrote should-fail/fail-unsupported." + ext)

    # 3 Extension vs signature — PNG bytes named .pdf, and text named .png.
    base.save(os.path.join(FAIL_DIR,
                           "fail-png-bytes.pdf-renamed.png"))  # helper
    shutil.move(os.path.join(FAIL_DIR, "fail-png-bytes.pdf-renamed.png"),
                os.path.join(FAIL_DIR, "fail-mime-png-as-pdf.pdf"))
    print("  wrote should-fail/fail-mime-png-as-pdf.pdf (PNG bytes, .pdf ext)")
    with open(os.path.join(FAIL_DIR, "fail-mime-text-as-png.png"), "w") as fh:
        # Pad above the 1 KB size floor so this trips the SIGNATURE check (its
        # purpose), not the size check.
        fh.write(
            "This is plain text, not a PNG. The magic-byte check must reject it.\n"
            * 40)
    print(
        "  wrote should-fail/fail-mime-text-as-png.png (text bytes, .png ext)")

    # 1 File size — suspiciously tiny (valid 1x1 png, well under 1 KB).
    save(Image.new("RGB", (1, 1), (255, 255, 255)),
         os.path.join(FAIL_DIR, "fail-tiny.png"))

    # 4 Corruption — truncated JPEG / PNG (decode fails).
    jpg = os.path.join(FAIL_DIR, "fail-corrupt.jpg")
    base.save(jpg, quality=90)
    _truncate(jpg, 0.45)
    png = os.path.join(FAIL_DIR, "fail-corrupt.png")
    base.save(png)
    _truncate(png, 0.40)


def _truncate(path, frac):
    data = open(path, "rb").read()
    keep = max(16, int(len(data) * frac))
    with open(path, "wb") as fh:
        fh.write(data[:keep])
    print("  truncated", os.path.relpath(path, HERE), f"-> {keep} B")


def make_pdfs():
    """Password-protected and corrupt PDFs (need ghostscript)."""
    print("[pdf variants]")
    clean_pdf = os.path.join(PASS_DIR, "doc-clean.pdf")
    if not shutil.which("gs"):
        print("  gs not found — skipping password/corrupt PDFs")
        return
    # 5 Password — encrypt the clean PDF (user password required to open).
    pw_pdf = os.path.join(FAIL_DIR, "fail-password.pdf")
    cmd = [
        "gs",
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-sDEVICE=pdfwrite",
        "-sOwnerPassword=owner4242",
        "-sUserPassword=secret4242",
        "-dEncryptionR=3",
        "-dKeyLength=128",
        "-dPermissions=-44",
        "-o",
        pw_pdf,
        clean_pdf,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(pw_pdf) and b"/Encrypt" in open(pw_pdf, "rb").read():
        print(
            "  wrote should-fail/fail-password.pdf (user password: secret4242)"
        )
    else:
        print("  WARNING: password PDF may not be encrypted:",
              r.stderr.strip()[:200])

    # 4 Corruption — truncate a valid PDF.
    corrupt = os.path.join(FAIL_DIR, "fail-corrupt.pdf")
    shutil.copy(clean_pdf, corrupt)
    _truncate(corrupt, 0.5)


def main():
    np.random.seed(7)  # deterministic noise
    reset_dirs()
    base = make_pass()
    make_fail(base)
    make_pdfs()
    n_pass = len(os.listdir(PASS_DIR))
    n_fail = len(os.listdir(FAIL_DIR))
    print(f"\nDone: {n_pass} should-pass + {n_fail} should-fail fixtures.")


if __name__ == "__main__":
    main()
