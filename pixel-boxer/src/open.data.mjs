/* What the open-questions catalogue holds (open.html, src/open.mjs; docs/open-catalog.md): every decision still open, as
   cards in five groups, and how an answer is read and sent. Nothing here knows the page: node reads it too
   (tests/open.test.mjs).
     GROUPS     the seven groups, in order: { id, title, note } (audit: what the 11-25 self-audit found; look: the 11-26 look at
                each catalogue, one card a page with several picks)
     CARDS      the cards, in order. A card is one question (its id is the answer's key) or a note (kind: 'note', no question):
                { id, group, title, state (what it is now; `code` and **strong** marks), more (the long text, folded), list
                (lines), links ([{ href, say }]), clips (a group of src/open.clips.mjs: the builds side by side), old (true: the
                item's own cards from the old catalogue, src/pending.data.mjs, played by src/pending.mjs), opts ([[value, label,
                what it means]]), star (the value recommended; '' for none), why (the reason), memo (false: no memo), multi
                (true: several values), follow ({ 'value[,value]': [question] }: opened on the same card by that answer; a
                question { id, title, note, opts, star, multi, memo }) }. Carried items keep the old ids and option ids.
     QUESTIONS  every question, follow-ups with their parent: { id, card, parent, when, opts, star, multi, memo, title }
     DECIDED_LIST  what was decided: this page's own answered cards (DECIDED_NEW), then the old catalogue's DECIDED and its db; shown at the bottom
     STORE, SEND, MODELS, EFFORTS  where the answers are kept and where 제출 sends them
   The answers: picks { question id: value ('a,b' for several) }, notes { question id: text }. A question counts only once
   picked: ★ is the default the page recommends, never an answer. */
import { ITEMS } from './pending.data.mjs';

export const STORE = { doc: 'picks/open', local: 'open-catalog.picks' };
// (page: this page's address once it is published, for the new session's prompt; empty until the coordinator sets it)
export const SEND = {
  server: 'Claude Code Remote',
  tool: 'create_session',
  env: 'env_01KiMQGcomU8mZwk3NLBSJRM',
  repo: 'moedisoya13/moedisoya13',
  branch: 'claude/vibrant-ritchie-xornhd',
  title: '프로 복서',
  page: 'https://claude.ai/artifact/HybxKJu7LtBsGHs7M1rYpz'
};
// (the families the user's own catalogue offers for a new session; the first is the default)
export const MODELS = [['claude-opus-5-5', 'Opus 5.5'], ['claude-fable-5-2', 'Fable 5.2'], ['claude-sonnet-5-5', 'Sonnet 5.5'], ['claude-haiku-5-5', 'Haiku 5.5']];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/* On the pages the two branches of grades 4 and 5 read L (명, clean) and D (암, dirty); the old data keeps 명 and 암. The same
   rule as src/pending.mjs asLD (which writes its page when imported and so cannot lend it). */
