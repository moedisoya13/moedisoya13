# 미결 카탈로그 · 프로 복서 (`open.html`)

열린 결정을 모두 한 페이지에서 답하는 곳. 옛 미결 카탈로그(`pending.html`, `docs/pending-catalog.md`)를 대신한다.
파일: `open.html`(페이지·스타일), `src/open.mjs`(그리기·저장·제출), `src/open.data.mjs`(카드와 답의 규칙, node에서도 읽음),
`src/open.clips.mjs`(비교 영상의 목록, `tools/openclips.mjs`가 `docs/ref/open/`에 녹화), 시험 `tests/open.test.mjs`.

## 형식

- 카드 하나가 질문 하나(카드 id = 답의 키). 고르기 그리고/또는 메모. **누르거나 쓰는 즉시 저장**.
- 고른 답에 따라 같은 카드 안에 다음 질문이 열림(`follow`: `{ '값[,값]': [질문] }`). 부모의 답이 바뀌면 닫히고, 닫힌 질문의 답은
  보내는 글에 들어가지 않음(db에는 남음).
- ★는 권장 기본값일 뿐 — 고르지 않은 것은 답이 아님. 묶음마다 “이 묶음의 남은 것을 모두 ★로” 단추(누를 때만 고름, `starRest`).
- 답이 다 난 카드는 초록 띠. 이미 정해진 것(옛 카탈로그의 `DECIDED`와 그 db의 세 답)은 맨 아래 “정해진 것” 목록에만.
- 비교: `src/open.clips.mjs`의 한 그룹을 같은 너비·같은 시계·같은 장면으로 나란히(390 폭에 둘, 셋이면 2 + 1, 700 px 넘으면 셋),
  ◀ ▶ 한 프레임, 막대, ½× · ¼×, “크게”, 위 막대의 “모두 멈춤”. 녹화가 없으면 “녹화 대기”. 옛 항목의 카드는 옛 플레이어가 그대로
  돌림(`src/pending.mjs`의 `lend`: `#pending`이 없고 `data-pending-cards="<항목 id>"` 자리가 있는 페이지).
- 묶음: 점검에서 찾은 것(2026-11-25 자체 점검, `docs/audit-2026-11-25.md`) · 지금 정할 것 · 기획의 기본값 · 엔진 한계 · 파기 승인(승인 전에는 아무것도 지우지 않음) · 자유 메모.
- 이 페이지의 카드가 답을 받으면 데이터에서 빼고 `DECIDED_NEW`(맨 아래 "정해진 것")로 옮긴다.

## db 문서

`picks/open` 하나: `{ picks: { 질문 id: 값 ('a,b'는 여럿) }, notes: { 질문 id: 글 }, log: [{ k, v | memo, at }] (최근 120),
sent: [{ at, via: 'comment' | 'session', ok, code?, model?, effort?, session? }] (최근 20), at }`.
저장소가 없는 화면에서는 이 브라우저의 `localStorage`(`open-catalog.picks`)에만 남고 페이지가 그렇게 말함.

## 제출

받는 곳을 누르기 전에 고르고, 받을 수 있는지가 막대 아래에 나옴. 한 번 누르면: 고른 곳 → 안 되면 다른 곳 → 둘 다 안 되면 답을 복사
(“답 복사”는 따로도 있음). 시도마다 `sent`에 남음.
1. **이 페이지를 지켜보는 세션**: `comments.sendToClaude`(댓글로 보내 그 세션을 깨움). 편집자만, 지켜보는 세션이 있을 때만.
2. **새 세션**: `mcp`로 `Claude Code Remote`의 `create_session`(환경 `env_01KiMQGcomU8mZwk3NLBSJRM`, `moedisoya13/moedisoya13`,
   브랜치 `claude/vibrant-ritchie-xornhd`, 제목 “프로 복서”, 고른 모델·effort; 프롬프트는 답과 함께 `pixel-boxer/docs/handoff.md`를
   먼저 읽고 한국어로, 같은 브랜치에서 이어 가라고 함). **게시한 뒤 `SEND.page`에 이 페이지의 주소를 적고 다시 게시**한다(새 세션의
   프롬프트에 들어감).

게시할 때의 capabilities: `db`, `user`, `comments`(전체), `mcp`(`{ server: 'Claude Code Remote', tools: ['create_session'] }`).
파일: `node tools/artifact.mjs open.html src/open.mjs <out.html> > <files.json>`, `root`는 `pixel-boxer`.

## 항목을 더하는 법

`src/open.data.mjs`에 카드 하나: `{ id, group, title, state, list?, links?, clips?, opts: [[값, 이름, 뜻]], star, why, follow? }`.
id와 값은 저장 키라 바꾸지 않는다(글은 바꿔도 됨). 비교 영상이 있으면 `src/open.clips.mjs`에 그룹을 더하고 `clips`에 그 이름.
옛 카탈로그에서 가져온 항목은 `src/pending.data.mjs`의 것을 그대로 읽는다(긴 글은 `SHORT`에 줄여 적고 원문은 “자세히”에).
`node --test tests/open.test.mjs`.

## 세션이 답을 읽고 이어받는 법

- 읽기: `ArtifactData`의 `get`, `collection: 'picks'`, `doc_id: 'open'`(이 페이지의 주소로). `picks`·`notes`가 답, `sent`가 제출 기록.
  제출로 깨어났다면 댓글의 글이 같은 답(4 KiB에서 잘리면 나머지는 db에).
- 지켜보기를 넘겨받기: 새 세션은 이 페이지를 한 번 읽고(`Artifact` `read`) `ArtifactComments`로 지켜보기를 켠다. 그 뒤로는
  “이 페이지를 지켜보는 세션”이 그 세션이 됨. 답한 카드는 다음 게시에서 데이터에서 빼고 “정해진 것”으로 옮긴다.
