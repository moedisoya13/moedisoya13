# 모션 캡처: 영상의 동작을 인물에게 옮기기

단계 ⑪. 사람이 움직이는 영상(달리기·도약 같은 스포츠 장면)에서 자세를 읽어 리그로 옮기고, 구운 인물로 다시 그린다.
원본 영상은 읽기만 하고 저장소에 넣지 않는다. 결과는 `out/mocap/NAME/`에 남는다.

```
영상 ──capture──▶ capture.npz ──retarget──▶ clip.npz ──render──▶ side.gif / compare.mp4
      (MediaPipe¹: 프레임마다    (정리 → 뼈 회전 → 접지² →      (구운 인물, 192px,
       랜드마크³ 33개)            root 경로 → 발 고정 IK)        카메라가 root를 따라감)
```

| 파일 | 하는 일 |
|---|---|
| `mocap.py` | 명령줄: `capture` · `retarget` · `render` · `synth` · `evaluate` · `blend` · `loop` |
| `retarget.py` | 랜드마크 → 뼈별 로컬 회전 + root 경로. 정리 필터, 접지 검출, 탄도 비행, 발 고정 IK |
| `clip.py` | 클립(자세 열) 저장·재생·이어 붙이기·loop. 회전은 쿼터니언으로 저장 |
| `synth.py` | 리그 자신의 걷기·달리기·도약을 "영상에서 뽑은 것과 같은 형식"으로 만드는 합성 캡처(검증용) |

## 먼저 알 것: MediaPipe는 시스템 라이브러리가 있어야 돈다

`capture`만 MediaPipe를 쓴다. `pip`으로 `mediapipe==1.2.3`을 깔아도 `PoseLandmarker`를 만드는 순간
**`libEGL.so.1`(과 `libGLESv2.so.2`)이 없으면 실패**한다. 시스템 패키지 `libegl1`, `libgles2`가 필요하다.

```bash
bash $SKILL/scripts/setup.sh WORK --mocap          # 또는: uv pip install -r requirements-mocap.txt
apt-get install -y libegl1 libgles2                # 시스템 패키지 설치 권한이 있을 때
```

이 엔진을 만든 환경에서는 시스템 패키지를 깔 수 없어 **실제 영상에 대한 검출은 한 번도 돌려 보지 못했다.**
그래서 world 랜드마크의 축 방향, visibility 값의 범위, 검출 속도는 MediaPipe 문서에 따른 것이고 실측이 아니다.
`retarget`·`render`·`synth`·`evaluate`와 테스트는 MediaPipe 없이 돈다. 설치가 막히면 그 사실을 사용자에게 말하고
합성 캡처로 나머지 경로를 확인한다.

**첫 실제 캡처에서는 `retarget.json`의 `axes` 세 값이 1에 가까운지부터 본다**: 얼굴이 골반 기준 앞쪽에 있는 프레임 비율,
무릎이 앞으로 굽는 비율, 머리가 엉덩이 위에 있는 비율. 거울상이나 앞뒤가 뒤집힌 입력에서는 첫 값이 0이 된다.

## 명령

```bash
python template/mocap.py capture run.mp4 -o out/mocap/run --start 2.0 --end 6.5      # 구간(초). 모델은 처음 한 번 out/models/ 로 내려받음(약 30 MB)
python template/mocap.py retarget -o out/mocap/run                                   # clip.npz + retarget.json(보고서)
python template/mocap.py render   -o out/mocap/run --model out/fig --views side,front
python template/mocap.py render   -o out/mocap/run --model out/fig --compare run.mp4  # 원본 + 2D 뼈대 | 인물

# 영상 없이: 합성 캡처로 같은 길을 지나가 보고 오차를 잰다
python template/mocap.py synth run -o out/mocap/synth_run --course 90 --noise 0.008
python template/mocap.py retarget -o out/mocap/synth_run
python template/mocap.py evaluate -o out/mocap/synth_run
python -m pytest -q -p no:cacheprovider tests/test_mocap.py                          # 30개, 약 12초
```