export function asLD(s) {
  const after = { L: { 는: '은', 와: '과', 가: '이', 를: '을' }, D: { 은: '는', 과: '와', 이: '가', 을: '를' } },
    swap = (ld, j = '') => ld + (after[ld][j] || j);
  return String(s)
    .replace(/([45])명(은|는|과|와|이|가|을|를)?/g, (_, n, j) => n + swap('L', j))
    .replace(/([45·])암(은|는|과|와|이|가|을|를)?/g, (_, n, j) => n + swap('D', j))
    .replace(/· 명/g, '· L')
    .replace(/· 암/g, '· D')
    .replace(/\((명|암)\)/g, (_, w) => (w === '명' ? '(L)' : '(D)'))
    .replace(/(^|[\s,(])암(은|는|과|와|의|에)/g, (_, b, j) => b + swap('D', j));
}

export const GROUPS = [
  { id: 'audit', title: '점검에서 찾은 것', note: '11-25 자체 점검(에이전트 10회)에서 나온 것 가운데 <b>조정자가 본 저장소(37419ff)에서 직접 다시 돌려 재현한 것만</b>, 겹치는 것을 합쳐 심각도 순으로. 재현 스크립트는 <code>docs/audit-2026-11-25/</code>, 전체 목록은 <code>docs/audit-2026-11-25.md</code>. 아직 아무것도 고치지 않았습니다.' },
  { id: 'look', title: '카탈로그 점검에서 찾은 것', note: '11-26 카탈로그별 점검(에이전트 4회, 페이지마다 하나): 결함 25건 · 개선 23건, <b>모두 조정자가 다시 돌려 확인</b>. 카탈로그마다 한 장 — <b>고칠 것을 여럿 고르세요</b>(고르지 않은 것은 그대로). 전체 목록 <code>docs/look-2026-11-26.md</code>, 재현 <code>docs/look-2026-11-26/</code>.' },
  { id: 'now', title: '지금 정할 것', note: '11-25에 새로 생긴 것입니다. 비교 영상은 같은 너비 · 같은 시계 · 같은 장면입니다.' },
  { id: 'plan', title: '기획의 기본값', note: '옛 미결 카탈로그에서 아직 답이 없는 것(옛 5부 · 1부 · 2부). 옛 카탈로그의 카드와 녹화는 그대로 돌아갑니다.' },
  { id: 'limits', title: '엔진 한계: 받아들일지', note: '대부분 “수용(README의 알려진 한계에 남김) / 다시 시도 / 목표를 고침”입니다.' },
  { id: 'dispose', title: '파기 승인', note: '<b>승인 전에는 아무것도 지우지 않습니다.</b> 카드마다 지울 것을 적었습니다. 고르지 않은 것은 보류로 둡니다.' },
  { id: 'free', title: '자유 메모', note: '' }
];

const YESNO = [['yes', '예'], ['no', '아니오']];
const KEEP = (star) => [['keep', '그대로', ''], ...star];
const APPROVE = [['approve', '승인', '지웁니다(승인된 것만 다음 세션이 지움)'], ['hold', '보류', '지금은 둡니다']];
const ACCEPT = [['accept', '받아들임', 'README의 알려진 한계에 남깁니다'], ['retry', '다시 시도', '고칠 단계를 따로 엽니다']];
const SOUND_HOW = { id: '', title: '어떻게?', note: '여럿 고를 수 있습니다. 자세한 것은 메모에.', multi: true, opts: [['louder', '더 크게'], ['quieter', '더 작게'], ['shorter', '더 짧게'], ['lower', '더 낮게'], ['higher', '더 높게'], ['other', '다른 소리로']] };
const AUDITION = { href: 'https://claude.ai/artifact/92ZDBLW3TVC2M3XJ6bwgeQ', say: '타격음 오디션 (소리마다 단추)' };
const sound = (id, title, state) => ({
  id,
  group: 'now',
  title,
  state,
  opts: [['good', '좋음', ''], ['fix', '고침', ''], ['drop', '뺌', '']],
  star: '',
  follow: { fix: [Object.assign({}, SOUND_HOW, { id: `${id}.how` })] }
});

/* ---- group 1: new (docs/pending.md, 2026-11-25) */
const NEW = [
  {
    id: 'arm-way',
    group: 'now',
    title: '체육복 · 후드의 오른 팔뚝이 가려짐',
    state: '옷이 아니라 자세가 원인입니다. 가드를 올리지 않은 보통 자세(서기 · 스텝 · 잽)에서 뼈대가 뒷손 팔뚝을 조각된 몸통 안으로 몇 cm 넣습니다(풀이는 팔을 가슴 0.13 m 밖에 두는데 가슴은 폭 0.20 × 깊이 0.14 m). 옷은 지금 자세로 구워 그대로 드러나고, 맨몸은 옛 자세로 구워 4 cm 바깥 · 2 cm 앞이라 가려지지 않을 뿐입니다.',
    list: ['30초 시합에서 보통 자세의 팔뚝이 보이는 비율: 맨몸 **0.41**(최저 0.20), 체육복 · 후드 **0.15**(최저 0.01)', '15% 미만인 프레임 58%(390 폭에서 69%). 가드를 올리면 0.45', '가리는 것은 언제나 자기 가슴 · 허리. 컬링 · 그리는 순서 · 후드는 원인이 아님'],
    clips: 'arm',
    opts: [
      ['A', '자세를 고침', '가드의 뒷손을 5 cm 바깥 · 7 cm 앞으로. 시험판에서 보이는 몫 평균 0.50(최소 0.40). 치르는 값: 물리 점검에 새로 걸리는 대본 35개(7 → 42; 상대 몸에 드는 글러브 97프레임 등), 어퍼 65 → 52 N·s, 시험 501개 중 76개가 움직임, 옷을 다시 구움'],
      ['B', '그릴 때만 앞으로', '팔뚝 · 글러브 점을 가려짐 판정에서만 4 cm 앞으로. 시험판에서 보이는 몫 평균 0.52(최소 0.17). 동작 · 물리 점검 · 시험은 그대로. 비치는 곳: 자기 팔꿈치 쪽 윗팔, 가드를 얼굴에 올릴 때 자기 머리 위로 1~4픽셀. 상대나 로프 위로는 비치지 않음'],
      ['C', '옷의 가슴을 깎음', '팔이 움직이면 홈이 보임. 권하지 않음'],
      ['D', '옛 자세로 구움', '눈속임. 권하지 않음'],
      ['keep', '그대로', '']
    ],
    star: 'B',
    why: '작은 변경으로 A만큼 보이고(0.52 대 0.50), 동작 · 시험 · 클립을 건드리지 않습니다. A는 시험판을 재 보니 큰 변경입니다(점검 35개, 시험 76개).',
    follow: {
      B: [{ id: 'arm-way.also', title: 'A도 다음에 동작을 손볼 때 같이 할까요?', opts: YESNO, memo: false }],
      A: [{ id: 'arm-way.when', title: '언제?', opts: [['now', '지금'], ['next', '다음 동작 단계와 함께']], memo: false }]
    }
  },
  {
    id: 'sound-intro',
    group: 'now',
    kind: 'note',
    title: '새 소리를 듣고 (층마다 한 장)',
    state: '**아무도 들어 본 적 없습니다.** 잰 값(오프라인 렌더)뿐이고, 귀로 고칠 것은 들으시는 분이 정합니다. 모두 합성(파일 없음), `src/game/audio.mjs`. 오디션 페이지에서 소리마다 단추 · 세기 · 목소리 · 장소 · 느리게 · 시연 다섯을 들을 수 있습니다.',
    links: [AUDITION]
  },
  sound('sound-breath', '호흡 “쉭”', '주먹마다 이 사이로 내쉬는 숨. 종류 · 선수 · 피로에 따라 다름. 59~105 ms, 에너지 93~100%가 2 kHz 위.'),
  sound('sound-hit', '타격', '가죽 철썩 + 낮은 쿵, 머리 / 몸통과 세기에 비례. J 40 / 85 / 140 N·s → −14.9 / −12.5 / −9.8 dBFS, 102 / 340 / 455 ms, 에너지 87~98%가 150 Hz 아래. 카운터 · 다운은 더 크게.'),
  sound('sound-block', '막기 · 쳐내기', '가죽 대 가죽. 전의 금속성(쇳소리 같은 막기)을 없앰.'),
  sound('sound-hurt', '피격 음성', '맞을 때 “욱” · “헉”, 지쳤을 때 헐떡임.'),
  sound('sound-feet', '발 · 바닥 · 로프', '캔버스 끌림 · 대시(지하는 콘크리트), 쓰러질 때 바닥 쿵, 로프에 기댈 때. 로프 소리는 실제 링 시합에서 확인하지 못함.'),
  sound('sound-bell', '공', '시작에 1번, KO에 3번. 승리 · 패배 징글은 그대로.'),
  sound('sound-crowd', '관중', '함성과 웅성임(링 · 지하).'),
  sound('sound-mix', '전체 믹스', '버스 · 컴프레서 · 리미터, 좌우 ±0.4, 동시 18음. 강타 12 + 숨 8을 0.3초에 겹쳐도 최고 −2.1 dBFS(깨짐 없음). 슬로 리플레이는 ¼에서 한 옥타브 낮고 두 배 길게.'),
  {
    id: 'sound-head-pop',
    group: 'now',
    title: '머리 타격의 “팍”이 30 ms뿐',
    state: '머리에 맞을 때 밝은 소리가 30 ms만 납니다. 에너지는 머리 · 몸통 모두 150 Hz 아래라 둘이 비슷하게 들릴 수 있습니다.',
    opts: [['keep', '그대로', ''], ['bright', '더 밝고 길게', '머리 타격을 몸통과 더 다르게']],
    star: 'bright',
    why: '머리와 몸통이 귀로 구별되어야 타격이 읽힙니다.'
  },
  {
    id: 'sound-steps',
    group: 'now',
    title: '발소리가 걸은 거리 기준',
    state: '걸은 거리 0.38 m마다 한 번이라, 제자리 바운스에는 발소리가 없습니다.',
    opts: [['keep', '그대로', ''], ['bounce', '바운스에도', '제자리에서 뛰는 박자에도 발소리']],
    star: 'keep',
    why: '바운스마다 소리가 나면 시합 내내 소리가 깔립니다.'
  },
  {
    id: 'ring-lean',
    group: 'now',
    title: '로프에 기대기가 작음',
    state: '16° 요청에 **약 7°**입니다(가드의 앞숙임 7.4°에서 곧게 서는 데까지). 중심이 2.55 m에서 멈추고 로프가 밀어내기 때문입니다(로프는 2.62 m, 휨 5~10 cm는 게임 카메라에서 2~3픽셀).',
    clips: 'lean',
    opts: [['now', '지금 약 7°', '상체가 곧게 서는 데까지'], ['more', '크게', '기울임의 한도 16 → 34(숫자 하나). 시험판에서 8.1° 뒤로 젖힘(가드에서 15.5°), 로프 눌림 9.6 → 12.4 cm. 물리 점검 그대로, 시험 그대로']],
    star: 'more',
    why: '요청은 16°였고, 7°는 게임 화면에서 기댄 것으로 잘 읽히지 않습니다.'
  },
  {
    id: 'ring-rope-legs',
    group: 'now',
    title: '맨 아래 로프가 다리에 눌리지 않음',
    state: '다리에 접촉 공이 없어 맨 아래 로프는 다리에 밀리지 않습니다.',
    opts: [['keep', '그대로', ''], ['legs', '다리도 닿게', '다리에 접촉 공을 더함']],
    star: 'keep',
    why: '게임 카메라에서는 거의 보이지 않고, 몸에 닿는 로프는 이미 휩니다.'
  },
  {
    id: 'pit-near-wall',
    group: 'now',
    title: '지하: 세로 화면에서 가까운 드럼 · 벽이 가림',
    state: '세로 휴대폰 화면 아래쪽에 카메라 가까운 드럼 · 벽이 크게 들어와 선수를 가립니다.',
    opts: [['keep', '그대로', ''], ['hide', '가까운 쪽을 숨김', '카메라와 선수 사이의 드럼 · 벽을 그리지 않음'], ['camera', '카메라를 올림', '더 위에서 내려다봄']],
    star: 'hide',
    why: '선수가 가려지지 않는 것이 먼저이고, 카메라 각은 링과 같게 둡니다.'
  },
  {
    id: 'pit-crowd-face',
    group: 'now',
    title: '지하: 관중에 얼굴이 없음',
    state: '관중은 얼굴 없이 몸과 팔만 있습니다. 팔이 올라갈 때 어깨 높이에서 잠깐 납작해집니다.',
    opts: [['keep', '그대로', ''], ['face', '간단한 얼굴', '몇 픽셀의 눈 · 입']],
    star: 'keep',
    why: '게임 카메라에서 관중 얼굴은 1~2픽셀입니다.'
  },
  {
    id: 'pit-crowd-pop',
    group: 'now',
    title: '지하: 관중 조각이 통째로 나타남',
    state: '카메라가 돌 때 관중 조각이 통째로 나타나고 사라집니다.',
    opts: [['keep', '그대로', ''], ['fade', '서서히', '나타나고 사라질 때 흐리게']],
    star: 'fade',
    why: '깜빡임은 눈에 띄고, 서서히는 비용이 작습니다.'
  },
  {
    id: 'pit-lean',
    group: 'now',
    title: '지하: 드럼 · 벽에 기대기 없음',
    state: '지하는 가장자리에서 예전 링처럼 멈춥니다(드럼에 기대기는 일부러 넣지 않음).',
    opts: [['keep', '그대로', ''], ['add', '넣음', '드럼 · 벽에 등을 기댐']],
    star: 'keep',
    why: '단단한 벽에 기대는 것은 로프와 달라 따로 기획이 필요합니다.'
  },
  {
    id: 'spar-tempo',
    group: 'now',
    title: '스파링: 동작 사이의 회복이 김',
    state: '스파링은 다음 동작을 엔진이 허용하는 첫 프레임에 누릅니다(기술 줄의 틈 평균 0.56프레임). 그래도 느리게 느껴진다면 **엔진 자체의 회복**입니다.',
    list: ['주먹 → 다음 주먹 4~10프레임, 주먹 → 회피 · 가드 · 걸음 **25~40프레임**(0.4~0.67 s)', '슬립 18~49, 더킹 27~70, 위빙 22~62, 스웨이 22~57프레임(등급이 낮을수록 김)', '맞으면 0.16 s + J/260 멈춤'],
    clips: 'tempo',
    opts: [['keep', '그대로', ''], ['engine', '엔진 전체에서 줄임', '회복을 28% 짧게(시험판: 닿은 뒤 다른 동작까지 1단계 39 → 24, 3단계 잽 25 → 18, 5암 크로스 31 → 24프레임). 치르는 값: 물리 점검에 새로 걸리는 것 19프레임(상대 몸에 드는 글러브 12 등), 시험 501개 중 16개가 움직임, 카탈로그의 모든 주먹이 달라짐'], ['spar', '스파링에서만 줄임', '스파링 페이지의 안무에서만(게임과 카탈로그는 그대로). 시험판은 아직 없음']],
    star: '',
    why: '★ 없음. 시험판을 20판 돌리면 초당 기술이 선수마다 1.84 → 1.96, 동작 사이의 가장 긴 기다림이 24 → 14프레임으로 줄지만, 기술 줄의 가장 긴 빈 시간은 1.36 → 1.32초로 거의 같습니다. 눈으로 보고 정하실 일입니다.'
  },
  {
    id: 'spar-finish',
    group: 'now',
    title: '스파링: 마무리 타격이 약함',
    state: '50판의 다운 주먹 50개 가운데 **13개가 45 N·s 아래**(최저 **7.6**, #12; 11-25 점검에서 다시 잼. 그 전 기록은 15개 · 최저 9.8)입니다.',
    opts: [['keep', '그대로', ''], ['heavy', '마무리는 강타로', '다운을 내는 주먹을 강타 중에서 고름']],
    star: 'heavy',
    why: '약한 주먹으로 쓰러지면 다운이 읽히지 않습니다.'
  },
  {
    id: 'spar-evade',
    group: 'now',
    title: '스파링: 피하기가 드물고 맞바꿈이 많음',
    state: '빗나가게 한 것 190 대 피하다 맞은 것 338, 주먹의 49%가 닿고 판마다 피격 약 59.',
    opts: [['keep', '그대로', ''], ['more', '피하기를 늘림', '안무가 회피를 더 자주, 더 이르게 고름']],
    star: 'more',
    why: '스파링의 볼거리는 주고받는 수비입니다.'
  },
  {
    id: 'stage-order',
    group: 'now',
    title: '남은 구현의 순서',
    state: '`docs/pending.md` “다음 (순서대로)”와 허리 추가(`docs/waist-more-plan.md`), 소스 A · B(`docs/source-ab-plan.md`), 콤보(`docs/combos-plan.md`)를 이은 순서입니다. 한 번에 하나씩.',
    list: ['N2 도약 훅', 'P 크로스암 세우기', 'Q 수비', 'R 풋워크와 횡 이동', 'S 파도 · 시프트', 'X 반응 시간 수비 · 능력치 범위 · 블록 지구력', '콤보 C1~C4', 'N3 · R2 (소스 A · B)', 'N4 · V2 (허리 추가)', 'Z 최종 통합'],
    opts: [['asis', '이 순서대로', ''], ['change', '바꿈', '메모에 순서를'], ['audit-first', '점검 먼저', '위 자체 점검의 결과를 보고 정함']],
    star: 'asis',
    why: '기획 문서의 순서이고, 앞 단계가 뒤 단계의 바탕입니다.',
    follow: { change: [{ id: 'stage-order.how', title: '어떤 순서로?', note: '메모로 적어 주세요.', opts: [] }] }
  }
];

/* ---- group 0: what the self-audit of 11-25 found (docs/audit-2026-11-25.md). Only what the coordinator re-ran on the
   repository and saw happen; the auditors' own sweep rates are marked as theirs. Each card's repro:
   node docs/audit-2026-11-25/<file>.mjs <the pixel-boxer folder> */
const FIX = [['fix', '고침', '다음 수정 라운드에서'], ['later', '나중에', '관련 단계에서 (메모에 단계)'], ['leave', '그대로', '알려진 한계로 README에 남김']];
const run = (...f) => `재현: ${f.map((x) => `\`node docs/audit-2026-11-25/${x}.mjs <pixel-boxer>\``).join(', ')}`;
const finding = (id, sev, title, state, more, star, why, extra = {}) => ({ id, group: 'audit', title: `${sev} · ${title}`, state, more, opts: FIX, star, why, ...extra });
const AUDIT = [
  {
    id: 'a-about',
    group: 'audit',
    kind: 'note',
    title: '점검의 방법과 확인하지 못한 것',
    state: '에이전트 10개(구현 쪽 모델, 노력 high)가 각자 얼린 작업 폴더에서 읽고 돌리기만 했습니다(작업 폴더 10개 모두 끝에 깨끗). 보고된 45건을 조정자가 하나씩 본 저장소에서 다시 돌려 **45건 모두 재현**, 겹치는 것을 합쳐 아래 38장. 심각도: **S2** 누구나 보는 잘못 · 게임성을 깸, **S3** 눈에 띄지만 제한적, **S4** 사소함 · 글. S1(멈춤 · NaN · 안 열림)은 없었습니다. 기기가 붐벼(CPU 4개에 평균 부하 10~35) 프레임 시간 같은 절대 시간은 뜻이 없습니다. 아래는 에이전트가 보았으나 **확정하지 못한 것**(재현 없음):',
    list: [
      '1단계끼리 붙으면 0번 쪽이 이기는 듯함(40시드 20:11, 우연일 확률 약 7%; 균형 도구는 편을 바꿔 가려짐)',
      '피커부 셸의 웅크림이 자기 주먹으로 일찍 끊기는 듯함(셸 중에 잽 · 스트레이트가 나감)',
      '다음 라운드 시작이나 다운 뒤에 지난 콤비네이션이 남아 나갈 수 있음(코드 읽기만)',
      '5L의 가드 · 커버가 0.13초마다 바뀜(한 장면만 봄; 아래 a-guard-flicker와 같은 뿌리일 수 있음)',
      '로프 앞에서 팔꿈치 · 글러브가 로프를 지남, 링에서 쓰러진 몸이 화면에 어떻게 보이는지(그림으로는 지하만 봄)',
      '휴대폰: iOS의 소리 잠금 해제 · 중단 상태, 자동 시작(`?auto=1`) 뒤 첫 탭에 소리가 한꺼번에 날 수 있음',
      '설계로 보이는 것: 바디로 쓰러지면 KO가 없음(늘 8에 일어남), 세 심판이 거의 같게 채점, 막은 주먹이 막은 쪽 점수가 됨'
    ]
  },
  finding('a-fall-edge', 'S2', '쓰러진 몸이 지하 벽 · 링 로프 · 기둥을 뚫음',
    '**지하**: 벽에서 0.55 m에서 스트레이트(82 N·s)를 맞고 쓰러지면 머리가 벽 바깥면(3.0 m)을 지나 3.1 m에 눕고, 가슴 · 어깨 · 팔이 벽돌 안에(누운 270프레임 중 255). 구석 · 통 옆도 같음. 에이전트의 쓸기: 지하 스파링 시드 1~20 중 5판. **링**: 로프 앞에서 쓰러지면 위 · 가운데 로프를 지나 머리가 로프 밖 0.49 m, 구석에서는 머리가 쇠기둥에 11 cm.',
    `원인: 쓰러짐 풀이(\`src/phys/fall.mjs\`)에 가장자리가 없고, 다운한 사람은 로프 계산을 건너뜀(\`src/game/bout.mjs\` ropes). 고치는 데: 중~대(쓰러짐 풀이에 벽 · 로프 조건; 가장자리 쓰러짐과 리플레이 구도가 움직임, 굽기 없음). ${run('6-1', '6-1-shot', '6-2')}`,
    'fix', '화면에서 바로 보이는 관통입니다(그림 확인).'),
  finding('a-standoff', 'S2', '주먹이 하나도 없는 라운드',
    '지친 쪽의 회복 작전(`breathe`)과 방어 작전(`defend`)은 잽이 닿는 거리 밖에 머물러, 둘이 맞붙으면 **한 라운드 60초 동안 주먹 0개**, 채점 10-10. 균형 도구가 맨 먼저 치르는 판(시드 1000, 프로 대 프로)의 3라운드가 저절로 그렇습니다(라운드별 주먹 114 · 132 · **0**). 에이전트의 쓸기: 102라운드 중 5, 243라운드 중 13.',
    `원인: 코너가 쉬는 시간 **전**의 피로로 작전을 정함(\`match.mjs\` cornerAdvice → nextRound), 작전 거리 1.65 / 1.3 m가 콤비네이션을 시작하는 거리 1.10 m보다 멂(\`brain.mjs\`). 고치는 데: 소~중(시합 표 · 균형 수치가 움직임). ${run('2-1', '1-3')}`,
    'fix', '시합 엔진의 라운드가 비면 오토 배틀러가 성립하지 않습니다.'),
  finding('a-ropes-stuck', 'S2', '선수 AI가 링을 모름: 로프 · 구석에 붙어 머묾',
    '회복 작전의 선수가 곧장 뒤로 걸어 로프에 붙고 그대로 있습니다: 2 · 3라운드 6판 모두, 그 라운드의 **76~89%를 로프 앞**, 구석 33~54%, 한 번에 가장 길게 **29.1초**. 보통 작전에서도 구석에서 16.4초 동안 15대를 맞으며 머문 판이 있습니다(22판 중 3판이 10초 이상, 에이전트의 쓸기).',
    `원인: 발놀림이 "상대와의 거리 + 무작위 원 돌기"뿐이고 로프 항이 없음(\`brain.mjs\` think; \`ai.mjs\`도 같음). 로프의 미는 힘이 뒷걸음을 못 이김. 고치는 데: 중(모든 시합의 경로 · 주사위가 바뀜, 시드 고정 시합 시험 몇이 움직일 수 있음). ${run('6-5', '3-2')}`,
    'fix', '링의 로프 · 구석이 기능인데 머리가 쓰지 않습니다.'),
  finding('a-guard-flicker', 'S2', '수비 작전의 가드가 매 프레임 오르내려 패리가 70%',
    '방어 · 회복 · 카운터 작전의 "손을 올리고 기다림"이 매 프레임 동전 던지기라 **초당 18.5번** 가드가 오르내리고, 올린 프레임의 83%가 "갓 올린 가드"로 읽혀 패리가 됩니다. 같은 비율로 들고 있게 하면 패리는 40%, 지금은 **70%**.',
    `원인: \`brain.mjs:180\`의 \`random(bout) < 0.5\`를 매 걸음 굴림, 가드를 내린 프레임마다 \`coverAge\`가 0으로(\`bout.mjs\`). 고치는 데: 소(상대의 \`hold\`처럼 한동안 유지; 시합 수치가 움직임). ${run('1-1')}`,
    'fix', '패리 하나가 상대를 0.6초 묶는 큰 보너스입니다.'),
  {
    id: 'a-screen-ai',
    group: 'audit',
    title: 'S2 · 게임 화면에서는 선수 AI가 돌지 않음 (알려진 한계)',
    state: 'README의 "화면은 아직 직접 대전"과 같은 것. 게임 화면의 홍코너는 12.5초 동안 **동작 0**(맞아서 밀린 2 m뿐), 청코너는 단순한 상대 AI(프로, 기본 로드아웃)입니다. 그래서 오토 배틀러의 시합(두 선수 AI · 라운드 · 카운트 · 판정)은 **지금 어느 페이지에서도 볼 수 없습니다** — 위의 시합 엔진 문제들도 화면에는 나오지 않습니다.',
    more: `고치는 데: 화면에 \`match.mjs\`와 두 머리, 라운드 · 카운트 표시를 붙이는 설계 단계(\`stage-order\`). ${run('3-1')}`,
    opts: [['soon', '수정 라운드 뒤 바로', '고친 시합 엔진을 화면에서 보게'], ['z', 'Z 최종 통합에서', '지금 순서대로'], ['leave', '그대로', '']],
    star: 'soon',
    why: 'AI · 판정을 고쳐도 볼 곳이 없으면 확인할 수 없습니다.'
  },
  finding('a-draw-winner', 'S3', '"무승부"인데 승자가 붙음',
    '심판 하나만 한쪽, 둘은 동점이면 결과가 `{ winner: 0, how: \'draw\' }`이고 그 선수가 환호합니다. 균형 도구는 이것을 **승리로 셉니다**. 에이전트의 쓸기: 무승부 7 중 3, 4 중 3.',
    `원인: \`match.mjs:96\`의 식 하나(판정 코드에서 직접 확인). 고치는 데: 소. ${run('2-2', '1-2')}`,
    'fix', '한 줄이고 균형 수치가 바로잡힙니다.'),
  finding('a-count-ten', 'S3', '일어나는 중인 선수에게 10까지 세고 시합이 이어짐',
    '카운트 8에 일어나기 시작하면 일어나는 동작(2.3초)이 끝나기 전에 카운트가 10에 닿습니다. 아직 바닥 동작인데 KO가 아니고 시합이 이어집니다(재현의 일어남 5번 중 1번). 일어난 뒤에도 1~3번 더 셉니다.',
    `원인: 일어남을 시작할 때 \`down\`이 풀려 KO 판정(\`down && n >= 10\`)을 빠져나감(\`match.mjs:119-130\`, \`bout.mjs\` getUp). 고치는 데: 소. ${run('2-3')}`,
    'fix', '카운트를 화면에 보이면 "10" 뒤에 싸움이 이어집니다.'),
  finding('a-hurt-blind', 'S3', '선수 AI가 라운드 안에서 자기 체력을 보지 않음',
    '체력 15일 때와 100일 때 고르는 것이 **5,400걸음 모두 같음**(같은 방법으로 지구력을 바꾸면 28%가 달라짐). `brain.mjs` · `ai.mjs`에 체력(`.hp`)을 읽는 곳이 0(직접 확인). 체력 13의 선수도 똑같이 덤빕니다.',
    `고치는 데: 소(덤빔 · 거리 · 가드에 체력 항; 다친 판의 주사위가 바뀜). ${run('3-3')}`,
    'fix', '다친 선수의 커버 · 뒷걸음이 오토 배틀의 볼거리입니다.'),
  {
    id: 'a-dark-line',
    group: 'audit',
    title: 'S3 · 암(D) 줄이 오르지 않음: 기본 크로스암이 패리를 앗아감',
    state: '같은 등급에서 L이 D를 9승 0패 3무(12판), 4D는 3단계에 4승 3패 1무, 5D는 4D에 2승 2패. 4D · 5D의 기본 로드아웃에 든 크로스암 가드는 받아넘기지 않아 패리가 판마다 **4~10번**, 빼면 **20번 안팎**이고 L에게 4승 8패(재현 2판: 패리 12 → 49). 표본이 작음(등급 쌍마다 4~12판).',
    more: `원인: \`techniques.mjs:280\`(4 · 5단계 D의 기본에 crossArm), \`bout.mjs:664\`(크로스암은 해머가 아니면 쳐내지 않음). 관련 카드: \`loadout-default\`. ${run('1-4')}`,
    opts: [['drop', '크로스암을 기본에서 뺌', ''], ['parry', '크로스암 가드에 패리를 조금', ''], ['counter', '크로스암 반격을 세게', ''], ['later', 'X 단계(능력치 범위)에서', ''], ['leave', '그대로', '']],
    star: '',
    why: '균형의 방향은 정하실 일이고, 표본도 작습니다.'
  },
  {
    id: 'a-novice',
    group: 'audit',
    title: 'S3 · 1단계는 능력치를 +30 해도 2단계를 못 이김',
    state: '같은 능력치에서 2단계가 1단계를 10전 10승. 1단계의 능력치를 모두 80(2단계는 50)으로 올려도 **0승 4패**, 다운 9번 당하고 0번. 맞힌 주먹 하나가 1단계 18~21 N·s, 2단계 39 N·s(3단계 53). 2단계와 3단계 사이는 능력치가 판을 바꿉니다.',
    more: `원인이 아니라 설계: 1단계 주먹의 팔 먼저 사슬(\`skill.mjs\`), 힘 능력치는 ×0.76~1.24. ${run('1-5')}`,
    opts: [['keep', '의도대로', '등급이 능력치보다 큼'], ['tune', '1단계를 조금 올림', '주먹 세기나 능력치 폭'], ['later', 'X 단계에서', '']],
    star: 'later',
    why: '능력치 범위를 다루는 X 단계에서 함께 보는 것이 맞습니다.'
  },
  finding('a-cover-punch', 'S3', '1단계가 높은 커버에서 바로 치면 윗팔이 머리 위로 돔',
    '실제 시합에서 1단계 선수가 막은 직후 스트레이트를 내면 윗팔이 6~9프레임 동안 165° 돌거나 머리 위로 올라갑니다(재현: 회전 한계를 **78.7° 넘음**, 9프레임). 물리 점검이 지키는 기준인데 카탈로그 대본 503개에는 이 동작이 없어 안 걸렸습니다. 에이전트의 쓸기: 30판 중 17판. 스파링 합계는 `docs/spar.md`에 있음.',
    `원인(추정): 1단계 커버의 팔 자세에서 주먹 사슬로 넘어갈 때 어깨가 먼 쪽으로 돎. 고치는 데: 소~중(커버에서 나오는 주먹의 시작 자세 또는 어깨 회전 제한). ${run('4-1')}`,
    'fix', '물리 점검이 지키는 기준을 실제 시합이 깹니다.'),
  finding('a-topple', 'S3', '5L이 무게중심을 발 밖에 둔 채 한 발로 섬',
    '실제 시합에서 5L이 디딘 발 밖으로 무게중심을 **최대 35.7 cm** 둔 채 0.3초 넘게 한 발로 섭니다(40초에 79프레임, 링 한가운데서도). 물리 점검의 기준은 6 cm. 에이전트의 쓸기: 30판 중 20판, 그 절반이 5L.',
    `원인(추정): 가드 · 커버가 자꾸 바뀌어 스텝이 끊기고 다시 시작됨 — \`a-guard-flicker\`와 같은 뿌리일 수 있음. 고치는 데: 중. ${run('4-3')}`,
    'fix', 'a-guard-flicker를 고친 뒤 다시 재면 비용이 줄 수 있습니다.'),
  finding('a-corner', 'S3', '링 구석: 몸통이 코너 패드 안에 서고 로프 밖으로 비침',
    '구석에 몰리면 엉덩이 · 허리 · 배 · 가슴이 코너 패드 안에(150프레임 중 144), 그려진 로프 밖으로 **10 cm** 비칩니다(가운데 로프에서는 0). 시합 30판 중 23판, 최악 15.9 cm. 시합 시간의 14%가 구석.',
    `원인: 몸의 중심을 네모(2.55 m)로만 묶는데 패드는 2.53 m부터, 로프가 기둥 0.4 m 안에서는 거의 휘지 않음(\`ropes.mjs\` bend). 고치는 데: 소~중. ${run('6-3', '4-2')}`,
    'fix', '로프에 기대는 장면이 구석에서 자주 나옵니다.'),
  finding('a-pit-foot', 'S3', '지하 가장자리에서 뒷발이 벽돌 벽에 들어감',
    '가장자리까지 물러서면 뒷발목이 벽 안으로 6.5 cm, 구석에서는 발끝이 **10.4 cm**. 서 있는 동안 늘(120프레임 중 120).',
    `고치는 데: 소(지하만 멈추는 선을 2.45 m쯤으로, 또는 벽을 0.1 m 밖으로 — 그쪽은 다시 굽기). ${run('6-4')}`,
    'fix', ''),
  finding('a-pit-outline', 'S3', '지하: 관중을 등지면 선수의 검은 외곽선이 빠짐',
    '관중 조각이 셰이더에서 "불빛"으로 읽혀 그 둘레에 외곽선을 긋지 않습니다. 30프레임 중 14, 한 프레임에 최대 88픽셀(외곽선의 약 1/5). 그림으로 확인.',
    `원인: \`renderer.mjs:125\`의 빛 판정이 관중의 뼈 번호 칸을 빛 표시로 읽음. 고치는 데: 소(셰이더만, 굽기 없음). ${run('5-2')}`,
    'fix', ''),
  finding('a-hood-face', 'S3', '후드를 쓰면 게임 카메라에서 얼굴이 아예 안 보임',
    '후드를 쓰면 얼굴 픽셀이 사람마다 중간값 **1**(내리면 64), 30프레임 중 27에서 두 사람 모두 3픽셀 이하 — 회색 공 둘(그림으로 확인). 가드와 상관없이 늘. 지금까지는 "가드를 올리면"만 적혀 있었습니다.',
    `원인: 옆에서 보면 후드의 옆면과 챙이 얼굴을 덮음(\`rig/boxer.mjs\` 후드 공 0.14 m, 머리 0.118 m). 고치는 데: 중(후드를 다시 조각하고 \`tools/bake.mjs --wear\`). ${run('5-4')}`,
    'fix', ''),
  finding('a-ko-thud', 'S3', '약한 주먹의 KO는 타격음이 짧고 가벼움',
    'KO 주먹의 낮은 쿵과 길이 늘임이 42.5 N·s 위에서만 켜져, 다운 40 N·s는 139 ms, 45 N·s는 586 ms로 끊기듯 달라집니다. 스파링 #6 · #8은 KO 주먹이 그 판의 보통 주먹보다 조용합니다(에이전트의 쓸기: KO 12개 중 6개가 42.5 아래).',
    `원인: \`audio.mjs:233-237\`. 고치는 데: 소(다운 타격은 최소한 강타만큼). ${run('7-1')}`,
    'fix', '"다운은 가장 무겁게"(README)와 어긋납니다.'),
  finding('a-ko-bell', 'S3', 'KO의 공 소리가 슬로 리플레이 위에서 울림',
    'KO 공 세 번(+1.1 · 1.4 · 1.7초)이 리플레이(+0.87초부터) 한가운데, 느려진 타격음 바로 위에 떨어집니다(에이전트의 쓸기: 12판 중 12). README는 리플레이를 "관중 · 공 없이"라고 함.',
    `원인: \`cuesOf\`가 공을 고정 지연으로 예약(\`audio.mjs:86\`). 고치는 데: 소(리플레이가 끝나거나 건너뛸 때 침; \`tests/sfx.test.mjs\` 두 줄이 바뀜). ${run('7-2')}`,
    'fix', ''),
  finding('a-hidden-sound', 'S3', '숨긴 탭에서도 소리가 계속됨, 지하 웅성거림은 결과 화면에서도',
    '페이지를 숨겨도 오디오가 계속 돌고(시합은 멈춤) 지하의 관중 웅성거림이 이어집니다(숨긴 8초 동안 오디오 시계 4.0 → 12.7초). 게임은 지하 웅성거림을 끄지 않아 결과 화면에서도 계속. 두 페이지 모두 `visibilitychange` 처리가 0.',
    `고치는 데: 소(숨기면 \`suspend\`, 보이면 \`resume\`). ${run('7-5', '9-3')}`,
    'fix', '휴대폰에서 다른 앱으로 가도 소리가 남는 것은 바로 눈에 띕니다.'),
  finding('a-spar-link', 'S3', '스파링: 링크로 연 뒤 "시작" → "다시 보기"가 다른 판을 엶',
    '`spar.html#s-7`로 열고 시작(#5가 돎) 뒤 다시 보기를 누르면 #5를 다시 보지 않고 링크의 #7을 짭니다. #5는 링크를 다시 쳐야 볼 수 있음.',
    `원인: 링크가 단 한 번용 단추 처리가 지워지지 않음(\`src/spar.mjs:739\` 대 \`:684\`). 고치는 데: 소, 스파링 다시 게시. ${run('8-1')}`,
    'fix', ''),
  finding('a-spar-pinned', 'S3', '스파링: 한 사람이 3.8초 동안 아무것도 못 하고 맞기만 함',
    '#36에서 한 사람이 **3.78초** 동안 기술을 하나도 시작하지 못하고 그중 189프레임이 피격, 7대를 맞습니다. 문서는 "두 사람 모두 아무것도 안 하는" 빈 시간(최대 2.45초)만 잼. 에이전트의 쓸기: 시드 34~50의 34명 중 5명이 3초 넘음.',
    `원인: 안무가(\`src/spar/plan.mjs\`)가 한 사람이 연달아 맞는 수를 묶지 않음. \`spar-evade\`와 같은 손질. 고치는 데: 중. ${run('8-2')}`,
    'fix', '사용자가 바란 "양측에 꽉 찬 액션"과 어긋납니다.'),
  finding('a-spar-race', 'S3', '스파링: 장소 · 옷을 빨리 바꿨다 되돌리면 처음 고른 것으로 남음',
    '선택 칸은 두 번째(되돌린 것)를 보이는데 페이지는 첫 번째로 그리고 기억합니다(4번 중 4번; 재현은 휴대폰 망처럼 응답을 1.5초 늦춤).',
    `원인: \`src/spar.mjs:694-711\`, 늦게 끝난 첫 로드가 이김. 고치는 데: 소. ${run('9-1')}`,
    'fix', ''),
  {
    id: 'a-gl-lost',
    group: 'audit',
    title: 'S3 · 그래픽 컨텍스트를 잃으면 화면이 흰색으로 남음',
    state: '휴대폰이 백그라운드 · 메모리 부족으로 WebGL을 떨구면 게임 · 스파링 캔버스가 영구히 흰색(95% · 87%)이고 시합은 보이지 않게 계속됩니다. 복구 요청을 처리하지 않음.',
    more: `원인: \`webglcontextlost\` · \`restored\` 처리가 \`src/\`에 없음. 고치는 데: 복구는 중(메시 · 프로그램 다시 만듦), "다시 불러오기" 표시만은 소. ${run('9-2')}`,
    opts: [['fix', '복구', '잃으면 다시 만듦'], ['reload', '다시 불러오기 단추만', '싸게'], ['leave', '그대로', '']],
    star: 'reload',
    why: '먼저 싼 쪽으로 흰 화면만 막습니다.'
  },
  finding('a-frame-meter', 'S3', '프레임 시간 표시가 그리기를 빼고 잼',
    '`#fps` 표시와 README의 "1.5~1.9 ms"는 그림을 **예약하는** 자바스크립트만 잽니다. 같은 환경에서 그림이 다 그려질 때까지 기다리면 표시 3.5 ms에 실제 661 ms(소프트웨어 GL). 그래서 휴대폰의 GPU 병목을 이 표시로는 볼 수 없습니다. 링과 지하의 차이는 없음(0.9~1.0배).',
    `알려진 한계("휴대폰 프레임 시간은 못 잼")의 새 면. 고치는 데: 소(프레임 간격으로 재고 README 고침). ${run('9-4')}`,
    'fix', ''),
  finding('a-catalog-scroll', 'S3', '모션 카탈로그가 휴대폰 폭에서 가로로 스크롤됨',
    '390 px에서 페이지 폭 450 px. 행 하나(`out-counter`)의 영어 이름이 줄을 바꾸지 않습니다. 게시된 v43도 같음.',
    `원인: \`catalog.html:86\`의 \`nowrap\`. 고치는 데: CSS 한 줄, 카탈로그 다시 게시. ${run('10-1')}`,
    'fix', ''),
  finding('a-idle', 'S4', '선수가 시합 시간의 30%를 아무것도 안 하고 섬',
    '"아무것도 안 함" = 동작 없음 · 가드 내림 · 5 cm/s 미만. 선수마다 약 30%, 한 번에 최대 2.5초(쓸기에서 3.9초). 두 사람이 동시에 그런 것은 5%.',
    `원인: 발놀림의 죽은 구간과 원 돌기 0이 반(\`brain.mjs\`). 고치는 데: 소, 시합 경로가 바뀜. ${run('3-4')}`,
    'later', 'R(풋워크) 단계에서 함께.'),
  finding('a-reel-g', 'S4', '휘청임이 "중력보다 빨리 떨어짐"에 2.6 g로 걸림',
    '휘청임(V 단계) 중 무게중심 높이가 2~5 mm 떨려 2.6 g(받아들인 예외는 out-log 1.6 g). 화면에서는 보이지 않음.',
    `고치는 데: 소(휘청임의 높이 채널을 고름). ${run('4-4')}`,
    'fix', '지키는 점검이라 예외를 넓히지 않고 고치는 쪽입니다.'),
  finding('a-single-frames', 'S4', '실제 시합의 한 프레임 위반들',
    '자기 글러브가 다른 팔에 10.6 cm(기준 2), 허벅지가 골반 뒤로 38.6°, 자기 글러브가 머리에 6.0 cm, 두 사람이 8.0 cm 겹침. 모두 스파링 합계로는 `docs/spar.md`에 있었고, 시합 30판의 수치가 새것.',
    run('4-5'), 'leave', '한 프레임씩이라 README에 시합 수치를 더하는 것으로 충분합니다.'),
  finding('a-pit-hud', 'S4', '지하: 위쪽 글자가 늘 관중 위에, 가까운 관중이 선수보다 크게',
    '코너 이름 · 라운드 글자 아래가 30프레임 모두 관중(링은 어두운 홀). 카메라 가까운 관중이 선수보다 크게 그려지는 프레임 1280 폭 15 중 3, 390 폭 15 중 2. 화면의 20~33%가 관중.',
    `고치는 데: 소(글자 뒤 어두운 띠, 또는 카메라 가까운 관중을 흐리게). ${run('5-1')}`,
    'fix', ''),
  finding('a-pit-spark', 'S4', '지하: 막기 불꽃이 파랑 대신 콘크리트 갈색',
    '막기 불꽃의 3분의 2(66 중 45)가 지하 바닥 팔레트로 그려져 어두운 바닥에 어두운 갈색.',
    `원인: \`main.mjs:187\` · \`:345\`. 고치는 데: 소. ${run('5-3')}`,
    'fix', ''),
  finding('a-replay-silent', 'S4', '리플레이에서 맞기 전까지 소리가 없음',
    '리플레이는 타격 · 막기 · 쳐내기만 다시 들려줘, KO 주먹의 숨 · 바람이 빠지고 리플레이의 처음 0.5~0.7초가 조용합니다. README는 "그 스텝의 사건을 다시 들려줌".',
    `원인: \`src/replay.mjs:129\`. 고치는 데: 소. ${run('7-3')}`,
    'fix', ''),
  finding('a-murmur-cut', 'S4', '지하 웅성거림이 서서히 줄지 않고 뚝 끊김',
    '끌 때 제 크기의 −7 ~ −31 dB에서 끊김(깨끗이 줄면 약 −59 dB). 절대 크기는 작음(약 −53 dBFS). 스파링에서 소리 끔 · 링으로 바꿀 때만.',
    `원인: 흔들림(LFO)이 줄어드는 음량에 그대로 붙어 있음(\`audio.mjs:679\`). 고치는 데: 소. ${run('7-4')}`,
    'fix', ''),
  finding('a-mute', 'S4', '소리 끔이 이미 예약된 소리를 막지 못함, 게임엔 음소거가 없음',
    '`audio.mute()`를 부르는 페이지가 0. 스파링의 소리 끔을 KO 0.1초 뒤에 누르면 공이 1.1~3.3초에 울리고 관중 함성이 이어짐.',
    `고치는 데: 소. ${run('7-6')}`,
    'fix', ''),
  finding('a-spar-docs', 'S4', '`docs/spar.md`의 숫자가 지금 커밋과 다름',
    '가장 이른 다운 34.1초(문서 36.8), 실신 다운 3판(#34 · #35 · #45, 문서에 없음), 이변 0(문서 2), 45 N·s 아래 13판(문서 15, 최저 9.8 → 지금 **7.6**).',
    `고치는 데: 소(\`node tools/spar.mjs --seeds 1-50\`을 다시 돌려 고침, \`spar-finish\` 카드의 글도). ${run('8-4', '8-3')}`,
    'fix', ''),
  finding('a-dispose-list', 'S4', '파기 목록이 실제 파일과 다름 — 승인 전에 고칠 것',
    '`docs/handoff.md` §7과 파기 카드 가운데 6군데가 틀림: `cleanup-fxlab-now`의 "지금" 열은 이미 없음, 안 쓰는 이펙트 버전은 `fxlab`이 아니라 `src/pending.data.mjs`에, 바닥 고리 영상은 11개가 아니라 12개. 특히 **`del-code-pending-old`를 적힌 대로 지우면 새 미결 카탈로그가 열리지 않음**(`src/open.data.mjs`가 `src/pending.data.mjs`를, `src/open.mjs`가 `src/pending.mjs`를 불러 씀).',
    `고치는 데: 소(글만). ${run('10-2')}`,
    'fix', '파기를 승인하시기 전에 목록부터 바로잡는 것이 안전합니다.'),
  finding('a-since', 'S4', '게시 도구의 `--since`가 페이지 HTML 자체의 변경을 보지 않음',
    'HTML만 고쳐도 "바뀐 것 없음"(`{}`)이 나옵니다(세 페이지 모두). 이번에는 `git diff`로 따로 보아 네 아티팩트가 현행임을 확인했습니다.',
    `원인: \`tools/artifact.mjs:107-111\`. 고치는 데: 소. ${run('10-3')}`,
    'fix', ''),
  finding('a-catalog-text', 'S4', '모션 카탈로그의 설명 글 두 군데가 옛 동작을 말함',
    '멱살 잡고 어퍼: 글은 0.1초(5D 0.05초) 뒤 놓음, 코드는 0.14 / 0.08초 + 버팀 8° · 0.03초 기다림. 첫머리 글: 아직 "이번 판(6차 기획 J · K)". 도발 글은 이미 `fix-taunt-text`.',
    `고치는 데: 소(글만, \`fix-taunt-text\`와 함께 다시 게시). ${run('10-4')}`,
    'fix', ''),
  finding('a-history', 'S4', '게시 이력에 새 미결 카탈로그가 없음',
    '`docs/artifact-history.md`에 미결 카탈로그 (새)의 줄이 없고, 이펙트 시안 v9는 게시 커밋이 없습니다.',
    `고치는 데: 소(문서만). ${run('10-5')}`,
    'fix', '')
];

