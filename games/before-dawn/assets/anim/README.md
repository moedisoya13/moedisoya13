# 애니메이션 프레임 (계약)

팀장이 영상 생성 모델로 만든 프레임을 넣는 곳. 엔진은 `manifest.json`만 읽는다.

```
assets/anim/manifest.json
{ "<char>": { "<clip>": { "file": "hero/move_side.webp", "frames": 16, "fw": 220, "fh": 200,
                          "fps": 16, "loop": true, "anchor": [110, 192], "scale": 1.0 } } }
```

- `file`: 프레임을 **가로로 이어 붙인 띠**(strip) WebP, 투명 배경. 프레임 i는 `x = i × fw`.
- `anchor`: 프레임 안의 발 위치(px). 이 점이 월드 좌표에 놓인다.
- `scale`: 이 클립의 한 프레임 높이 `fh`가, 같은 캐릭터 정지 그림(`assets/sprites.json`)의 높이에 대해 차지하는 비율의 보정값. 화면 크기 = 정지 그림을 그릴 때의 높이 × `scale` × (`fh` / 클립 기준 높이)가 아니라, **단순히 "정지 그림과 같은 키로 보이게 하는 배율"** 이다. 1.0이면 프레임 안 캐릭터 키가 정지 그림과 같다고 본다.
- 모든 그림은 오른쪽을 본다. 왼쪽은 좌우 반전.

| char | clip |
|---|---|
| `hero` | `idle_side` `idle_down` `idle_up` `move_side` `move_down` `move_up` `attack_side` `attack_down` `attack_up` `dash_side` `hurt` |
| 적 6종 (`slime` `goblin` `skel_archer` `ghoul` `mage` `dark_knight`), `demon_king` | `idle` `move` `attack` `hurt` `die` |

**어떤 클립이든 없을 수 있다.** 없으면 순서대로 대체한다: 같은 동작의 다른 방향(`side`) → `idle`/`move` 중 있는 것 → 정지 그림에 코드로 넣는 움직임(숨쉬기, 걸음 튕김, 공격 때 내밀기, 피격 흔들림, 쓰러질 때 먹물로 흩어짐). 그래서 프레임이 하나도 없어도 게임은 돌고, 프레임이 들어오는 만큼 좋아진다.

`_placeholder/`의 클립은 정지 그림을 흔들어 만든 시험용이다(엔진 개발용, 빌드에는 넣지 않는다).
