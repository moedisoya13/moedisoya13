// 패시브 아이템 정의. 효과는 player.computeStats 에서 합산한다.

export const PASSIVES = {
  might: { name: '근력', icon: 'i_might', max: 5, desc: () => '공격력 +10%' },
  shoes: { name: '쿵푸화', icon: 'i_shoes', max: 5, desc: () => '이동속도 +8%' },
  breath: { name: '숨고르기', icon: 'i_breath', max: 5, desc: () => '쿨타임 -6%' },
  qi: { name: '기공', icon: 'i_qi', max: 5, desc: () => '공격 범위 +10%' },
  vitality: { name: '체력 단련', icon: 'i_heart', max: 5, desc: () => '최대 HP +20' },
  recovery: { name: '보양식', icon: 'i_recovery', max: 5, desc: () => '초당 HP +0.25 회복' },
  magnet: { name: '자석', icon: 'i_magnet', max: 5, desc: () => '만두·코인 흡수 범위 +30%' },
  greed: { name: '탐욕', icon: 'i_coin', max: 5, desc: () => '코인 획득 +15%' },
  clone: { name: '분신술', icon: 'i_clone', max: 2, desc: () => '투사체·연타 수 +1' },
};

export const PASSIVE_IDS = Object.keys(PASSIVES);