/* ---- group 1: what the look at each catalogue found (11-26, docs/look-2026-11-26.md): one card a page, several picks; a
   value is the finding's id (A: odd or wrong, S2-S4; p: an improvement, P1-P3) */
const lookCard = (id, title, state, opts, why) => ({ id, group: 'look', title, state, opts, multi: true, star: '', why, more: `고르는 값은 찾은 것의 id입니다. 재현 · 근거: \`node docs/look-2026-11-26/<id>.mjs <pixel-boxer>\`(몇은 \`.cjs\`; 근거가 다른 스크립트에 있는 것은 \`docs/look-2026-11-26.md\`의 표에). 결함(S)은 \`REPRO: yes\`, 개선(P)은 \`EVIDENCE: …\`를 찍습니다. 각 줄의 설명: ${opts.map((o) => `**${o[0]}** ${o[2]}`).join(' · ')}.` });
const LOOK = [
  lookCard('l-sfx', '타격음 오디션: 고칠 것 고르기',
    '결함 7(S3 2 · S4 5), 개선 9(P1 3). 가장 큰 것: 휴대폰 스피커(300 Hz 아래를 깎은 흉내)로 들으면 **쓰러지는 소리가 28.7 dB 줄어 잽의 숨보다 작고**, 몸통 타격도 14.6 dB 줄어듭니다. 페이지의 "크기" 숫자는 36쌍 중 25쌍이 실제 음량과 거꾸로입니다.',
    [['sfx-1', 'S3 · 공 · 함성 · 승패가 고른 선수 쪽으로 쏠림', '±5.9 dB, 게임은 가운데 · 작음'],
     ['sfx-6', 'S3 · "크기" 숫자가 음량과 거꾸로', '25/36쌍 · 작음'],
     ['sfx-2', 'S4 · 세기 슬라이더가 일부 구간에서 그대로', '카운터 95~140 등 · 작음'],
     ['sfx-3', 'S4 · 느리게(¼)에서도 KO 공이 울림', '게임 리플레이엔 없음 · 작음'],
     ['sfx-4', 'S4 · 어퍼컷 카드 글에 "흡"이 빠짐', '글만'],
     ['sfx-7', 'S4 · 헐떡임이 게임보다 두 배 빠름', '0.37 대 0.75초 · 작음'],
     ['sfx-8', 'S4 · 카드에 적힌 타격음 수치가 실제와 다름', 'J40: 적힌 −14.9, 잰 −27.9 dBFS · 글만'],
     ['sfx-p1', 'P1 · 휴대폰 스피커에서도 들리게', '타격 · 쓰러짐에 중음 층 + 페이지에 "휴대폰 스피커로" 토글 · 중'],
     ['sfx-p2', 'P1 · 조작 줄과 음량계를 화면에 붙임', '지금 읽는 칸이 1,743 px 아래 · 작음'],
     ['sfx-p3', 'P1 · 피로 조절기', '실제 숨의 중간값 피로 0.61, 카드는 거의 0 · 작음'],
     ['sfx-p4', 'P2 · 의도와 어긋난 크기 바로잡기', '쳐내기 −8 LU, 숄더롤 +6 LU 등 · 중'],
     ['sfx-p5', 'P2 · A/B 이어 듣기와 반복', '작음'],
     ['sfx-p6', 'P2 · 카드가 없는 게임 소리 7종 추가', '실제 소리의 8.4% · 작음'],
     ['sfx-p7', 'P2 · ¼에서 낮은 쿵이 들리지 않는 대역으로', '40 Hz 아래 77~91% · 작음'],
     ['sfx-p8', 'P3 · 실제 공방 10초 듣기', '중'],
     ['sfx-p9', 'P3 · 토글 단추를 크게', '35 → 44 px · 작음']],
    '고칠 것을 직접 고르세요. 권하는 묶음은 결함 7개 전부(모두 작음) + sfx-p1 · p2 · p3.'),
  lookCard('l-catalog', '모션 카탈로그: 고칠 것 고르기',
    '결함 7(S3 2 · S4 5), 개선 4(P1 3). 가장 큰 것: V의 "바뀜" 15줄은 "맞은 사람이 휘청임"이라고 하는데 **그 카드들에서 아무도 휘청이지 않고**(13줄은 1 cm 미만), 휴대폰에서 첫 카드가 8.4화면 아래 · 열린 줄만 81화면입니다.',
    [['catalog-1', 'S3 · V "바뀜" 15줄의 설명이 카드와 다름', '노트 · 표시 고침, 열린 줄 58 → 약 46 · 작음'],
     ['catalog-2', 'S3 · out-counter: 쓰러지는 도중 ¼ 리플레이가 끼어듦', '리플레이 두 번 · 작음'],
     ['catalog-3', 'S4 · 맺음말의 리플레이 설명이 옛것', '글만'],
     ['catalog-4', 'S4 · 기다리는 메모 10건의 조치 글이 낡음', '글만'],
     ['catalog-5', 'S4 · 요약 "N 4줄"(실제 13줄)', '작음'],
     ['catalog-6', 'S4 · README의 표시 설명이 낡음', '글만'],
     ['catalog-7', 'S4 · 숏 어퍼 메모의 "반영됨"(5L · 5D는 U 바닥 0)', '글 · 상태'],
     ['catalog-p1', 'P1 · 휴대폰: "다음 바뀐 줄" 단추와 떠 있는 속도 단추', '작음~중'],
     ['catalog-p3', 'P1 · 카드마다 슬로 · 한 프레임씩', '물은 순간이 1×에서 83~267 ms · 중'],
     ['catalog-mark', 'P1 · "바뀜" 표시에 보이는 크기의 문턱', '휴대폰 약 17화면 줄어듦 · 작음'],
     ['catalog-p2', 'P2 · 보이는 카드만 계산, 판은 처음 보일 때', '지금 그리는 것의 1.7배를 계산 · 작음~중']],
    '고칠 것을 직접 고르세요. 권하는 묶음은 결함 7개 전부(글 · 작음) + catalog-p1 · p3 · mark.'),
  lookCard('l-spar', '한 라운드 스파링: 고칠 것 고르기',
    '결함 5(S2 1 · S3 2 · S4 2), 개선 3(P1 1). 가장 큰 것: **4D · 5D의 도발이 1프레임 만에 끊겨 화면에 나오지 않는데 기술 하나로 셉니다**(44번 중 43번, 걸음이 끊음). 고정 카메라에서 한 사람이 다른 사람 뒤에 서는 각이 90°까지(문서는 36°).',
    [['spar-1', 'S2 · 4D · 5D의 도발이 1프레임 만에 끊김', '안무가 걷기를 멈추지 않음 · 작음'],
     ['spar-2', 'S3 · 한 사람이 다른 사람 뒤에 섬(90°, 문서 36°)', '발놀림을 더 세게 되돌림(중) — 카메라를 돌리는 쪽은 "고정" 규칙과 어긋나 따로 여쭘'],
     ['spar-3', 'S3 · 같은 시드가 브라우저와 node에서 다른 판(10시드 중 1)', '계획을 함께 쓰게 · 중'],
     ['spar-4', 'S4 · 결과 화면 아래 시계가 계속 감', '작음'],
     ['spar-5', 'S4 · "(크로스 카운터)"가 훅 · 어퍼에도 붙음', '11번 중 8번 · 작음'],
     ['spar-p1', 'P1 · 멈춤 · 한 프레임씩 · 원하는 곳으로 이동', '지금은 처음부터 다시 봐야 함 · 중'],
     ['spar-p2', 'P2 · 휴대폰에서 선수를 크게, 타임라인을 높게', '선수가 화면 높이의 21%(데스크톱 50%) · 작음'],
     ['spar-p3', 'P2 · 판마다 다른 첫 수', '58명 모두 가드로 시작, 39명이 잽 · 작음~중']],
    '고칠 것을 직접 고르세요. 권하는 묶음은 spar-1 · 4 · 5(작음) + spar-p1. spar-2 · 3은 중간 크기라 따로 판단.'),
  lookCard('l-open', '미결 카탈로그 (이 페이지): 고칠 것 고르기',
    '결함 6(S3 4 · S4 2), 개선 7(P1 3). 가장 큰 것: **제출을 댓글로 보내면 ★대로만 골라도 끝의 29개(파기 승인 전부 · 자유 메모)와 안내 줄이 잘립니다**(답은 저장소에 모두 남고 세션은 거기서 읽음). 휴대폰에서 페이지가 약 9만 px이고, 답해도 짧아지지 않습니다.',
    [['open-1', 'S3 · 댓글 제출이 끝의 답과 안내 줄을 자름', '안내 줄은 따로, 줄 단위로 자름 · 작음'],
     ['open-3', 'S3 · ★끼리 어긋남: a-screen-ai(바로) 대 stage-order(Z에서), 순서에 수정 라운드가 없음', '데이터만 · 작음'],
     ['open-4', 'S3 · spar-tempo 영상은 처음 1.6초만 같은 장면, 아래 수치가 요약과 반대', '글(작음) 또는 다시 녹화(중)'],
     ['open-6', 'S3 · del-session이 "이 작업 세션"이라고만 씀', '이전 세션 id를 적음 · 글만'],
     ['open-2', 'S4 · 휴대폰에서 차례로 가면 묶음 제목이 위 막대에 가림', '작음'],
     ['open-5', 'S4 · 파기 카드 둘의 ★ 보류 이유가 이미 정해진 일', '작음'],
     ['open-p1', 'P1 · "안 고른 것만" 보기 · 답한 카드 접기 · 묶음별 다음', '9만 → 2.7만 px · 중'],
     ['open-p2', 'P1 · 위 막대를 한 줄로', '지금 화면의 26% · 작음~중'],
     ['open-p3', 'P1 · 제출 글을 짧게(★대로는 묶어서)', '7.5 → 4.6 KB · 작음'],
     ['open-p4', 'P2 · 비교 영상: 지금과 ★를 나란히, 번갈아 보기', '작음~중'],
     ['open-p5', 'P2 · 영상을 못 틀면 그렇다고 말함(+ MP4)', '작음 / 중'],
     ['open-p6', 'P2 · "모두 ★로"에 되돌리기, 파기 묶음엔 없애기', '작음'],
     ['open-p7', 'P3 · 초록 띠에 값 대신 이름', '작음']],
    '고칠 것을 직접 고르세요. 권하는 묶음은 결함 6개 전부 + open-p1 · p2 · p3.')
];