- `capture`: 모델 파일(`pose_landmarker_heavy.task`)을 처음 한 번 `storage.googleapis.com`에서 받으므로 그 호스트에 접근할 수 있어야 한다. `--every n`, `--select largest|center|left|right`(여러 사람일 때 처음 고르는 기준), `--model heavy|full|lite`, `--no-stabilize`(카메라 움직임 추적 끄기). 검출 실패 프레임은 `capture.json`의 `undetected_ranges`.
- `retarget`: `--time-scale 0.5`(절반 속도 슬로모션 영상), `--fov`(카메라 화각 추정), `--filter adaptive|one_euro|none`, `--flight auto|momentum|image|mixed`, `--no-image`(2D 궤적 무시), `--outfit none`(맨몸의 관절 한계).
- `render`: `--model`은 구운 인물의 폴더(기본 `out/soldier_final`). `--views`는 `source`(영상의 카메라) · `side` · `front` · `back` · `three` 또는 각도. `--px`는 192 이하. 프레임을 `frames_VIEW/`에 한 장씩 쓰고 `--budget`(기본 150초)이 지나면 멈춘다. **같은 명령을 다시 실행하면 이어서** 그리고, 다 모이면 GIF/MP4로 묶는다. `--step n`은 n프레임마다 한 장.
- `blend A B OUT --overlap 6`은 두 클립을 겹쳐 잇고, `loop CLIP OUT`은 왼발 착지 두 번 사이 한 주기를 잘라 이음매 없는 반복 클립을 만든다.

## 어떻게 옮기나 (retarget)

**좌표** — MediaPipe의 world 랜드마크는 엉덩이 중심이 원점, 단위 미터, x는 화면 오른쪽, y는 아래, z는 카메라에서 멀어지는 쪽.
리그의 좌표로는 `(x, −y, −z)`: x축 둘레 반 바퀴 회전이라 거울상이 아니고 "left_*" 점은 그대로 인물의 왼쪽이다.

**정리**(`retarget.clean`) — ① visibility 0.5 미만인 점은 없는 것으로 ② 혼자 튄 점과 뼈 길이를 40 % 넘게 늘이거나 줄이는 점을 버림
③ 빈 곳은 직선이 아니라 **매달린 관절 기준 방향을 보간하고 길이는 유지** ④ 지연 없는 저역 통과 필터를 두 세기로 걸어 점의 속도로 섞음(가만히 있는 점 3 Hz, 빠른 점 9 Hz).

**회전**(`retarget.solve_pose`) — 영상 속 사람과 인물은 체절 길이가 다르므로 랜드마크의 위치가 아니라 **방향만** 쓰고 뼈 길이는 리그의 것을 둔다.
한계 밖의 회전은 `rig.clamp_rot`의 "가장 가까운 허용 회전"으로 바꾸고, 관절별로 얼마나 잘랐는지를 `retarget.json`의 `limits`에 남긴다(인물이 따라 하지 못한 부분의 기록).

| 33개 점으로 알 수 없어 규칙으로 정한 것 | 규칙 |
|---|---|
| 몸통 숙임을 골반과 허리가 나누는 몫 | 절반(`waist_share`)은 허리, 허리 한계를 넘는 몫은 골반 |
| 끄덕임·기울임을 목과 머리가 나누는 몫 | 40 %(`neck_share`)는 목 밑동 |
| 쇄골 | 위팔을 60° 넘게 들면 1°당 0.2°씩 으쓱 |
| 곧게 편 팔다리의 비틀림 | 팔: 쉬는 자세에서 가장 짧게 / 다리: 발끝이 향하는 쪽 |
| 발가락, 손가락, 손바닥 방향 | 발가락은 뒤꿈치가 들린 동안 바닥에 평평하게. 손가락·손바닥은 없음 |

**root 경로** — world 랜드마크는 늘 엉덩이가 원점이라 "얼마나 갔는지, 얼마나 뛰었는지"가 없다. 이렇게 되살린다.

1. 임시 경로: world 랜드마크와 이미지 랜드마크를 "배율 + 이동"으로 맞춰 화면 속 위치를 얻는다. **접지를 찾는 데만** 쓴다(픽셀 떨림이 실려 발이 미끄러지므로).
2. 접지 검출: 발바닥 최저점의 높이와 속도. 시작은 엄격하게(3 cm 미만이고 0.7 단위/초 미만), 유지는 느슨하게(4.5 cm, 1.0).
3. 디딤발 → root: 접지가 시작될 때 발자국을 월드에 고정하고 root = 발자국 − (그 프레임의 다리).
4. 공중 구간: 두 발 다 접지가 아니면 **질량중심이 포물선**을 그린다. 2D 궤적에서 본 낙하 가속도를 실제 중력과 비교해 영상의 재생 속도를 추정한다(`gravity_seen_in_image.implied_time_scale`; 0.5면 슬로모션 → `--time-scale 0.5`로 다시).
5. 발 고정 IK: 접지 구간의 발목을 발자국 자리에 놓고 `motion.leg_ik`로 무릎·고관절을 다시 푼다.
6. 보조 뼈: 프레임마다 `motion.drive_helpers`(관성 `prev` 포함). 재생할 때 **다시 구동**하므로 치마·망토 뼈 구성이 바뀐 뒤에도 예전 클립이 재생된다.

