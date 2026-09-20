# TypeSafe Jev vs 기존 LLM

TypeSafe AI가 2026-09-15에 공개한 **Jev**(System One 모델)가 기존 LLM과 무엇이 다른지
작동 원리 · 활용 · 특기 영역 세 축으로 정리한 문서입니다.
같은 폴더에 칼럼 형식의 인터랙티브 페이지가 함께 있습니다.

| 파일 | 용도 |
|---|---|
| `jev-column.html` | **단독 실행본.** 브라우저로 바로 열면 되는 완전한 HTML 문서 (doctype · charset · viewport 포함) |
| `index.html` | 아티팩트 게시용 원본. 스켈레톤이 감싸 주는 것을 전제로 `<html>`/`<head>`/`<body>` 태그가 없습니다 |

본문 안의 그림 1·2·3·5는 직접 조작할 수 있습니다. 웹폰트(Hahmlet · Noto Serif KR · IBM Plex Mono)는
Google Fonts에서 받아오므로 오프라인에서는 시스템 세리프로 대체 표시됩니다.

## 1. 작동 원리

| | 기존 LLM (System Two) | Jev (System One) |
|---|---|---|
| 생성 방식 | 자기회귀 — 토큰을 하나씩 순차 생성 | 비자기회귀 — **단일 병렬 패스**로 전체 답 동시 산출 |
| 입력 | 프롬프트(문자열) | `state`(비정형 상태) + **타입이 선언된 질문 목록** |
| 출력 | 문자열 → 파싱 필요 | 타입 값 + **보정된 확률** (Boolean / Choice / Score) |
| 학습 목표 | RLHF — 사람이 선호하는 문장 | **RLCD** (Reinforcement Learning for Calibrated Decisions) — 확률과 실제 적중률의 일치 |
| 질문 N개 비용 | N배 | 한 번의 패스에서 병렬 처리 → 거의 동일 |
| 출력 과금 | 있음 | **$0** (생성 토큰이 존재하지 않음) |

- **primitives**: `Boolean`(참 확률), `Choice`(보기 중 하나 + 보기별 확률), `Score`(순서 있는 등급 + 분포)
- **보정(calibration)은 집단 성질**이다. "확신 0.8로 내린 판단들의 약 80%가 맞다"는 뜻이지,
  개별 건의 정답을 보장하지 않는다.
- 스키마 고정 → **형식 오류·환각은 구조적으로 불가능**. 단, **보기 안에서 오답을 고르는 것은 가능**하다.

## 2. 수치 (TypeSafe 자체 벤치마크, 4개 워크플로)

| 항목 | Jev | 프런티어 LLM |
|---|---|---|
| 지연 | 0.4초 (실사용 70–500ms) | 10–38초 |
| 건당 비용 | $0.0004 | $0.0304 – $0.1761 |
| 정확도 | 67.8% | 67.9% (GPT-5.6 Terra) |

- 가격: **$0.042 / 1M 입력 토큰**, 출력 무료. 컨텍스트 **32K**(요청 총합 64K), `Choice` 보기 **최대 255개**.
- ⚠️ 위 표는 **벤더가 만들고 벤더가 채점한** 벤치마크다. 정답지는 타 모델 출력의 평균.
- 유일한 제3자 테스트(Every): 속도·비용 주장은 재현됐으나 정확도는 **Jev 67.8% vs 비교군 최고 74.1%**.
  표본이 작고, **핵심 주장인 보정 성능은 아직 외부 미검증**이다.

## 3. 특기 영역 / 용례

**Jev가 맞는 자리** — 보기가 정해진 판단, 대량·저지연·저단가가 관건인 작업
- 라우팅 · 트리아지 · 분류 · 태깅 (대량 전수 처리)
- 콘텐츠 모더레이션 (정책 항목 다수를 1콜로 병렬 질의 → 문턱으로 허용/차단/에스컬레이션)
- 평가(evals), LLM 출력 검증 · 가드레일
- 에이전트 하네스 — 도구/스킬/추론모델 호출 여부 결정
- 게임 · 시뮬레이션 루프 (프레임/틱 예산 안에서 행동 선택)

**Jev가 못 하는 것**
- 글쓰기 전반(대화·요약·코드 생성), **판단 근거 설명** (숫자만 나옴 → 감사·규제 대응에 취약)
- 산술, 다단계 추론, 방해 맥락, 적대적 입력에 약함
- 아키텍처 · 가중치 · 보정 곡선 모두 비공개, 재현 가능한 논문 없음

**실무 조합 패턴**
> 계산과 권한은 **코드**, 판단은 **Jev**, 생성과 추론은 **LLM**, 불확실·중대 건은 **사람**.

## 4. 접근 경로

`typesafe/jev-1.13` (OpenRouter) · `typesafe-ai/jev` (Vercel AI Gateway) · `typesafe/jev` (Cloudflare Workers AI)
· LiteLLM · Pydantic AI · LangChain · Langfuse. TypeSafe 직접 API는 대기자 명단.

## 출처

- TypeSafe AI 블로그 — [Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- 공식 문서 — [docs.typesafe.ai](https://docs.typesafe.ai/concepts/system-one) (System One / State / Primitives / API reference)
- [DataCamp — System One Models & Jev](https://www.datacamp.com/blog/system-one-models-jev)
- [MindStudio — RLCD vs RLHF](https://www.mindstudio.ai/blog/typesafe-jev-rlcd-vs-rlhf)
- [Every — 독립 테스트](https://every.to/also-true-for-humans/mini-vibe-check-typesafe-s-jev-judged-everything-i-ve-written-in-0-7-seconds)
- [LangChain — Building a harness with Jev](https://www.langchain.com/blog/building-a-harness-with-jev)
- [Vercel — Jev + AI SDK 가이드](https://vercel.com/kb/guide/typesafe-jev-and-ai-sdk)
- [TrueFoundry — What "System One Models" actually are](https://www.truefoundry.com/blog/typesafe-ai-jev)