/* ---- what was decided on this page's own cards (moved out of the groups once answered) */
const DECIDED_NEW = [
  { id: 'audit-10', title: '새 세션의 가벼운 자체 점검 — 버그와 게임성', said: '승인 (10회, 구현 쪽 모델 · high, 읽기만; 재현한 것만 목록으로, 고칠지는 목록을 보고 정함)', at: '2026-11-25', how: 'chat' }
];

/* ---- groups 2-4: the old catalogue's open items (src/pending.data.mjs), tightened: a long state is cut to SHORT here, the
   whole of it kept under 자세히 */
const SHORT = {
  'fx-defence-amount': '지금 막음은 불꽃 4개(흰색 · 파랑), 패리는 불꽃 14개와 화면 흰빛, 피하기 · 숄더 롤 · 커버는 그림이 없습니다. 제안: 방어는 선과 작은 파문(막은 충격량에 비례, 잽의 타격보다 작게). 아래는 같은 녹화를 선택지마다 그린 것.',
  'fx-defence-evade': '빗나간 주먹에는 지금 아무것도 그리지 않습니다. 제안: 6 cm 안으로 스친 주먹에만 지나간 길 위에 회청색 바람 선(1~2픽셀, 0.3초쯤). 아래 샘플: 2.8 cm · 2.3 cm로 빗나간 것에 선, 17.4 · 6.1 cm에는 없음.',
  'fx-brilliant-game': '기막힌 수비(아주 가깝게 피하거나 쳐내고 바로 받아친 것)는 카탈로그에서만 리플레이로 보이고 게임 안에는 표시가 없습니다. 아래: 표시 없음 / 더 선명한 바람 선(42 cm, 0.45초) / 시합의 0.1초를 0.3배로.',
  'fx-ground-shake': '쓰러질 때 바닥 고리: 지금은 처음 닿은 부위(무릎 포함)에서 마루를 한 단계 밝게(빛처럼 읽힘). 시안은 빛 없이 바닥 픽셀을 고리 바깥으로 밀었다 놓고 앞머리에 한 픽셀 어두운 선, 몸통과 머리에서 따로. 게임 화면에서 고리 둘레가 이어져 보이는 몫: 시안 0.65 · 0.75 대 지금 0.32 · 0.51(시드 2 · 4).',
  'jump-watch': '새 점검 “글러브 튐”(던지지 않는 손이 한 프레임에 3.6 m/s 넘게 바뀜): 기존 엔진이 이미 넘습니다 — 지금 664프레임(73 대본군, 최악 15.3 m/s). 시험은 이것을 묶지 않고 재기만 합니다.',
  'twist-chin': '메모 “턱이 더 세게 숙여 돌아가며 공격이 온 방향으로 쓰러진다”에 아직 답하지 못했습니다: 턱 23.1°(기획 24~40). 턱을 당기면 머리가 늦게 닿습니다: 32° → 0.98초, 28° + 밀기 1.2배 → 0.77초(기준 0.85초 안).',
  'low2-block': 'M에서 두 팔 블록의 아래팔을 나란히 내려오게 고친 뒤, 606가지 타이밍 가운데 23가지가 전과 다릅니다: 전에 막히던 어퍼 하나 · 잽 둘이 맞고(56 · 20 N·s), 막히는 어퍼도 15 N·s쯤 더 통과. 바디 훅은 전처럼 팔꿈치에 막힘.',
  'shrug-view': 'U의 으쓱은 두 글러브를 87.3 cm(5암 69.8)까지 벌리는데, 카드의 카메라에서는 가로로 51 cm만 보입니다(앞에서 비스듬히 보면 85 cm).',
  'pull-test': '풀백 카운터 시합 시험을 시드 하나에서 시드 1~10의 합계로 바꿨습니다(풀백 10 · 반격 8 · 맞힘 5번 이상). 지금 16 · 15 · 12번.',
  'inside-rule': '방금 친 것이 인사이드 연타의 강타이고 0.80 m 안이면(상대 가드가 내려가 있을 때) 다음 강타도 인사이드로 잇는 시합 규칙. 3단계 이하는 이 규칙으로 이어지고(세 주먹 193 → 223 N·s), 4 · 5단계는 규칙 없이 긴 주먹이 더 셉니다(5L 274 / 325 N·s).',
  'waist-bound': '기획의 두 요구(가슴이 골반 위에서 도는 속도 1.10배 이하, 인사이드 훅 · 플리커의 허리 450 °/s 이상)가 이 두 주먹에서는 같이 설 수 없어, 이 둘에만 “가슴-허리” 잣대를 썼습니다. 숏 훅의 허리 396 °/s, 3단계 60 · 5D 86 N·s.',
  'fall-unscripted': '대본의 쓰러짐 일곱은 깨끗하지만, 임의의 타격에서 나오는 쓰러짐 1,680개 가운데 1,624개가 무엇인가를 깹니다(발목 꺾임, 무릎 180° 뒤집힘, 26.9 g 튐). 실제 시합의 다운은 임의의 타격에서 나옵니다.',
  'bearing-side': '타이슨 시프트는 지금 0.5칸(22~23°)만 돕니다. 두 걸음이면 4L 72° · 5L 76°(옆 칸 안), 꼭 90°는 세 번째 걸음이 필요하고 바디 훅이 0.10초 늦어집니다.',
  'bearing-pinned': '각을 잡아도 서 있는 3단계 이상의 상대가 0.07~0.17초에 돌아 버려 칸을 지키지 못합니다. 제안: 읽는 지연(0.05~0.30초), 묶인 발은 돌지 못함(스턴, 막은 직후), 가드를 든 채 절반 속도. 새 규칙이라 균형이 움직입니다.',
  'cd-package': '소스 C(1-S-5-2-3-2) · D(연속 백스텝)의 후보 여덟(`docs/source-cd-proposal.md`)을 어떻게 묶을지.',
  'cd-slip-choice': '앞손 쪽으로 슬립한 뒤 지금은 앞손 훅이 나갑니다(3단계 483 ms, 4단계 167, 5단계 117). 든 가드에는 숏 어퍼만 들어갑니다.',
  'combo-lean-side': '“훅 언더”(다 실은 앞손 훅 → 기울여 같은 손 바디 어퍼)의 “훅 방향”을 훅이 가던 쪽으로 읽었고, 그 자세에서 닿는 것은 명치 왼쪽 아래와 왼 갈비입니다(간은 0.67 m로 안 닿음).',
  'combo-tempo': '선수는 지금 시계로 다음 주먹을 누릅니다(잽 뒤 0.2초, 강타 뒤 0.3초). 닿음에 맞추면 3단계 이상이 1~6프레임 빨라집니다. 샘플(원투 훅): 닿음 사이 3단계 233 · 283 ms 대 시계 300 · 333, 5L 183 · 233 대 217 · 367 ms.',
  'combo-loadout': '콤비네이션 하나하나를 기술 한 줄로 싣고(열다섯 줄), 선수가 아는 것은 등급의 기본 지식으로 잡았습니다(1단계 원투, 2단계 셋, 3단계부터 일곱과 훅 언더, 4단계부터 변형).',
  'impl-final-integration': '5차 기획 §5의 마지막 단계: 카탈로그 전 행 점검, 회피 구간 재측정, 승률 점검, README 마무리. (6차 기획의 Z 최종 통합이 이어받습니다: 위 “남은 구현의 순서”.)',
  'liver-hook-power': '4 · 5단계의 리버 훅이 기획보다 25~35% 셉니다. 같은 시드 36경기의 다운 66번 가운데 리버 다운 44번(간에 70 N·s 이상이면 다운).',
  'parrydown-timing': '시합에서 드뭅니다(잽 100개에 4L 2.9번, 5L 3.3번). 가드는 누른 뒤 +3프레임에 오르고 프로의 잽은 +6에 닿습니다.'
};
// (the old catalogue's parts → this page's groups; part 5 then 1 then 2 make the planner's defaults)
const CARRIED = { plan: [5, 1, 2], limits: [3], dispose: [4] };
// (answered in the old page's db, not in its data: cleanup-old-artifacts approve, cleanup-old-session approve, cross-arm-shape upright)
const OLD_DB = { 'cleanup-old-artifacts': 'approve', 'cleanup-old-session': 'approve', 'cross-arm-shape': 'upright' };
const isOpen = (i) => !i.decided && !OLD_DB[i.id];
// (what a carried card of the disposals removes, and a note a carried item now needs)
const ADDED = {
  'cleanup-fx-versions': '이펙트는 정해졌습니다(11-22: 입자는 지금 것, 파문은 A). 지울 것: `src/fxlab.mjs`에서 쓰지 않는 버전 값. “타격 이펙트 시안” 아티팩트는 아래 따로(`del-art-fxlab`).',
  'cleanup-fx-sweat': '지울 것: `src/render/fx.mjs`의 함수 `sweat()` 하나(지우기 전에 부르는 곳을 `grep`).',
  'cleanup-limp-out': '지울 것: 한꺼번에 풀리는 림프 `out`과 그것을 쓰는 시험의 줄(시험을 먼저 바꿈).',
  'cleanup-fxlab-now': '지울 것: `src/fxlab.mjs`의 “지금” 비교 열.'
};
function carried(item, group) {
  const long = item.state.length > 180 || !!SHORT[item.id];
  return {
    id: item.id,
    group,
    title: asLD(item.title),
    state: asLD(SHORT[item.id] || item.state) + (ADDED[item.id] ? ` ${ADDED[item.id]}` : ''),
    more: long || item.tables || item.notes || item.refs
      ? { state: long ? asLD(item.state) : '', tables: (item.tables || []).map((t) => ({ head: t.head.map(asLD), rows: t.rows.map((r) => r.map(asLD)) })), notes: (item.notes || []).map(asLD), refs: item.refs || [] }
      : null,
    old: !!(item.groups || item.card || item.banner),
    opts: item.options.map((o) => [o.id, asLD(o.name), asLD(o.says || '')]),
    star: item.recommend || '',
    why: item.why ? asLD(item.why) : ''
  };
}
const CARRY = Object.entries(CARRIED).flatMap(([group, parts]) => parts.flatMap((p) => ITEMS.filter((i) => i.part === p && isOpen(i)).map((i) => carried(i, group))));

