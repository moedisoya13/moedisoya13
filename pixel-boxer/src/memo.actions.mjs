/* What is being done about each note on the catalogue: row by row, the stage that answers it, how far that stage is, and a
   line of what was measured (docs/pending.md keeps the whole of it). Written by hand at each publish, from the notes as they
   were last read out of the store; a row with a newer note than this has nothing here to say about it yet. The page shows
   it on the row's note thread (src/memo.mjs): the stage and the state beside the count, the line under it.
     ACTIONS  { [row id]: { stage, state, text } }
     STATES   what a state reads as on the page */
export const STATES = {
  wait: '차례 대기', // (its stage has not started)
  work: '구현 중',
  check: '점검 중', // (built; the separate check is running)
  fix: '고치는 중', // (built and checked; the check found things to mend)
  done: '반영됨' // (in the motion the catalogue plays)
};

const R = 'R 단계(풋워크)에서 합니다. 그 바탕인 팔방 위치 시스템의 기초는 끝났고, M·N·U·V를 합친 뒤 시작합니다.',
  S = 'S 단계에서 합니다. 팔방 기획에 따라 시프트는 두 칸을 옮겨 옆을 잡고, 파도는 2~4칸을 빠르게 돕니다. R 단계 다음입니다.',
  Q = 'Q 단계(수비)에서 합니다. M·N·U·V를 합친 뒤 P와 함께 시작합니다.',
  LATER = '카탈로그의 동작에는 아직 없습니다.';

