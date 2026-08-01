# 쿠팡 판매가 수집 — iPhone 경로 키트

PC 앞에 앉아 있어야만 가능하던 수집을 **아이폰에서** 할 수 있게 하는 키트입니다.

```
사람이 Safari에서 상품 페이지를 연다
      │  공유 시트 → [쿠팡 수집] 탭 (사람이 누를 때만)
      ▼
단축어: 웹페이지에서 JavaScript 실행  ←  shortcut/run-javascript-body.js
      │  차단이면 여기서 멈춤 (파일 안 만듦)
      ▼
iCloud Drive / coupang-price/manual/<상품키>.txt
      │  (Windows용 iCloud가 PC로 동기화)
      ▼
PC:  python -m coupang_crawler.cli --from-text coupang-price/manual
      │
      ▼
기존 파이프라인 그대로 — parse.py → build_records() → CSV·HTML·Excel
```

## 왜 이 방식인가

인수인계 문서 §4의 결론 — Akamai 센서는 정상 실행됐는데도 `_abck`가 끝까지 미검증이었고,
따라서 **자동화 세션이라는 판정 자체**가 원인이라는 것 — 을 그대로 따릅니다.
판정을 뚫는 대신 **판정 대상이 되지 않는 쪽**으로 갑니다. 사람이 자기 폰에서 직접 연 페이지를,
사람이 탭했을 때만 읽습니다.

§5의 채택 불가 목록(지문 위조 · 스텔스 브라우저 · 센서 조작 · 인간 입력 시뮬레이션 ·
프록시 로테이션 · 본인 크롬 프로필 사용)은 **하나도 쓰지 않습니다.**
자동 탭·자동 스크롤도 하지 않습니다. 옵션과 판매자 목록은 **사람이 펼친 뒤** 담습니다.

읽기 전용입니다. 구매·장바구니·로그인은 건드리지 않습니다.

## 설치

1. **`shortcut/BUILD.md`** 대로 단축어를 조립합니다 (최초 1회, 약 10분).
2. PC에 Windows용 iCloud를 설치해 `coupang-price/manual/` 이 PC 폴더로 동기화되게 합니다.
   - 설치가 어려우면 아래 "대안 전송"을 쓰세요. 단축어는 그대로입니다.

## 매일 수집

품목 하나당:

1. Safari에서 상품 페이지를 엽니다.
2. **옵션을 펼칩니다.** → 공유 → `쿠팡 수집` → 메뉴에서 **옵션**
3. **다른 판매자 목록을 엽니다.** → 공유 → `쿠팡 수집` → 메뉴에서 **판매자**
4. PC에서 한 줄:
   ```bash
   python -m coupang_crawler.cli --from-text coupang-price/manual
   ```

데스크톱 확장 경로(§8 매일 수집)와 순서가 같습니다. 누르는 곳만 툴바 아이콘에서 공유 시트로 바뀝니다.

### 대안 전송 (iCloud를 안 쓸 때)

단축어 ⑧ `파일 저장`을 아래 중 하나로 바꿉니다. 나머지는 동일합니다.

| 방법 | 바꿀 액션 | PC에서 |
|---|---|---|
| 카톡 나에게 보내기 | `공유 (Share)` | 받은 파일을 `coupang-price/manual/`에 넣고 `--from-text` |
| 구글 드라이브 | `파일 저장` 서비스만 변경 | 드라이브 동기화 폴더를 `--from-text` 대상으로 |
| 클립보드 | `클립보드에 복사 (Copy to Clipboard)` | 메모 앱 등으로 옮겨 붙여 `.txt`로 저장 |

> **LAN 직접 전송(폰 → PC receiver)은 넣지 않았습니다.**
> https 페이지에서 `http://192.168.x.x`로 보내는 것은 mixed content로 막히고
> (예외는 `localhost`뿐인데 폰에서는 PC의 localhost에 닿을 수 없습니다),
> Chrome 142+는 Local Network Access 권한 프롬프트까지 겁니다.
> 확인할 수 없는 링크를 기본 경로로 삼지 않습니다.

## 차단을 만나면

알림에 `수집 중단 — blocked / Access Denied` 가 뜨면 **파일은 만들어지지 않습니다.**
인수인계 문서 §8의 종료코드 2 정책과 같습니다 — **재시도하지 마세요.**
PC에서 `--diagnose --reset-profile`로 상태를 확인하는 것이 다음 순서입니다.

`empty`는 다릅니다. 페이지가 덜 뜬 것이니 잠깐 기다렸다 다시 탭하면 됩니다.

## 개발

```bash
cd mobile-collect
npm test              # node --test, 의존성 설치 불필요
npm run build:snippet # extract.js를 고쳤으면 반드시 실행
npm run check:snippet # 스니펫이 최신인지 확인만
```

`extract.js`(순수 함수)와 브라우저 래퍼를 분리한 것은 `parse.py` / `collect.py` 분리와 같은
이유입니다 — 판단을 DOM 밖으로 빼야 브라우저 없이 검증할 수 있습니다.
붙여넣기용 스니펫은 `extract.js`에서 **생성**되며, 두 벌이 어긋나면 테스트가 실패합니다.

> **주의** — 테스트가 통과한다고 실제 쿠팡 모바일 페이지에서 원하는 값이 나온다는 뜻이 아닙니다.
> 픽스처가 전부 합성이기 때문입니다(`tests/fixtures/README.md`).
> 인수인계 문서 §9의 `test_funnel.py` 주의와 같은 성격입니다.
> **첫 실기기 수집 결과가 유일한 실제 검증입니다.**

## 이 키트를 쿠팡 저장소로 옮기려면

이 폴더를 통째로 `NewPipe` 저장소 루트에 복사하면 됩니다. 의존성이 없어 그대로 동작합니다.
PC측(Python)에서 확인·수정할 것은 **`pc-side/NOTES.md`**에 정리돼 있습니다.