/* ---- group 3: new known limits (README, docs/pending.md 11-24 · 11-25), merged under the rule of 11-24 (“알려진 한계를
   받아들이고 빨리 합침”): asked again here */
const LIMITS = [
  {
    id: 'limit-y-elbow',
    group: 'limits',
    title: '크로스 카운터: 닿을 때 뒷팔꿈치 1.28~1.30 m (기획 1.50)',
    state: '4D를 위로 세우면 1.39 m까지 가지만 위팔이 어깨가 둘 수 없는 곳으로 갑니다(675판 가운데 515). 11-24의 규칙(알려진 한계를 받아들이고 합침)으로 합쳤습니다.',
    opts: ACCEPT,
    star: 'accept',
    why: '더 올리면 위팔과 아래팔이 제 팔을 지납니다.'
  },
  {
    id: 'limit-y-jab',
    group: 'limits',
    title: '크로스 카운터가 지는 판에서 잽이 더 세게 들어옴',
    state: '쓸기 12,320판 가운데 28판에서 잽이 기준의 보통 스트레이트 때보다 1.5~20.5 N·s 세게 들어옵니다(그 가운데 6판은 선 사람에게보다도 1.2~8.2 N·s 셈).',
    opts: ACCEPT,
    star: 'accept',
    why: '1만 판 가운데 28판이고 차이가 작습니다.'
  },
  {
    id: 'limit-y-arm',
    group: 'limits',
    title: '크로스 카운터: 아래팔이 잽 글러브에 든 한 경우',
    state: '4D, +4프레임, 0.92 m에서 아래팔이 잽 선수의 글러브에 10.5 cm(한도 8).',
    opts: ACCEPT,
    star: 'accept',
    why: '격자 2,363판 가운데 한 경우입니다.'
  },
  {
    id: 'limit-u-45',
    group: 'limits',
    title: 'U: 시드 45, 4D 풍차의 글러브가 한 프레임 상대 안 3.7 cm',
    state: '5D의 크로스 바디로 두 머리가 네 프레임에 0.80 → 0.53 m로 좁혀질 때(“0.66 m 아래” 종류). 시드 1~48의 도발 379번 가운데 하나, U를 고치기 전과 같음.',
    opts: ACCEPT,
    star: 'accept',
    why: '상대가 몸을 밀고 들어온 경우이고, 도발 중 튐은 0이 되었습니다.'
  },
  {
    id: 'fix-taunt-text',
    group: 'limits',
    title: '모션 카탈로그의 도발 설명 글이 옛 동작을 말함',
    state: '엔진 한계가 아니라 글 고침입니다. 손짓 “두 번 까딱”, 풍차 “뒷팔 … 한 바퀴” 등이 U를 합치기 전의 동작을 말합니다.',
    opts: [['fix', '고침', '모션 카탈로그와 함께 다시 게시'], ['leave', '둠', '']],
    star: 'fix',
    why: '보이는 동작과 글이 달라 헷갈립니다.'
  }
];

