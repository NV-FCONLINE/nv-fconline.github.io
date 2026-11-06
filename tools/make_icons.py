"""클럽마크 원본(검정 배경 PNG)에서 사이트용 이미지를 만든다.

- assets/nv-club-mark.png : 원본 그대로(검정 배경, 731x584)
- assets/og-image.png     : 빨간 육각 N 마크만 잘라 정사각형 512px(검정 배경, 링크 미리보기용)
- favicon-32.png / apple-touch-icon.png(180) : 탭·홈 화면 아이콘
"""
import sys
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
out = Path(sys.argv[2])
(out / "assets").mkdir(parents=True, exist_ok=True)

im = Image.open(src).convert("RGB")
im.save(out / "assets" / "nv-club-mark.png", optimize=True)

# 측정한 빨간 마크 영역(230,62)-(502,359)에 여백을 두고 정사각형으로 자른다.
x0, y0, x1, y1 = 230, 62, 502, 359
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
side = max(x1 - x0, y1 - y0) * 1.12
box = (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))
canvas = Image.new("RGB", (round(side), round(side)), (0, 0, 0))
crop = im.crop((max(box[0], 0), max(box[1], 0), min(box[2], im.width), min(box[3], im.height)))
canvas.paste(crop, (max(0, -box[0]), max(0, -box[1])))

canvas.resize((512, 512), Image.LANCZOS).save(out / "assets" / "og-image.png", optimize=True)
canvas.resize((180, 180), Image.LANCZOS).save(out / "apple-touch-icon.png", optimize=True)
canvas.resize((32, 32), Image.LANCZOS).save(out / "favicon-32.png", optimize=True)
print("box", box, "side", round(side))
for p in sorted(out.rglob("*.png")):
    print(p.relative_to(out), Image.open(p).size, p.stat().st_size)
