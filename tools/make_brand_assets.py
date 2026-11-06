"""클럽마크 원본(검정 배경 PNG)에서 디자인 샘플용 자산을 만든다.

만드는 것 (out/assets/)
- nv-mark.png       : 빨간 육각 N 마크, 투명 배경 RGBA 512x512
- nv-wordmark.png   : 흰 "NAME VALUE" 글자, 투명 배경 RGBA (원본 비율)
- nv-brand.js       : window.NV = { colors, markPng, wordmarkPng(data URI), markPoints, wordmarkPoints, ... }
                      데이터 URI라 file:// 로 열어도 캔버스·WebGL 텍스처가 오염(taint)되지 않는다.

검정 → 투명 변환: 픽셀 밝기(max 채널)를 주변 7~9px 안의 가장 밝은 값(그 자리의 '꽉 찬 색')으로 나눈 값을
덮임 정도(alpha)로 보고, 색은 alpha로 나눠 원래 색을 되살린다. 위쪽의 어두운 진홍색도 반투명이 되지 않는다.
"""
import base64
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.stdout.reconfigure(encoding="utf-8")
src, out = Path(sys.argv[1]), Path(sys.argv[2])
assets = out / "assets"
assets.mkdir(parents=True, exist_ok=True)
im = Image.open(src).convert("RGB")


def black_to_alpha(img, solid_filter=9):
    arr = np.asarray(img).astype(np.float32)
    m = arr.max(axis=2)
    local = np.asarray(Image.fromarray(m.astype(np.uint8)).filter(ImageFilter.MaxFilter(solid_filter))).astype(
        np.float32
    )
    alpha = np.where(local > 30, np.clip(m / np.maximum(local, 1.0), 0.0, 1.0), 0.0)
    alpha[m < 10] = 0.0
    rgb = np.where(alpha[..., None] > 0.02, np.clip(arr / np.maximum(alpha[..., None], 1e-3), 0, 255), 0)
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")


def square_crop(img, box, margin=1.08):
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(x1 - x0, y1 - y0) * margin
    b = (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))
    canvas = Image.new("RGB", (b[2] - b[0], b[3] - b[1]), (0, 0, 0))
    part = img.crop((max(b[0], 0), max(b[1], 0), min(b[2], img.width), min(b[3], img.height)))
    canvas.paste(part, (max(0, -b[0]), max(0, -b[1])))
    return canvas


# 측정값: 빨간 마크 (230,62)-(502,359), 흰 글자 (147,397)-(584,453)
mark = black_to_alpha(square_crop(im, (224, 56, 508, 365), 1.06)).resize((512, 512), Image.LANCZOS)
word = black_to_alpha(im.crop((141, 391, 591, 459)), solid_filter=7)
word = word.resize((word.width * 2, word.height * 2), Image.LANCZOS)  # 900x136, 큰 화면용으로 2배
mark.save(assets / "nv-mark.png", optimize=True)
word.save(assets / "nv-wordmark.png", optimize=True)


def data_uri(img):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def sample_points(img, target, seed):
    """alpha>0.6인 픽셀에서 target개 안팎을 고르게 뽑는다. 좌표는 가로 기준 정규화(-0.5..0.5), y는 위가 +."""
    a = np.asarray(img).astype(np.float32)
    alpha = a[..., 3] / 255
    ys, xs = np.nonzero(alpha > 0.6)
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(xs), size=min(target, len(xs)), replace=False)
    w, h = img.size
    pts = []
    for i in idx:
        x, y = xs[i] + rng.random() - 0.5, ys[i] + rng.random() - 0.5
        r, g, b = a[ys[i], xs[i], :3] / 255
        pts += [round(x / w - 0.5, 4), round((0.5 - y / w) if w == h else (h / 2 - y) / w, 4),
                round(float(r), 3), round(float(g), 3), round(float(b), 3)]
    return pts, int(len(idx))


mark_pts, n_mark = sample_points(mark, 6000, 7)
word_pts, n_word = sample_points(word, 3000, 11)

brand = {
    "colors": {
        "bg": "#000000",
        "redTop": "#a0071e",
        "redBottom": "#e64a58",
        "redMid": "#c92d3f",
        "ink": "#d8d8d6",
        "sky": "#44a0c0",
        "skyTeal": "#38c0c8",
        "skyBlue": "#5890c8",
    },
    "markPng": data_uri(mark),
    "markSize": [512, 512],
    "wordmarkPng": data_uri(word),
    "wordmarkSize": list(word.size),
    "markPoints": mark_pts,
    "markPointCount": n_mark,
    "wordmarkPoints": word_pts,
    "wordmarkPointCount": n_word,
    "hexOrientation": "pointy-top (left/right sides vertical)",
    "links": {"league": "https://dindoopark.github.io/nv-league/"},
}
js = (
    "/* NV 브랜드 자산 — tools/make_brand_assets.py 로 생성. 손으로 고치지 말 것.\n"
    "   markPoints/wordmarkPoints: [x, y, r, g, b, x, y, r, g, b, ...] 평탄 배열.\n"
    "   x는 -0.5..0.5(가로 폭 기준), y는 위쪽이 +(같은 단위), r/g/b는 0..1. */\n"
    "window.NV = " + json.dumps(brand, ensure_ascii=False, separators=(",", ":")) + ";\n"
)
(assets / "nv-brand.js").write_text(js, encoding="utf-8")
print("mark points", n_mark, "wordmark points", n_word, "wordmark size", word.size)
for p in sorted(assets.iterdir()):
    print(p.name, p.stat().st_size)