/* ---- group 4: disposals (each names exactly what goes) */
const DISPOSE = [
  {
    id: 'del-session',
    group: 'dispose',
    title: '이 세션 — 인계가 확인된 뒤 보관 처리',
    state: '지울 것: 이 작업 세션(대화) 하나를 보관(archive) 처리. 저장소 · 브랜치 · 아티팩트는 그대로입니다. 새 세션이 `docs/handoff.md`로 이어받은 것이 확인된 뒤에만.',
    opts: APPROVE,
    star: 'hold'
  },
  {
    id: 'del-art-pending-old',
    group: 'dispose',
    title: '옛 미결 카탈로그 아티팩트',
    state: '지울 것: 아티팩트 하나와 그 db(`decisions/<항목>` 문서들). 이 페이지가 대신합니다. 그 결정은 아래 “정해진 것”과 `src/pending.data.mjs`에 남아 있습니다. 파일(`pending.html` 등)은 아래 따로.',
    links: [{ href: 'https://claude.ai/artifact/UEM19aKseUxnixVYkrnAzd', say: '옛 미결 카탈로그' }],
    opts: APPROVE,
    star: 'hold'
  },
  {
    id: 'del-art-fxlab',
    group: 'dispose',
    title: '타격 이펙트 시안 아티팩트',
    state: '지울 것: 아티팩트 하나(“전” · “확정” 두 열, 장면 여섯). 이펙트는 정해졌습니다. 파일 `fxlab.html` · `src/fxlab.mjs`는 그대로(아래 `cleanup-fxlab-now`가 그 안의 열).',
    links: [{ href: 'https://claude.ai/artifact/5tZd5Xyp7iiRxCuftpNwL6', say: '타격 이펙트 시안' }],
    opts: APPROVE,
    star: 'hold'
  },
  {
    id: 'del-code-pending-old',
    group: 'dispose',
    title: '옛 미결 카탈로그의 파일',
    state: '지울 것: `pending.html`, `src/pending.mjs` · `src/pending.data.mjs` · `src/pending.numbers.mjs`, `tools/pending.mjs`, `tests/pending.test.mjs`, `docs/pending-catalog.md`, 답이 난 항목만의 클립(`src/clips/`의 그 파일과 `src/clips.data.mjs`의 줄). **이 페이지가 옛 카드를 `src/pending.mjs`로 돌리는 동안은 둡니다**: 승인하시면 그 카드들을 새 녹화로 옮긴 뒤에 지웁니다.',
    opts: APPROVE,
    star: 'hold'
  },
  {
    id: 'del-ref-video',
    group: 'dispose',
    title: '바닥 고리 비교 영상 (`docs/ref/ground-shake-*`)',
    state: '지울 것: `docs/ref/ground-shake-back-bare` · `back-light` · `back-shake` · `front-light` · `front-shake`의 `.webm` · `.jpg`와 `game-light` · `game-shake`의 `.jpg`(12개). **`fx-ground-shake`(기획의 기본값)가 정해진 뒤에만**: 그 카드가 이 영상을 씁니다.',
    opts: APPROVE,
    star: 'hold'
  }
];

