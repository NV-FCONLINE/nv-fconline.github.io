# NV · NAME VALUE

FC Online 클럽 NV 홈페이지입니다. 주소: https://nv-fconline.github.io/

첫 화면은 빨간 입자가 육각 N 마크로 모이는 연출(three.js)이고, 그 아래에 네 칸이 있습니다.

- 클럽 소개
- 내전 리그
- 운영진
- 가입 안내(티어 조건 배지 포함)

내용은 2026-10-28 인벤 클럽 모집글을 기준으로 했습니다.

## 구조

| 파일 | 역할 |
|---|---|
| `index.html` | 홈페이지 전체(CSS·JS 인라인, three.js 0.160.0은 jsDelivr에서 불러옴) |
| `club/index.html` | 클럽 공간(클럽원 전용): 디스코드 로그인, 공지사항(열람·확인 집계), 건의사항, 자유게시판. 서버는 `nv-api`(Cloudflare Worker, 별도 폴더) |
| `assets/nv-brand.js` | 투명 마크·워드마크 그림(data URI)과 입자 좌표(마크 6000점·워드마크 3000점) |
| `assets/nv-mark.png`, `assets/nv-wordmark.png` | 투명 배경 마크와 "NAME VALUE" 글자 |
| `assets/teams/*.webp` | 내전 리그 9팀 로고 |
| `assets/nv-club-mark.png` | 클럽마크 원본(검정 배경) |
| `assets/og-image.png` | 링크 미리보기 이미지(검정 배경 정사각형 512px) |
| `favicon-32.png`, `apple-touch-icon.png` | 탭·홈 화면 아이콘 |
| `tools/make_icons.py` | 원본에서 og-image와 아이콘을 다시 만드는 스크립트 |
| `tools/make_brand_assets.py` | 원본에서 투명 마크·워드마크와 `nv-brand.js`를 다시 만드는 스크립트 |

빌드 과정은 없습니다. GitHub Pages가 저장소 루트를 그대로 서빙합니다.

```bash
python tools/make_icons.py <클럽마크 원본.png> .
python tools/make_brand_assets.py <클럽마크 원본.png> .
```
