"""App icons and Android launch screens from one drawing: the forró count, three steps and a pause
(the beat editor's 1-2-3 dots and hollow pause circle). Adapted from pico-reader's make_icons.py.

    python3 scripts/make_icons.py      (needs Pillow; run from app/)

Writes public/icons/icon-{192,512}.png and the Android mipmaps, adaptive-icon foregrounds and splash images.
"""

from pathlib import Path

from PIL import Image, ImageDraw

PAPER = "#faf8f3"
ONE, TWO, THREE, PAUSE = "#3d5a80", "#3f7a3a", "#c0582b", "#a39e94"
RES = Path("android/app/src/main/res")


def steps(size: int, scale: float = 1.0, background: str | None = PAPER) -> Image.Image:
    """Four dots in a row centred on a `size` square; `scale` < 1 leaves room (adaptive-icon safe zone).
    The three is the biggest: it's the accented click."""
    s = 4 * size
    im = Image.new("RGBA", (s, s), background or (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cy = s / 2
    gap = s * 0.2 * scale
    x0 = s / 2 - 1.5 * gap
    for i, (color, r) in enumerate([(ONE, 0.075), (TWO, 0.075), (THREE, 0.095), (PAUSE, 0.06)]):
        cx, rr = x0 + i * gap, s * r * scale
        box = [cx - rr, cy - rr, cx + rr, cy + rr]
        if color == PAUSE:
            d.ellipse(box, outline=color, width=max(2, int(s * 0.018 * scale)))
        else:
            d.ellipse(box, fill=color)
    return im.resize((size, size), Image.LANCZOS)


def round_mask(im: Image.Image) -> Image.Image:
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, im.size[0] - 1, im.size[1] - 1], fill=255)
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im, mask=mask)
    return out


def main() -> None:
    Path("public/icons").mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        steps(size).convert("RGB").save(f"public/icons/icon-{size}.png")
    if not RES.exists():
        return
    for density, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        folder = RES / f"mipmap-{density}"
        steps(px).save(folder / "ic_launcher.png")
        round_mask(steps(px)).save(folder / "ic_launcher_round.png")
        # adaptive icon: 108dp canvas, the visible part is the middle 72dp
        steps(int(px * 108 / 48), scale=0.62, background=None).save(folder / "ic_launcher_foreground.png")
    for folder in RES.glob("drawable*"):
        splash = folder / "splash.png"
        if splash.exists():
            w, h = Image.open(splash).size
            canvas = Image.new("RGB", (w, h), PAPER)
            icon = steps(min(w, h) // 3, background=None)
            canvas.paste(icon, ((w - icon.width) // 2, (h - icon.height) // 2), icon)
            canvas.save(splash)
    (RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{PAPER.upper()}</color>\n</resources>\n')


if __name__ == "__main__":
    main()