const FREE = [
  { id: 'free', group: 'free', title: '그 밖에 하실 말씀', state: '위 카드에 없는 것 — 화면 · 조작 · 소리 · 링 · 이 페이지 무엇이든. 번호 목록으로 쓰시면 한 줄씩 지시로 읽습니다.', opts: [] }
];

const order = (g) => [...AUDIT, ...LOOK, ...NEW, ...CARRY, ...LIMITS, ...DISPOSE, ...FREE].filter((c) => c.group === g);
export const CARDS = GROUPS.flatMap((g) => order(g.id));

// every question, follow-ups with their parent and the answers that open them
export const QUESTIONS = [];
for (const c of CARDS) {
  if (c.kind === 'note') continue;
  QUESTIONS.push({ id: c.id, card: c.id, parent: null, when: null, title: c.title, opts: c.opts || [], star: c.star || '', multi: !!c.multi, memo: c.memo !== false });
  for (const [when, fs] of Object.entries(c.follow || {}))
    for (const f of fs) QUESTIONS.push({ id: f.id, card: c.id, parent: c.id, when: when.split(','), title: f.title, opts: f.opts || [], star: f.star || '', multi: !!f.multi, memo: f.memo !== false || !(f.opts || []).length });
}
const BY = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
export const question = (id) => BY[id];

