# 움직이는 그라데이션 배경 (reveal.js)

reveal.js 프레젠테이션 배경에 깔리는 **layered radial 애니메이션 그라데이션**입니다.
팔레트에서 뽑은 색으로 radial gradient 타원을 여러 장 겹쳐 깔고 아주 느리게 흘립니다.
기법은 Justin Jay Wang, [*Methods for random gradients*](https://justinjay.wang/methods-for-random-gradients/)
의 layered radial 계열입니다.

```
slides/
  index.html              데모 덱 — 브라우저로 그냥 열면 됩니다
  assets/gradient-bg.css  배경 레이어 스타일 + 팔레트(CSS 변수)
  assets/gradient-bg.js   생성기 (reveal 플러그인 + 스탠드얼론)
```

의존성은 없습니다. 파일 두 개가 전부입니다.

## 기존 덱에 붙이기

```html
<link rel="stylesheet" href="assets/gradient-bg.css">
<script src="assets/gradient-bg.js"></script>

<script>
  Reveal.initialize({
    plugins: [RevealGradientBackground],
    gradientBackground: { speed: 1, count: 12 }   // 전부 선택 항목
  });
</script>
```

`gradient-bg.css` 는 `.reveal-viewport` 의 `--r-background-color` 를 투명으로 돌려
캔버스가 비치게 합니다. 테마 CSS 는 건드리지 않습니다.

## 옵션

| 이름 | 기본값 | 하는 일 |
|---|---|---|
| `palette` | CSS `--gbg-1..8` | blob 에 쓸 색 목록 |
| `baseColor` | CSS `--gbg-base` | blob 아래 바닥색 |
| `count` | `12` | 겹쳐 깔 blob 개수 |
| `speed` | `1` | 드리프트 속도 배율 |
| `intensity` | `0.35` | blob 알파 배율 — `1` 이면 색이 가장 진하다 |
| `wash` | `0.35` | blob 위에 덮는 바닥색 베일 — 가운데가 가장 진하다 |
| `buffer` | `140` | 캔버스 짧은 변 px — 작을수록 뿌옇다 |
| `blend` | `source-over` | `multiply`(밝은 바탕에서 색이 진해짐) / `lighter`(어두운 바탕) |
| `grain` | `0.035` | 그레인 오버레이 세기 |
| `transitionMs` | `1200` | 슬라이드 전환 크로스페이드 길이 |
| `reseedOnSlide` | `true` | 끄면 덱 전체가 한 배경으로 고정 |
| `fps` | `30` | 렌더 상한 |

## 배경 세기 조절

기본값은 **배경이 전경 텍스트에 자리를 내주는 쪽**으로 잡혀 있습니다. 발표 슬라이드에서
배경이 본문을 잡아먹지 않는 게 우선이라, blob 알파를 `intensity` 로 눌러 두고 그 위에
바닥색 베일(`wash`)을 한 겹 덮습니다. 베일은 **가운데가 진하고 가장자리로 갈수록 옅어져서**,
텍스트가 앉는 중앙을 가장 많이 진정시키면서 화면 테두리의 색기는 남깁니다.

```js
gradientBackground: { intensity: 0.35, wash: 0.35 }   // 기본 — 아주 옅다
gradientBackground: { intensity: 0.7,  wash: 0.15 }   // 색을 더 보고 싶을 때
gradientBackground: { intensity: 1,    wash: 0 }      // 표지처럼 배경이 주인공일 때
```

1280×720 기준으로 본문 영역(가운데 70%×60%)에서 잰 최악 대비는 기본값에서 **12.7:1**
입니다(본문색 `#1c1b1a`). `wash` 를 0 으로 두면 9.7:1 까지 내려갑니다.

## 텍스트를 배경 위에 바로 올릴 때

데모 덱은 유리판(반투명 카드) 없이 텍스트를 배경 위에 직접 올립니다. 판을 깔지 않아도
읽히게 하는 건 결국 세 가지입니다.

1. **줄 길이 제한** — reveal 슬라이드 좌표계(960×700) 기준 `max-width: 620px` 정도.
   `em` 으로 잡으면 루트 글꼴이 42px 라 제한이 걸리지 않으니 px 로 주세요.
2. **보조 텍스트 색** — 옅은 회색(`#57534e` 류)이 파스텔 위에서 제일 먼저 무너집니다.
   `#3f3b37` 선까지 어둡게, 링크도 `#21378f` 정도로 내리면 7:1 을 넘깁니다.
3. **행간과 여백** — `line-height: 1.55`, 항목 사이 `0.34em`.

데모 덱의 실제 텍스트 박스 아래 배경과 각 글자색 사이의 최악 대비는 이렇게 해서
**8.5:1** 입니다(WCAG AAA 기준 7:1). 색만 손보기 전에는 4.5:1 이었습니다.

베일 색은 흰색 고정이 아니라 `baseColor` 입니다. 그래서 어두운 팔레트에서도 같은 옵션이
"바탕색 쪽으로 물러나는" 방향으로 동작합니다.

## 색 바꾸기

CSS 변수만 덮어쓰면 됩니다. JS 는 `palette` 옵션이 없을 때 이 값을 읽습니다.

```css
:root {
  --gbg-base: #101014;
  --gbg-1: #3b3f7a;
  --gbg-2: #7a3b63;
  --gbg-3: #2f6b6b;
  --gbg-4: #6b5a2f;
}
```

어두운 팔레트에는 `blend: 'lighter'` 가 잘 맞습니다. 가산 혼합이라 blob 이 겹치는 자리가
흰색으로 타기 쉬운데, 기본 `wash` 가 바닥색(여기서는 어두운 색) 쪽으로 눌러 주므로
대부분 잡힙니다. 그래도 뜨면 `intensity` 를 더 내리거나 `count` 를 줄이세요.

런타임에 바꾸려면:

```js
RevealGradientBackground.background.setPalette(['#a8c0ff', '#ffb8d5', '#9fe5cd']);
```

## reveal 없이 쓰기

```js
var bg = GradientBackground.mount({ target: document.body, seed: 7 });
bg.reseed(42);      // 새 구성으로 크로스페이드
bg.pause();         // 렌더 정지
bg.destroy();       // DOM·이벤트·rAF 정리
```

## 성능과 접근성

- 캔버스는 짧은 변 140px 로 그리고 CSS 가 화면 크기까지 늘립니다. 이 확대 보간이
  곧 블러라, `filter: blur()` 를 매 프레임 먹이는 것보다 훨씬 쌉니다.
- 렌더는 30fps 로 제한하고, 탭이 백그라운드거나 <kbd>B</kbd> 로 덱을 일시정지하면 멈춥니다.
- `prefers-reduced-motion: reduce` 면 드리프트를 멈추고 정지 프레임만 남깁니다.
  이 경우에도 슬라이드를 넘기면 색은 즉시 갈립니다.
- `?print-pdf` 와 인쇄에서는 캔버스를 접고 같은 팔레트의 정적 `radial-gradient` 로
  갈음합니다. fixed 캔버스는 인쇄 레이아웃에서 첫 장에만 찍히거나 비어 나옵니다.
  이 정적 배경에도 화면 쪽 `wash` 에 대응하는 베일(`--gbg-print-wash`)이 얹혀서,
  화면만 옅고 PDF 만 진해지는 일이 없습니다.

## 슬라이드 연동

시드를 슬라이드 인덱스 `(h, v)` 에서 뽑습니다. 그래서 뒤로 돌아오거나 링크로 바로
진입해도 **같은 슬라이드는 같은 배경**입니다. 전환은 캔버스 두 장을 알파 페이드하지
않고 blob 파라미터를 보간하며, 색은 OkLab 에서 섞습니다(sRGB 직선 보간은 파스텔
중간색이 탁한 회색으로 내려앉습니다). 빠르게 넘기면 진행 중이던 보간의 현재 상태를
새 출발점으로 삼아 이어 붙입니다.

## 데모 덱 열기

`index.html` 은 reveal.js 5.1.0 을 cdnjs 에서 불러옵니다. 그냥 열거나,

```bash
python3 -m http.server 8000 --directory slides
# http://127.0.0.1:8000/
```

`file://` 로 열면 reveal 의 `hash: true` 가 동작하지 않을 수 있으니 서버로 여는 편이 낫습니다.