export const ACTIONS = {
  inout: { stage: 'R', state: 'wait', text: R },
  side: { stage: 'R', state: 'wait', text: R },
  circle: { stage: 'R', state: 'wait', text: R },
  dash: { stage: 'R', state: 'wait', text: R },
  dashSide: { stage: 'R', state: 'wait', text: R },
  shift: { stage: 'S', state: 'wait', text: S },
  wave: { stage: 'S', state: 'wait', text: S },
  duck: { stage: 'Q', state: 'wait', text: Q },
  pull: { stage: 'Q', state: 'wait', text: Q },
  parry: { stage: 'Q', state: 'wait', text: Q },
  parryDown: { stage: 'Q', state: 'wait', text: Q },
  rollCounter: { stage: 'Q', state: 'wait', text: Q },
  crossArm: {
    stage: 'M',
    state: 'done',
    text: '자기 글러브가 다른 팔에 2 cm 넘게 들면 잡는 점검을 새로 넣었고(예외 없음), 풀이가 글러브를 천천히 밀어냅니다. 가드를 잡은 동안 6.0 → 0 cm, 모든 대본 495개에서 0건(가장 깊은 것 1.7 cm). 시드 시합 32판에서는 1,640 → 64프레임이 남습니다(최악 10 cm). 가드의 모양(세워 잡기)은 P 단계에서 고칩니다.'
  },
  hookIn: {
    stage: 'N',
    state: 'done',
    text: '허리(골반 위의 척추)를 따로 돌 수 있게 하고, 골반보다 먼저 감겼다가 닿는 프레임에 가장 빨리 풀리게 했습니다. 3단계 47 → 60, 4명 55 → 73, 5명 57 → 78 N·s, 닿는 때는 그대로입니다. 허리는 7°쯤, 초당 350~400°로 돕니다(기획의 10°·450°에는 못 미침). 시트에서는 가슴이 골반보다 더 돌아 있는 것으로 약하게 읽힙니다. 남은 한계: 연타의 셋째 주먹이 기준보다 약한 칸(최악 49 대 65 N·s)과, 가드를 든 상대와 붙어 있을 때 글러브가 몇 cm 더 깊이 닿는 경우들.'
  },
  hookR: {
    stage: 'N',
    state: 'done',
    text: '허리로 12° 더 감았다가 17° 돌려 칩니다. 3단계 89 → 96 N·s(가슴 799 → 1076 °/s), 숄더 롤 & 카운터 4명 68 → 85 N·s. 시트에서 뒷글러브가 더 낮게, 더 돌아 감기는 것이 읽힙니다. 대가: 5암이 크로스암으로 가장 늦게 굴릴 때는 훅이 팔꿈치 옆을 돌아 옆구리에 맞습니다(42 N·s; 정하신 대로). 4명·4암의 카드는 117·114 → 113·112 N·s로 조금 약해졌습니다.'
  },
  upperIn: {
    stage: 'N',
    state: 'done',
    text: '무릎을 더 굽혀 골반이 내려가고, 손이 엉덩이 높이까지 내려갔다가 U자로 올라옵니다. 3단계 90 → 95, 5명 108 → 114 N·s. U의 바닥(가장 낮은 점에서 3 cm 안의 수평 구간)은 3단계 7.8 cm, 4명 3.1 cm, 5명 0 cm입니다(기획 10 · 10 · 8). 시트에서는 3단계에서 읽히고, 5단계는 전과 거의 같습니다. 가드를 든 상대의 팔꿈치 앞 8 cm로 돌아 올라가게 했습니다.'
  },
  flicker: {
    stage: 'N',
    state: 'done',
    text: '5암의 허리가 먼저 튀고 주먹이 채찍처럼 따라옵니다. 세 번의 타격이 20 · 9 · 8 → 23 · 22 · 9 N·s(둘째 타격이 한 프레임 일찍, 세게). 숫자로는 되었으나 정지 그림에서는 가슴이 조금 더 도는 것만 보입니다: 카탈로그에서 움직이는 것으로 봐 주세요.'
  },
  collar: {
    stage: 'U',
    state: 'fix',
    text: `1차 구현: 뒷목을 잡고 0.12초 당긴 뒤 어퍼가 닿습니다. 머리가 앞·아래로 16 cm(5암 12), 당기는 팔꿈치 124°(전 161°). 점검에서 나온 것: 카드의 거리(0.74 m)를 2 cm만 벗어나도 글러브가 상대 팔에 8 cm 넘게 듭니다. ${LATER}`
  },
  beckon: {
    stage: 'U',
    state: 'fix',
    text: `1차 구현: 앞 글러브를 가드보다 29 cm(5암 23) 앞까지 내밀어 세 번 까딱입니다. 점검에서 나온 것: 실제 시합의 보통 거리(0.9~1.07 m)에서 글러브가 상대 머리를 지납니다(38번 가운데 12번). 자리가 있는 만큼만 뻗도록 고칩니다. ${LATER}`
  },
  chinOut: {
    stage: 'U',
    state: 'fix',
    text: `1차 구현: 두 손을 다 늘어뜨립니다(글러브 높이 77 cm, 팔꿈치 159°). 0.88초(5암 0.72초) 동안 머리 30 cm 안에 글러브가 없습니다. 이 줄은 점검을 통과했고, U 단계의 다른 줄을 고친 뒤 함께 합칩니다. ${LATER}`
  },
  wind: {
    stage: 'U',
    state: 'fix',
    text: `1차 구현: 두 주먹이 반 바퀴 어긋나게 두 바퀴씩 돕니다(713~734°), 두 글러브는 21 cm 넘게 떨어져 있습니다. 이 줄은 점검을 통과했고(정지 그림에서는 원이 잘 안 보임), U 단계의 다른 줄을 고친 뒤 함께 합칩니다. ${LATER}`
  },
  shrug: {
    stage: 'U',
    state: 'fix',
    text: `1차 구현: 두 글러브 사이 88 cm(5암 70), 두 어깨가 4.5 cm 올라갑니다. 점검에서 나온 것: 숫자는 되었으나 카드의 카메라에서는 벌린 팔이 화면 안쪽으로 가서 잘 읽히지 않습니다(옆에서는 읽힘). 카드의 카메라를 함께 봅니다. ${LATER}`
  },
  tapChin: {
    stage: 'U',
    state: 'fix',
    text: `1차 구현: 턱에서 12 cm(5암 9) 뺐다가 세 번, 초속 2 m로 턱 1 cm 안까지 치고 칠 때마다 고개가 4~5° 끄덕입니다. 이 줄은 점검을 통과했고, U 단계의 다른 줄을 고친 뒤 함께 합칩니다. ${LATER}`
  },
  stagger: {
    stage: 'V',
    state: 'fix',
    text: `1차 구현: 앞·뒷 글러브가 29·22 cm 처지고, 고개가 32° 흔들리며, 무릎이 번갈아 꺾이고, 맞고 0.5초쯤 발 하나가 11 cm 나가 몸을 받칩니다. 점검에서 나온 것: 시트에서는 약하게 읽히고, 센 타격 뒤 가드가 한 프레임에 튀는 것이 커졌습니다(20.5 → 25.7 cm). ${LATER}`
  },
  'down-front': {
    stage: 'V',
    state: 'fix',
    text: `1차 구현: 넓적다리 사이 158 → 113°(누워서 157 → 74°), 발목 사이 1.76 → 1.53 m(누워서 1.69 → 0.93 m). 점검에서 나온 것: 접힌 다리의 발이 40 cm 떠 있고, 일어날 때 다리가 한 프레임에 15~35 cm 튑니다. ${LATER}`
  },
  'out-twist': {
    stage: 'V',
    state: 'fix',
    text: `1차 구현은 사실상 달라진 것이 없습니다(턱 22 → 23°). 기획의 턱 32°를 넣으면 머리가 캔버스에 닿는 때가 늦어지는데(0.93초, 기준 0.85초 안), 그것을 고치는 중입니다. ${LATER}`
  }
};