// what was decided before this page: the old data's decided and the three answered in the old page's db
export const DECIDED_LIST = [...DECIDED_NEW, ...ITEMS.filter((i) => !isOpen(i)).map((i) => {
  const d = i.decided || { choice: OLD_DB[i.id], at: '2026-11-25', how: 'db' },
    o = i.options.find((x) => x.id === d.choice);
  return { id: i.id, title: asLD(i.title).replace(/`/g, ''), said: `${o ? asLD(o.name).replace(/`/g, '') : d.choice}${d.note ? ` (${d.note})` : ''}`, at: d.at, how: d.how };
})];

/* ---- the answers */
const values = (v) => (v ? String(v).split(',').filter(Boolean) : []);
// a question is live: a top question always; a follow-up while its parent is live and answered with a value that opens it
export function live(id, picks) {
  const q = BY[id];
  if (!q) return false;
  if (!q.parent) return true;
  return live(q.parent, picks) && values(picks[q.parent]).some((v) => q.when.includes(v));
}
const label = (q, v) => values(v).map((x) => { const o = q.opts.find((p) => p[0] === x); return o ? `${x} (${o[1].replace(/`/g, '')})` : x; }).join(', ');
// how many top questions are answered (picked), of how many can be; and how many memos. Never counts a ★ not picked.
export function counts(picks = {}, notes = {}) {
  const top = QUESTIONS.filter((q) => !q.parent && q.opts.length);
  return { picked: top.filter((q) => picks[q.id]).length, of: top.length, memos: QUESTIONS.filter((q) => live(q.id, picks) && notes[q.id]).length, follow: QUESTIONS.filter((q) => q.parent && live(q.id, picks) && picks[q.id]).length };
}
/* The deliberate gesture “이 묶음의 남은 것을 모두 ★로”: every question of a group still unanswered and live, that has a ★,
   picked as its ★ (a follow-up it opens picked too if it has one); returns the new picks, the old ones left as they were. */
export function starRest(group, picks = {}) {
  const out = Object.assign({}, picks);
  for (let changed = true; changed; ) {
    changed = false;
    for (const q of QUESTIONS) {
      const c = CARDS.find((x) => x.id === q.card);
      if (c.group !== group || out[q.id] || !q.star || !live(q.id, out)) continue;
      out[q.id] = q.star;
      changed = true;
    }
  }
  return out;
}
/* The answers as text: what 제출 sends and 답 복사 copies. Every live question with a pick or a memo, by group, a follow-up
   under its question; a memo on a follow-up that is no longer open is dropped (the db keeps it). */
export function answersText(picks = {}, notes = {}, head = '') {
  const lines = head ? [head] : [];
  for (const g of GROUPS) {
    const qs = QUESTIONS.filter((q) => CARDS.find((c) => c.id === q.card).group === g.id && live(q.id, picks) && (picks[q.id] || notes[q.id]));
    if (!qs.length) continue;
    lines.push(`## ${g.title}`);
    for (const q of qs) {
      const memo = notes[q.id] ? `${picks[q.id] ? ' · ' : ''}메모: ${String(notes[q.id]).replace(/\s*\n\s*/g, ' / ')}` : '';
      lines.push(`${q.parent ? '  - ' : '- '}${q.id}: ${picks[q.id] ? label(q, picks[q.id]) : ''}${memo}`);
    }
  }
  return lines.length > (head ? 1 : 0) ? lines.join('\n') : '';
}
