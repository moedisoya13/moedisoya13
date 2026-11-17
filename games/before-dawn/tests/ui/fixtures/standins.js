// UI tests and screenshots only (never shipped): stand-ins for the GDD §5 cards and §6 enemies
// that other branches implement. Each is registered only when its id is missing, so after the
// merge the real content is used. They carry the GDD names, families, effect text and a HUD
// shape, but no rules beyond what the display needs; enemies just walk toward the hero.
// Injected into a copy of dist/before-dawn.html by tests/ui/_harness.js.

const card = (d) => { if (!BD.cards.has(d.id)) BD.cards.register(Object.assign({ unlock: 'base', hud() { return {}; } }, d)); };
const LOCKED = () => false;

card({ id: 'pierce', name: '관통', family: 'shape', icon: 'arrow', desc: '베기마다 조준선을 따라 길이 4.2u·폭 0.9u 찌르기를 더한다.' });
card({ id: 'whirl', name: '회전베기', family: 'shape', desc: '베기마다 반경 = 칼 길이의 원 전체를 더한다. 부채꼴 밖은 배율 0.7.' });
card({ id: 'sword_wave', name: '검기', family: 'shape', unlock: LOCKED, desc: '조준 사거리 6.5u(시야선 필요). 베기마다 초승달 검기 발사: 속도 13u/s, 사거리 6.5u, 폭 1.0u, 배율 0.6, 첫 적에 맞고 사라짐. 같은 베기의 칼에 맞은 적은 검기에 다시 맞지 않는다.' });
card({ id: 'flame', name: '화염', family: 'element', element: 'flame', desc: '맞은 적 점화: 0.5초마다 3 피해, 3초(합 18). 불타는 적은 가장자리 0.6u 안의 적에게 불을 옮긴다.' });
card({ id: 'lightning', name: '뇌전', family: 'element', element: 'lightning', desc: '표적에서 3.0u 안의 아직 안 맞은 적으로 최대 3번 연쇄. 연쇄 피해는 베기 피해의 60%. 젖은 적이 있으면 100%, 최대 5번.' });
card({ id: 'tide', name: '해류', family: 'element', element: 'tide', unlock: LOCKED, desc: '맞은 적을 용사 반대쪽으로 1.2u 밀고 4초간 젖음. 밀린 적이 벽·장애물에 부딪히면 8 피해와 0.5초 기절.' });
card({ id: 'leech', name: '흡수', family: 'trigger', desc: '처치 4회마다 HP +5. 수호자·정예 처치는 즉시 HP +10.', hud(st) { return { pips: (st.kills || 0) % 4 }; } });
card({ id: 'riposte', name: '반격', family: 'trigger', desc: '피격 0.15초 뒤 반경 2.6u 원형 반격(베기 피해 ×2). 돌진으로 공격을 흘리면 즉시 ×3 반격 + 돌진 대기 초기화. 반격 재사용 2.0초.', hud(st) { return { ring: st.cd ? 1 - st.cd / 2 : 1 }; } });
card({ id: 'drawcut', name: '발도', family: 'trigger', unlock: LOCKED, desc: '마지막 베기 뒤 베지 않고 3.0u 이상 움직이면 준비 완료. 다음 베기 한 번이 피해 ×2.5, 칼 길이 +0.6u.', hud(st) { return { ring: Math.min(1, (st.moved || 0) / 3) }; } });
card({ id: 'holy_light', name: '성광', family: 'target', targetType: 'undead', desc: '언데드에게 피해 +8. 구울이 다시 일어나지 않는다.' });
card({ id: 'armor_break', name: '갑옷 파쇄', family: 'target', targetType: 'heavy', desc: '중갑의 정면 방어를 무시. 중갑을 맞힐 때마다 균열 +1(최대 5): 받는 피해 +15%씩.' });
card({ id: 'mana_backlash', name: '마력 역류', family: 'target', targetType: 'magic', unlock: LOCKED, desc: '마법 유형에게 피해 +5. 맞은 마도사는 2.5초간 순간이동 불가. 마법 유형을 처치하면 반경 2.5u의 다른 적에게 25 피해.' });
card({ id: 'rest_of_dead', name: '망자의 안식', family: 'quest', goal: 12, desc: '언데드에게 피해 +4. 언데드 12 처치로 각성: 모든 적 +3, 언데드 +10, 언데드 처치 시 반경 1.8u 폭발 20, 구울 부활 없음.' });
card({ id: 'kings_hunt', name: '왕의 사냥', family: 'quest', goal: 3, desc: '수호자·정예·마왕에게 피해 +3. 층 수호자 3 처치로 각성: 그 대상에게 피해 ×1.6, 수호자 처치 시 HP 전부 회복.' });
card({ id: 'fire_pilgrimage', name: '불의 순례', family: 'quest', goal: 12, unlock: LOCKED, desc: '베기 4번째마다 맞은 적 점화. 불타는 적 12 처치로 각성: 모든 베기가 점화, 불타는 적이 죽으면 반경 1.5u 폭발 12.', hud(st) { return { pips: (st.swings || 0) % 4 }; } });
card({ id: 'chain_slash', name: '연참', family: 'combo', maxStack: 5, desc: '적을 처치할 때마다 스택 +1(최대 5). 스택마다 베기 피해 +2. 4초 동안 직접 타격을 못 하면 끊긴다.', hud(st) { return { text: '×' + st.stack, ring: (st.timer || 0) / 4 }; } });
card({ id: 'flawless', name: '무결', family: 'combo', maxStack: 6, desc: '피격 없이 처치할 때마다 스택 +1(최대 6). 2: 베기 간격 −15% · 4: 칼 길이 +0.4u · 6: 잔영. 피격하면 끊긴다.' });
card({ id: 'one_flash', name: '일섬', family: 'combo', maxStack: 8, unlock: LOCKED, desc: '표적이 칼끝 구간에 있을 때 베면 스택 +1(최대 8). 스택마다 피해 +1 · 4: 관통 추가 · 8: 관통 확대. 품 안의 적을 베면 흐트러진다.' });

