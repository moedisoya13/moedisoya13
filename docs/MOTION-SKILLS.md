# 모션 skill 모음

Claude 로 모션(웹 애니메이션, Three.js, 코드로 그리는 영상)을 만들 때 쓰는 외부 skill 35개.
모두 MIT 라이선스이고, 각 skill 폴더에 원본 `LICENSE` 를 같이 넣었다.

| 출처 | 커밋 | 설치한 것 |
|---|---|---|
| [dylantarre/animation-principles](https://github.com/dylantarre/animation-principles) | `8359713` (2025-12-30) | 가이드 144개 → `animation-principles/guides/` (아래 참고) |
| [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) | `0e18186` (2026-10-19) | 13개 전부 (`threejs-*`) |
| [iart-ai/motion-skills](https://github.com/iart-ai/motion-skills) | `bb5a3ce` (2026-10-14) | 18개 팩 중 5개 팩, skill 22개 (아래 참고) |

## motion-skills 에서 고른 팩

motion-skills 는 팩 목록만 있는 저장소이고, skill 은 팩마다 별도 저장소에 있다.
[how-to-survive-a-slasher-film](https://github.com/moedisoya13/how-to-survive-a-slasher-film)(Three.js 3D, 캐릭터 모션),
코드로 그리는 영상(`anything2explainer`·`video-*`), 웹 아티팩트에 맞춰 골랐다.

| 팩 (커밋) | 설치한 skill | 뺀 것 |
|---|---|---|
| motion-design-skills (`3c129f7`) | animation-principles¹, beat-sync-editing, color-motion, logo-animation, motion-art-direction, motion-background, remotion-video, shot-composition | after-effects — AE 를 안 씀 |
| web-animation-skills (`b6dba3e`) | 60fps-animation, accessible-animation, ascii-animation, glassmorphism, gsap-web, lottie-animation, micro-interaction, page-transition-animation, svg-animation | — |
| webgl-animation-skills (`50697d6`) | particle-system, shader-glsl | threejs-animation — CloudAI-X 의 같은 이름 skill 과 충돌, 내용도 threejs-* 13개가 더 자세함 |
| kinetic-typography-skills (`fccc94b`) | kinetic-typography | — |
| javascript-animation-skills (`f7d0882`) | javascript-animation, soundtrack | — |

설치하지 않은 팩: explainer-video(`anything2explainer` 와 겹침), tiktok-video, youtube-video, text-message-video,
ecommerce-video, ad-video, data-animation, map-animation, manim, generative-illustration, lower-thirds, b-roll,
freelance-motion. 필요해지면 같은 방식으로 추가하면 된다.

## 원본과 달라진 점

1. **`animation-principles` 는 두 저장소를 합친 skill 이다.**
   - 본문과 `references/` 는 iart 의 `animation-principles`(easing·duration·stagger 숫자, Three Pillars, 1/3 Rule) 그대로다.
     iart 의 다른 skill 들이 이 이름으로 참조하므로 이름을 유지했다.
   - dylantarre 의 144개는 skill 로 따로 등록하지 않고 `guides/<카테고리>/<이름>.md` 로 넣었다.
     144개를 skill 로 올리면 세션마다 skill 목록이 144줄 늘어나 다른 skill 설명이 잘리고,
     `master`·`novice`·`troubleshooting` 같은 이름이 다른 skill 과 헷갈린다.
     대신 `SKILL.md` 끝에 카테고리 표를 붙였고, `guides/INDEX.md` 에 가이드별 "언제 쓰나" 한 줄을 모았다.
   - frontmatter 의 `description` 은 두 내용을 모두 덮도록 새로 썼다.
2. **iart skill 의 `scripts/` 검증 도구를 skill 마다 복사했다.** 원본은 팩 최상위 `scripts/`
   (`contact-sheet.sh`, `probe-mp4.sh`, `seek-shot.sh`) 를 `scripts/…` 로 가리키는데, skill 폴더만 옮기면 경로가 깨진다.
   "Packaged helper" 를 언급하는 skill 에만 넣었다.

¹ motion-design-skills 의 animation-principles — 위 1번 참고.

## 업데이트

threejs-skills 와 iart 팩은 폴더를 그대로 복사한 것이라, 원본을 clone 해서 `skills/<이름>/` 을 덮어쓰면 된다
(iart 는 위 2번처럼 팩의 `scripts/` 도 다시 넣는다). dylantarre 쪽은 2025-12 이후 갱신이 없다.