## 얼마나 정확한가 — 합성 왕복 검증 (전부 `evaluate`가 잰 값)

리그 자신의 동작 → 랜드마크 33개 → retarget → 원래 동작과 비교. 옆에서 본 경우(`--course 90`).
"잡음" = world 8 mm·이미지 1 px 떨림 + 튐 4개 + 가림 3구간.

| | 걷기 | 달리기 | 도약 | 잡음: 걷기 | 잡음: 달리기 | 잡음: 도약 |
|---|---|---|---|---|---|---|
| 뼈 방향 오차 전체 평균 (도) | 0.51 | 0.60 | 0.80 | 2.07 | 2.46 | 2.57 |
| root 오차 RMS (진행 방향 / 높이) | 0.011 / 0.002 | 0.010 / 0.010 | 0.008 / 0.006 | 0.008 / 0.004 | 0.030 / 0.020 | 0.006 / 0.011 |
| 접지 판정 일치 | 0.87 | 0.87 | 0.99 | 0.88 | 0.83 | 0.96 |
| 디딤발 미끄러짐 (최대) | 0.00001 | 0.0010 | 0.0011 | 0.0030 | 0.0023 | 0.0077 |
| 바닥 아래로 내려간 깊이 (최대) | 0 | 0 | 0.0016 | 0.0018 | 0.0017 | 0.0040 |

통과 기준(테스트가 쓰는 값): 깨끗한 입력에서 방향 평균 < 1.2°, root RMS < 0.02, `slip.slide_contact_max` < 0.003, `slip.sink_max` < 0.003.
잡음 입력에서 방향 평균 < 4°, root RMS < 0.08, 미끄러짐 < 0.02.

- 로컬 회전(관절 각도 자체)의 오차는 이보다 크다(깨끗한 걷기에서 위팔 5.5°, 아래팔 7.3°). 위 표의 "관측 불가" 때문이고, 뼈가 가리키는 방향은 같다.
- **옆에서 찍은 영상이 가장 정확하다.** 카메라를 향해 오는 동작(`--course 0`)은 깊이 방향이 약하다: 도약의 진행 방향 root RMS 0.056(옆에서는 0.008).
- 잡음을 world 15 mm·이미지 2 px로 올리면 접지 판정이 무너지기 시작한다. 그런 영상은 해상도·프레임률을 올리는 편이 낫다.
- retarget 시간: 66프레임 0.4초.

## 한계

- 한 대의 카메라로는 깊이가 모호하다. 체공 중 깊이 이동은 추정이다.
- 카메라가 수평이라고 가정한다. 내려다보거나 올려다본 영상은 몸 전체가 기울어 나온다.
- 30 fps에서 한 프레임에 30° 넘게 도는 팔다리는 검출이 흔들리고, 달리기의 체공(0.1초)은 2~3프레임뿐이다. 60 fps 이상을 권한다.
- 스포츠 동작에서 먼저 걸리는 한계: 발목(위로 20°), 넓적다리 뒤로 20°, 허리 숙임 25°. 한계 안이어도 고관절을 깊이 굽히면 치마가 다리를 다 덮지 못할 수 있다.
- 접지는 "발이 낮고 느리다"로만 판단한다. 미끄러지는 동작(스케이트), 발 이외의 접지(무릎·손·구르기), 평평하지 않은 바닥은 다루지 못한다.
- 사람이 여럿이면 처음 고른 사람을 화면 위치로 따라가므로, 서로 겹쳐 지나가면 바뀔 수 있다.
- `blend`로 잇는 구간에서는 발을 다시 심지 않아 미끄러질 수 있다.

---
¹ **MediaPipe**: 구글이 만든 공개 라이브러리. 사진·영상에서 사람의 관절 위치를 찾아 주는 학습된 모델(Pose Landmarker)이 들어 있다.
² **접지(contact)**: 발이 땅에 붙어 몸을 받치고 있는 상태. 이 동안 발은 월드에서 움직이면 안 된다.
³ **랜드마크**: 모델이 찾아 주는 몸의 기준점(코, 양 어깨, 팔꿈치, 손목, 엉덩이, 무릎, 발목, 발꿈치, 발끝 등 33개).
