/* What the open-questions catalogue holds (open.html, src/open.mjs; docs/open-catalog.md): every decision still open, as
   cards in five groups, and how an answer is read and sent. Nothing here knows the page: node reads it too
   (tests/open.test.mjs).
     GROUPS     the five groups, in order: { id, title, note }
     CARDS      the cards, in order. A card is one question (its id is the answer's key) or a note (kind: 'note', no question):
                { id, group, title, state (what it is now; `code` and **strong** marks), more (the long text, folded), list
                (lines), links ([{ href, say }]), clips (a group of src/open.clips.mjs: the builds side by side), old (true: the
                item's own cards from the old catalogue, src/pending.data.mjs, played by src/pending.mjs), opts ([[value, label,
                what it means]]), star (the value recommended; '' for none), why (the reason), memo (false: no memo), multi
                (true: several values), follow ({ 'value[,value]': [question] }: opened on the same card by that answer; a
                question { id, title, note, opts, star, multi, memo }) }. Carried items keep the old ids and option ids.
     QUESTIONS  every question, follow-ups with their parent: { id, card, parent, when, opts, star, multi, memo, title }
     DECIDED_LIST  what was decided before this page (the old catalogue's DECIDED and its db), shown at the bottom
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
  page: ''
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
    state: '50판의 다운 주먹 50개 가운데 **15개가 45 N·s 아래**(최저 9.8)입니다.',
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
    id: 'audit-10',
    group: 'now',
    title: '새 세션의 가벼운 자체 점검 — 버그와 게임성',
    state: '에이전트 10회(구현 쪽 모델, 노력 high), 한 번에 하나의 눈으로 보고 결과는 목록으로만(고치기 전에 여쭘).',
    list: ['균형(등급별 승률)', '다운 · KO 흐름', '휴대폰 조작과 화면', '옷 · 가림 · 그리기', '링 · 로프 · 지하 가장자리', '소리 연결', '스파링의 빈 시간', '물리 점검 회귀', '성능', '페이지 · 게시 동기화'],
    opts: [['ok', '승인', '열 가지 눈으로 10회'], ['five', '5회로', '중요한 다섯만'], ['no', '안 함', '']],
    star: 'ok',
    why: '인계 직후 한 번 넓게 보는 것이 남은 단계의 순서를 정하는 데 씁니다.',
    follow: { 'ok,five': [{ id: 'audit-10.where', title: '어디를 더 볼까요?', note: '메모로 적어 주세요.', opts: [] }] }
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

const order = (g) => [...NEW, ...CARRY, ...LIMITS, ...DISPOSE, ...FREE].filter((c) => c.group === g);
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
export const DECIDED_LIST = ITEMS.filter((i) => !isOpen(i)).map((i) => {
  const d = i.decided || { choice: OLD_DB[i.id], at: '2026-11-25', how: 'db' },
    o = i.options.find((x) => x.id === d.choice);
  return { id: i.id, title: asLD(i.title).replace(/`/g, ''), said: `${o ? asLD(o.name).replace(/`/g, '') : d.choice}${d.note ? ` (${d.note})` : ''}`, at: d.at, how: d.how };
});

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
