# 긱뉴스 일일 다이제스트 → 카카오톡

매일 아침 [긱뉴스(GeekNews)](https://news.hada.io/new)의 새 글을 모아 요약하고,
**카카오톡 '나와의 채팅'** 으로 한 통 보내주는 GitHub Actions 자동화입니다.

```
news.hada.io/rss/news  →  최근 24h 필터 · 중복 제거  →  Claude 요약  →  카카오톡 나에게 보내기
                                                                        └→ digests/ 아카이브 커밋

카카오 기본 리스트 템플릿은 한 통에 2~3건만 담긴다. 그래서 6건은 3+3 두 통으로 나가고,
건수를 바꾸려면 geeknews/main.py 의 MAX_ITEMS 만 고치면 분할은 자동으로 따라온다.
(4건이면 2+2, 5건이면 3+2, 7건이면 3+2+2 — 끝에 1건만 남는 분할은 만들지 않는다.)
```

## 동작

| 항목 | 내용 |
|---|---|
| 실행 시각 | 매일 **KST 08:40 목표** (`cron: 40 23 * * *`) |
| 분량 | 하루 **최대 6건** — 리스트 템플릿 **2통(3+3)**, 카톡 알림 2회 |
| 요약 | Anthropic API (`claude-sonnet-5`), 제목 40자 / 요약 60자 |
| 중복 방지 | `state/seen.json` 에 보낸 링크를 기록 (최근 200건) |
| 기록 | `digests/YYYY-MM-DD.md` 로 커밋 |

> GitHub Actions 의 `schedule` 은 정시를 보장하지 않고 통상 수 분~수십 분 지연됩니다.
> 목표 도착 시각 08:50 KST 에 맞추려고 10분 앞당겨 걸어 두었지만, 정확한 시각은 보장되지 않습니다.

## 설정

카카오 토큰 발급과 시크릿 등록 절차는 **[docs/SETUP-KAKAO.md](docs/SETUP-KAKAO.md)** 에 있습니다.

> **메시지는 오는데 항목을 눌러도 안 열린다면** 카카오 앱에 `https://news.hada.io` 도메인이
> 등록되지 않은 것입니다. 카카오는 등록된 도메인으로만 메시지 링크를 열어줍니다.
> [SETUP-KAKAO.md 2-1](docs/SETUP-KAKAO.md#2-1-링크-도메인-등록-빠뜨리면-링크가-안-열립니다) 참고.

| Secret | 용도 | 없을 때 |
|---|---|---|
| `KAKAO_REST_API_KEY` | 발송 | 발송만 건너뛰고 정상 종료 |
| `KAKAO_REFRESH_TOKEN` | 발송 | 발송만 건너뛰고 정상 종료 |
| `KAKAO_CLIENT_SECRET` | 발송 | 앱에서 Client Secret 을 켰다면 **필수**, 껐다면 비워 둘 것 |
| `ANTHROPIC_API_KEY` | 요약 | 원문을 잘라 쓰는 폴백 요약 |
| `GH_PAT` (선택) | refresh_token 자동 로테이션 | 안내 이슈 생성으로 대체 |

## 왜 PlayMCP 가 아니라 REST API 인가

PlayMCP 의 `KakaotalkChat-MemoChat` 은 카카오 계정 OAuth 로 붙는 remote MCP 서버라
GitHub Actions 러너에서 헤드리스 인증이 되지 않습니다. 그래서 그 도구가 내부적으로
호출하는 것과 **같은 REST API**(`/v2/api/talk/memo/default/send`)를 직접 씁니다.
카카오톡에 도착하는 결과는 동일합니다.

## 수집 소스에 대한 실측 기록

Actions 러너에서 직접 측정한 결과(2026-09-07):

| 주소 | 결과 | 처리 |
|---|---|---|
| `https://news.hada.io/rss/news` | **200**, Atom, 50건 | 유일한 수집 소스로 사용 |
| `https://news.hada.io/new` | **403 Forbidden** (CloudFront) | 크롤링 포기. 메시지 링크로만 사용 |
| `https://news.hada.io/rss/topics` | 404 | 존재하지 않음 |
| `https://feeds.hada.io/...` | DNS 조회 실패 | 존재하지 않는 호스트 |

`/new` 의 403 은 User-Agent 를 바꿔도(레포 UA / `Mozilla/5.0` / UA 없음) 동일했습니다.
UA 문제가 아니라 CDN 단의 접근 차단이므로 **우회하지 않고** HTML 크롤링을 포기했습니다.
사이트가 공식 RSS 를 제공하므로 그쪽만 씁니다.

## 보안

- 시크릿은 GitHub Actions Secrets 에만 두고, 발송 스텝에만 주입합니다. 커밋 스텝은 받지 않습니다.
- 모든 시크릿은 `SecretStr` 로 감쌉니다 — `print`·f-string·traceback 어디에 섞여도 값이 나오지 않습니다.
- 외부 응답을 로그에 남길 때는 `mask()` 를 통과시키고, 런타임 토큰은 `::add-mask::` 로 등록합니다.
- 긱뉴스 본문은 신뢰할 수 없는 입력으로 다룹니다. 요약 프롬프트에서 데이터와 지시를 분리하고,
  **링크는 모델 출력에서 가져오지 않고** 크롤러가 뽑은 원본 URL만 씁니다.
- 커밋 직전 `scripts/scan_output.py` 로 토큰 패턴을 스캔해, 걸리면 커밋을 막습니다.
- 트리거는 `schedule` 과 `workflow_dispatch` 뿐입니다. fork PR 이 시크릿에 닿을 경로가 없습니다.

## 개발

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
python -m geeknews.main --dry-run   # 발송 없이 수집·요약 결과와 템플릿 출력
```
