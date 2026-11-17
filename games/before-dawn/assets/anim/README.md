# 애니메이션 프레임 (계약)

팀장이 영상 생성 모델로 만든 프레임을 넣는 곳. 엔진은 `manifest.json`만 읽는다.

```
assets/anim/manifest.json
{ "<char>": { "<clip>": { "file": "hero/move_side.webp", "frames": 16, "fw": 220, "fh": 200,
                          "fps": 16, "loop": true, "anchor": [110, 192], "charH": 170 } } }
```

- `file`: 프레임을 **가로로 이어 붙인 띠**(strip) WebP, 투명 배경. 프레임 i는 `x = i × fw`.
- `anchor`: 프레임 안의 발 위치(px). 이 점이 월드 좌표에 놓인다.
- `charH`: 프레임 안에서 캐릭터가 똑바로 섰을 때의 키(px). 엔진은 이 키가 정지 그림(`assets/sprites.json`)을 그릴 때의 화면 키와 같아지도록 프레임을 확대·축소한다. 그래서 클립마다 프레임 크기가 달라도 캐릭터 크기는 같게 보인다.
- `strike` (공격 클립만): 타격이 들어가는 프레임 번호. 엔진은 0~`strike` 구간을 공격 준비(예고) 시간에, 그 뒤를 타격 후 동작에 맞춰 늘이거나 줄여 재생한다.
- 모든 그림은 오른쪽을 본다. 왼쪽은 좌우 반전.

| char | clip |
|---|---|
| `hero` | `idle_side` `idle_down` `idle_up` `move_side` `move_down` `move_up` `attack_side` `attack_down` `attack_up` `dash_side` `hurt` |
| 적 6종 (`slime` `goblin` `skel_archer` `ghoul` `mage` `dark_knight`), `demon_king` | `idle` `move` `attack` `hurt` `die` |

**어떤 클립이든 없을 수 있다.** 없으면 순서대로 대체한다: 같은 동작의 다른 방향(`side`) → `idle`/`move` 중 있는 것 → 정지 그림에 코드로 넣는 움직임(숨쉬기, 걸음 튕김, 공격 때 내밀기, 피격 흔들림, 쓰러질 때 먹물로 흩어짐). 그래서 프레임이 하나도 없어도 게임은 돌고, 프레임이 들어오는 만큼 좋아진다.

`_placeholder/`의 클립은 정지 그림을 흔들어 만든 시험용이다(엔진 개발용, 빌드에는 넣지 않는다).
