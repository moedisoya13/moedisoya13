// 연참 (combo) — GDD §5.5. Reference card for stacks, timers, event listeners and the HUD.
// +1 per kill (any source), max 5; +2 slash damage per stack (flat, stage ③).
// Reset only by `timeout`: 4.0 s without a direct hit. Kills and direct hits refill the timer;
// the timer stands still while no spawned enemy is in the room (tick.enemiesAlive == 0).
const LIMIT = 4.0;

BD.cards.register({
  id: 'chain_slash', name: '연참', family: 'combo', unlock: 'base', maxStack: 5, icon: 'chain',
  desc: '적을 처치할 때마다 스택 +1(최대 5). 스택마다 베기 피해 +2. 4초 동안 직접 타격을 못 하면 끊긴다.',
  init(ctx) { ctx.state.timer = LIMIT; },
  flat(ctx) { return 2 * ctx.state.stack; },
  on: {
    kill(ev, ctx) { ctx.setStack(ctx.state.stack + 1, 'gain'); ctx.state.timer = LIMIT; },
    hit(ev, ctx) { if (ev.direct) ctx.state.timer = LIMIT; },
    tick(ev, ctx) {
      if (ev.enemiesAlive <= 0) return;
      ctx.state.timer = Math.max(0, ctx.state.timer - ev.dt);
      if (ctx.state.timer <= 0 && ctx.state.stack > 0) {
        ctx.setStack(0, 'timeout');
        ctx.toast('연참 끊김: 4초 동안 베지 못했다');
      }
    },
  },
  hud(state) { return { text: '×' + state.stack, ring: state.timer / LIMIT }; },
});
