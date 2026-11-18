// Event bus. Every event name must be declared with its payload fields; emitting an
// undeclared name or a payload missing a declared field throws.
// GDD §5.2 events are declared here. Engine extras (presentation hooks) are declared
// below them. Content may declare its own with BD.events.declare(name, fields).
// emit() stamps the event name on the payload as `ev.event` (reserved key); `type` stays
// the payload's own field (the enemy type in hit/kill, GDD §5.2).

BD.events = {
  decl: Object.create(null),
  declare(name, fields, opts) {
    if (BD.events.decl[name]) BD.fail(`event '${name}' declared twice`);
    if (fields && fields.includes('event')) BD.fail(`event '${name}': 'event' is reserved for the event name`);
    BD.events.decl[name] = { fields: fields || [], extra: !!(opts && opts.extra) };
  },
  names() { return Object.keys(BD.events.decl).sort(); },
};

const GDD_EVENTS = {
  run_start: ['seed', 'tier', 'hand'],
  floor_enter: ['floor', 'domType', 'nextDomType'],
  wave_start: ['floor', 'wave', 'count'],
  tick: ['dt', 'moved', 'enemiesAlive'],
  swing: ['aim', 'primaryId', 'primaryDist', 'reach', 'charged'],
  hit: ['enemyId', 'kind', 'type', 'dmg', 'source', 'direct', 'primary', 'dist', 'x', 'y'],
  swing_end: ['hitCount', 'primaryId', 'primaryDist', 'reach'],
  kill: ['enemyId', 'kind', 'type', 'elite', 'guardian', 'boss', 'burning', 'wet', 'source', 'x', 'y'],
  down: ['enemyId'],
  status: ['enemyId', 'status', 'on'],
  hurt: ['dmg', 'source', 'attack', 'hpAfter'],
  drain: ['dmg', 'hpAfter'],
  dodge: ['attack', 'enemyId'],
  dash: ['fromX', 'fromY', 'toX', 'toY'],
  heal: ['amount', 'source', 'hpAfter'],
  guardian_kill: ['floor', 'kind'],
  altar_open: ['floor'],
  altar_pray: ['floor'],
  card_swap: ['slot', 'outId', 'inId'],
  trial_start: ['floor'],
  trial_clear: ['floor'],
  quest_progress: ['cardId', 'value', 'goal'],
  quest_awaken: ['cardId'],
  combo_change: ['cardId', 'from', 'to', 'reason'],
  floor_exit: ['floor', 't'],
  dawn: ['t'],
  death: ['cause', 'floor', 't'],
  win: ['t'],
  // GDD-V2 §4.7
  level_up: ['level'],
  choice_open: ['kind', 'options'],          // options: the pick strings, e.g. ['card:pierce', 'boon:edge', 'breath']
  choice_pick: ['kind', 'pick'],
  card_level: ['cardId', 'level'],
  boon: ['id', 'rank'],
  task_progress: ['floor', 'task', 'value', 'goal'],
  task_clear: ['floor', 'task'],
  site_start: ['kind', 'id', 'optional'],
  site_clear: ['kind', 'id', 'optional'],
  surge: ['floor', 'n'],
  floor_clear: ['floor'],
};
for (const k of Object.keys(GDD_EVENTS)) BD.events.declare(k, GDD_EVENTS[k]);

// Engine extras: not in GDD §5.2, emitted for presentation and tools. Listeners in
// cards must not depend on them for rules (they may change); UI may.
const EXTRA_EVENTS = {
  strike: ['source', 'shapes', 'x', 'y', 'aim', 'elements'], // drawn trails of a swing/echo/riposte
  telegraph: ['id', 'shape', 'ownerId', 'ownerKind', 'attack', 'time', 'style'], // a telegraph started (style: its drawer id)
  telegraph_fire: ['id', 'attack', 'ownerId', 'ownerKind'],
  projectile: ['id', 'kind', 'hostile', 'x', 'y'],
  spawn: ['enemyId', 'kind', 'x', 'y', 'via'],                  // via: 'placed' | 'rift' | 'door' | 'summon'
  rift: ['x', 'y', 'time', 'guardian'],                          // a rift warning started
  pickup: ['kind', 'x', 'y', 'value'],                         // kind: shard | flask | … (GDD-V2 §4.7)
  shard_drop: ['x', 'y', 'value'],                              // a shard popped out of a kill (v2)
  dissolve: ['enemyId', 'kind', 'x', 'y'],                      // removed without a kill (floor clear, v2)
  wake: ['enemyId'],                                            // a dormant enemy (the guardian) starts moving (v2)
  revive: ['enemyId'],
  stairs_open: ['floor'],
  guard: ['enemyId', 'x', 'y'],                                 // front guard reduced a direct hit
  slam: ['enemyId', 'x', 'y'],
  steam: ['x', 'y'],
  toast: ['text'],
  banner: ['text', 'kind'],                                     // kind: floor|guardian|awaken|stairs|boss|trial|trial_clear|info
  altar_close: ['floor', 'choice'],
  boss_phase: ['phase'],
  vfx: ['kind'],                                               // free-form visual from content: drawn by BD.render.vfx[kind]
};
for (const k of Object.keys(EXTRA_EVENTS)) BD.events.declare(k, EXTRA_EVENTS[k], { extra: true });

BD.Bus = function () {
  const listeners = Object.create(null);
  const LOG_MAX = 4000;
  const log = new Array(LOG_MAX);
  let count = 0;
  const counts = Object.create(null);
  const bus = {
    on(name, fn, owner) {
      if (!BD.events.decl[name]) BD.fail(`bus.on: undeclared event '${name}'`);
      (listeners[name] || (listeners[name] = [])).push({ fn, owner });
      return fn;
    },
    off(name, fn) {
      const l = listeners[name];
      if (l) { const i = l.findIndex((x) => x.fn === fn); if (i >= 0) l.splice(i, 1); }
    },
    offOwner(owner) {
      for (const k in listeners) listeners[k] = listeners[k].filter((x) => x.owner !== owner);
    },
    emit(name, payload) {
      const d = BD.events.decl[name];
      if (!d) BD.fail(`bus.emit: undeclared event '${name}'`);
      payload = payload || {};
      for (const f of d.fields) if (payload[f] === undefined) BD.fail(`event '${name}' missing field '${f}'`);
      payload.event = name;   // the event name; never 'type', which hit/kill carry as the enemy type (GDD §5.2)
      if (name !== 'tick') {
        log[count % LOG_MAX] = payload;
        count++;
        counts[name] = (counts[name] || 0) + 1;
      }
      const l = listeners[name];
      if (l) for (let i = 0; i < l.length; i++) l[i].fn(payload);
      return payload;
    },
    recent(n) {
      n = Math.min(n || 20, count, LOG_MAX);
      const out = [];
      for (let i = count - n; i < count; i++) out.push(log[i % LOG_MAX]);
      return out;
    },
    count() { return count; },
    counts() { return Object.assign({}, counts); },
  };
  return bus;
};
