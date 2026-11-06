# NV · NAME VALUE

FC Online 클럽 NV 홈페이지입니다. 주소: https://nv-fconline.github.io/

지금은 준비 중 페이지만 있습니다.

## 구조

| 파일 | 역할 |
|---|---|
| `index.html` | 첫 화면 |
| `assets/nv-club-mark.png` | 클럽마크 원본(검정 배경) |
| `assets/nv-mark.png` | 육각 N 마크만 자른 정사각형(512px, 미리보기 이미지) |
| `favicon-32.png`, `apple-touch-icon.png` | 탭·홈 화면 아이콘 |
| `tools/make_icons.py` | 클럽마크 원본에서 위 이미지들을 다시 만드는 스크립트 |

빌드 과정은 없습니다. GitHub Pages가 저장소 루트를 그대로 서빙합니다.

```bash
python tools/make_icons.py <클럽마크 원본.png> .
```
