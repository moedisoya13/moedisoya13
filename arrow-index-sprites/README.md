# Arrow Index sprites

Arrow Index artifact (https://claude.ai/artifact/Vq5XJTdumovhH2qVmLuV3o, version 1791427363-f801)에서 추출.
원본은 이미지가 아니라 코드 안의 문자 비트맵(`ART`, `ICONS`, `DIGITS`)과 절차적 회전 sprite라서,
게임의 `parseRows → withOutline → rasterize`를 그대로 실행해 PNG로 뽑았다 (`export.js`).

- 색: 잉크 `#ece8dc`, 종이 `#08080a`, 나머지 투명. 1px 검정 외곽선 포함 (게임과 동일)
- `1x/` 원본 픽셀, `4x/` 정수배 확대 (nearest-neighbor)
- `art/<name>/<name>_<frame>.png` 궁수·몬스터·보스·소환수·아이템 (32종, 프레임별)
- `art_elite/` 정예 몬스터용 반전 variant
- `sheets/art_<name>.png` 프레임 가로 strip, `sheets/digits.png`, `sheets/dither_17.png`
- `icons/` 레벨업 카드 아이콘 24종, `digits/` 데미지 숫자 3x5 폰트
- `procedural/` 화살 5종(arrow/long/bolt/dart/quill)·활(rest/drawn)·깃털, 64방향 8x8 시트 + 0° 단일
- `atlas.json` 크기·프레임 수·시트 좌표
- 다시 뽑기: `node export.js <artifact.html> <outdir>` (playwright 필요)
