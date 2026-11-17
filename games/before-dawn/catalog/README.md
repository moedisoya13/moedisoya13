# 도감 (카탈로그)

카드·물건·적 전부를 스프라이트와 함께 보여 주는 한 장짜리 페이지. claude.ai Artifact로 게시하고, 항목에 달린 댓글로 수정 요청을 받는다.

- `data.json` — 내용. 지금은 `docs/GDD.md`의 튜닝 전 수치를 옮긴 것이다. 병합 뒤 게임 레지스트리의 실제 값으로 갱신한다.
- `template.html` — 페이지. 카드 효과 그림과 예고 모양은 여기의 canvas 코드로 그린다.
- `build.py` — `python3 catalog/build.py assets /tmp/out.html`: 데이터와 `assets/` 스프라이트를 넣어 한 파일로 만든다.