const walker = (o) => {
  if (BD.enemies.has(o.id)) return;
  BD.enemies.register(Object.assign({
    cost: 1.5, attacks: { strike: { name: '공격' } },
    create() {}, update(e, w, dt) { BD.ai.chase(w, e, e.speed, dt, 1.6); },
  }, o));
};
walker({ id: 'skel_archer', name: '해골 궁수', type: 'undead', sprite: 'skeleton_archer', hp: 25, speed: 2.6, dmg: 9, radius: 0.35, attacks: { shot: { name: '사격' } } });
walker({ id: 'ghoul', name: '구울', type: 'undead', sprite: 'ghoul', hp: 60, speed: 2.4, dmg: 14, radius: 0.45, attacks: { lunge: { name: '달려들기' } }, guardian: { name: '구울 폭군' } });
walker({ id: 'mage', name: '마도사', type: 'magic', sprite: 'mage', hp: 40, speed: 2.0, dmg: 12, radius: 0.35, attacks: { fire_circle: { name: '불 원' } }, guardian: { name: '대마도사' } });
walker({ id: 'dark_knight', name: '암흑기사', type: 'heavy', sprite: 'dark_knight', hp: 120, speed: 2.0, dmg: 20, radius: 0.55, attacks: { charge: { name: '돌격' } }, guardian: { name: '암흑기사 단장' } });

// ---- v2 stand-ins (GDD-V2 §4.5, §5.4–5.5): the boons, tasks and sites other branches add, so the
// HUD, the minimap, the markers and the screens can be looked at and tested with them. Registered
// only when missing. Tasks count kills like 소탕 (so a stand-in floor can still be finished); sites
// finish at once. They carry the GDD names and nothing else of the rules.
const boon = (d) => { if (!BD.boons.has(d.id)) BD.boons.register(Object.assign({ max: 3, stats() {} }, d)); };
boon({ id: 'long', name: '긴 칼', text: (r) => '칼 길이 +' + (0.25 * r).toFixed(2) + 'u', stats(s, r) { s.reach += 0.25 * r; } });
boon({ id: 'wide', name: '넓은 품', text: (r) => '부채꼴 각 +' + 20 * r + '°', stats(s, r) { s.halfArc += (10 * r * Math.PI) / 180; } });
boon({ id: 'body', name: '굳은 몸', text: (r) => '최대 HP +' + 15 * r, onGain(w) { w.hero.maxHp += 15; w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + 15); } });
boon({ id: 'step', name: '가벼운 발', text: (r) => '돌진 대기 −' + (0.4 * r).toFixed(1) + '초' });
const task = (d) => { if (!BD.tasks.has(d.id)) BD.tasks.register(Object.assign({ layout: 'plaza', on: { kill(ev, w) { if (!ev.guardian && !ev.boss && w.stats.kills % d.per === 0) BD.taskRt.progress(w, 1); } } }, d)); };
task({ id: 'seals', name: '봉인', per: 40, goal: () => 3, label: (t) => '봉인 ' + t.value + '/' + t.goal });
task({ id: 'nests', name: '둥지', per: 40, goal: () => 3, label: (t) => '둥지 ' + t.value + '/' + t.goal });
task({ id: 'hold', name: '수성', per: 3, goal: () => 40, label: (t) => '수성 ' + t.value + '/' + t.goal + '초' });
task({ id: 'hunt', name: '사냥', per: 40, goal: () => 3, label: (t) => '사냥 ' + t.value + '/' + t.goal });
const site = (d) => { if (!BD.sites.has(d.id)) BD.sites.register(Object.assign({ stay: 0.8, use() { return true; } }, d)); };
site({ id: 'seal', name: '봉인석', stay: 5, total: true, ring: 2.2 });
site({ id: 'nest', name: '둥지', stay: 0.5 });
site({ id: 'brazier', name: '화로', stay: 40, total: true, ring: 3.5 });
site({ id: 'altar', name: '제단', stay: 0.8, optional: true, known: true });
site({ id: 'spring', name: '샘', stay: 1.2, optional: true });
site({ id: 'chest', name: '상자', stay: 0.8, optional: true });
site({ id: 'rift', name: '시련의 균열', stay: 1.5, optional: true });

// Put a floor's worth of places on the current v2 floor (tests and screenshots): three task places
// at the zone centres (0, 2), (2, 0), (1, 1) and four places to visit; o.task restarts the floor's
// task as that kind.
BD.uiTest = {
  stageSites(w, o) {
    o = o || {};
    const kind = o.taskSite || 'seal';
    const mk = (k, x, y, optional) => ({ id: BD.W.id(w), kind: k, x, y, state: 'idle', known: k === 'altar', optional, progress: 0, need: BD.sites.get(k).stay });
    w.sites = [mk(kind, 8, 40, false), mk(kind, 40, 8, false), mk(kind, 24, 24, false), mk('altar', 8, 24, true), mk('spring', 24, 8, true), mk('chest', 40, 24, true), mk('rift', 24, 40, true)];
    if (o.task) { w.floor.task = o.task; BD.taskRt.start(w); }
    return w.sites;
  },
};
