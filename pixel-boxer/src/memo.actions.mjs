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
  Q = 'Q 단계(수비)에서 합니다. M·N·U·V를 합친 뒤 P와 함께 시작합니다.';

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
    state: 'done',
    text: '뒷목을 잡고 당기는 동안 몸이 뒤로 버티고(8°), 어퍼가 0.03초 기다렸다 닿습니다: 4암 94 → 102, 5암 105 → 115 N·s. 맞힌 뒤 쫓아가지 않고, 끌려온 쪽은 앞 글러브를 턱 앞으로 모읍니다. 남은 한계: 시드 시합 한 판(시드 67)에서 잡는 앞손이 제 뒷팔을 4.8 cm 지나는 프레임이 있습니다.'
  },
  beckon: {
    stage: 'U',
    state: 'done',
    text: '앞 글러브를 얼굴 높이로 가드보다 29 cm(5암 23) 앞까지 내밀어 세 번 까딱입니다(손짓 카드는 1.2 m에서). 도발하는 손은 자리가 있는 만큼만 뻗어 상대의 머리·몸통에서 5 cm 넘게 떨어지고(시드 시합에서 상대 안으로 드는 것 154 → 0), 상대가 대시로 들어오면 가드 올리듯 급히 거두고, 끊기면 손이 천천히 가드로 돌아옵니다. 남은 한계: 0.66 m 안에서는 5 cm를 다 지키지 못하고, 도발하는 글러브가 상대 아래팔에 8~12 cm 드는 경우가 있습니다.'
  },
  chinOut: {
    stage: 'U',
    state: 'done',
    text: '두 손을 다 늘어뜨리고(팔꿈치 155° 넘게 펴짐) 0.5초 넘게 머리 30 cm 안에 글러브가 없습니다. 끊기면 늘어뜨린 손이 몸과 함께 천천히(처음 120 m/s² 안) 가드로 돌아와, 끊긴 턱 내밀기의 30 cm 튐이 없어졌습니다.'
  },
  wind: {
    stage: 'U',
    state: 'done',
    text: '두 주먹이 반 바퀴 어긋나게 두 바퀴씩 돕니다(630° 넘게), 두 글러브는 20 cm 넘게 떨어져 있습니다. 도발하는 손은 자리가 있는 만큼만 뻗어 상대의 머리·몸통에서 5 cm 넘게 떨어지고(시드 시합에서 상대 안으로 드는 것 154 → 0), 상대가 대시로 들어오면 가드 올리듯 급히 거두고, 끊기면 손이 천천히 가드로 돌아옵니다. 남은 한계: 0.80 m 안에서는 앞주먹이 올라오지 않고 뒷주먹만 돕니다; 5암이 전설의 크로스를 맞는 순간 앞 글러브가 한 프레임 4.1 m/s(지켜보는 줄 `u-wind-room`, 기준 5.6).'
  },
  shrug: {
    stage: 'U',
    state: 'done',
    text: '두 글러브 사이 87 cm(5암 70), 두 어깨가 올라가고, 앞손을 뒤로 빼지 않습니다(어깨 범위 가장자리를 지나며 글러브가 튀던 것 고침). 카드의 카메라는 미결 카탈로그 `shrug-view`에서 아직 정하지 않으셨습니다.'
  },
  tapChin: {
    stage: 'U',
    state: 'done',
    text: '턱에서 12 cm(5암 9) 뺐다가 세 번 턱 가까이까지 치고, 칠 때마다 고개가 끄덕입니다. 도발하는 손은 자리가 있는 만큼만 뻗어 상대의 머리·몸통에서 5 cm 넘게 떨어지고(시드 시합에서 상대 안으로 드는 것 154 → 0), 상대가 대시로 들어오면 가드 올리듯 급히 거두고, 끊기면 손이 천천히 가드로 돌아옵니다.'
  },
  stagger: {
    stage: 'V',
    state: 'done',
    text: '휘청인 선수의 팔이 느리게 늘어지고(초당 600° 넘게 돌지 않음: 센 타격 뒤 가드가 한 프레임에 30 cm 튀던 것이 6 cm 안), 무릎이 꺾이며 안으로 돌고, 고개가 흔들리고, 발 하나가 나가 받칩니다(주먹을 던지는 동안은 아님). 대가(받아들이신 것): 휘청일 때마다 4초쯤 느리고 그동안 막기가 7%쯤 줄어듭니다.'
  },
  'down-front': {
    stage: 'V',
    state: 'done',
    text: '쓰러질 때 엉덩이 인대를 일찍 걸고 누운 뒤 다리 인대를 쉬게 해, 다리가 찢어지거나 무릎이 뒤집히지 않고 누운 다리가 가라앉습니다. 남은 한계: 누운 넓적다리 사이 97.5 / 72.6°(기획에 못 미침), 그 대가로 훅 다운은 대개 엎드려 눕습니다(받아들이신 것).'
  },
  'out-twist': {
    stage: 'V',
    state: 'fix',
    text: 'V를 합쳤지만(11-24) 턱은 23.1°(기획 24~40)로 메모의 "더 세게 숙여"에 아직 답하지 못했습니다. 턱 28° · 32°의 비교가 미결 카탈로그 `twist-chin`에 있고, 아직 정하지 않으셨습니다.'
  }
};
