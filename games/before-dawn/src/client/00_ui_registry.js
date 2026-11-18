// Browser-only registries for the presentation layer (owned by the UI agent's src/ui/).
//
//   BD.ui.screens.register({id: mode, draw(g, ui), pointer?(ev, ui) → bool, key?(ev, ui) → bool})
//       one per app mode: title | prep | codex | play | result ('play' draws on top of the world)
//   BD.ui.overlays.register({id, draw, pointer?, key?})   rotate | pause | help | settings | altar
//   BD.ui.hud.register({id, order, draw(g, ui)})            drawn in mode 'play' under overlays
//   BD.ui.effects.register({id, on?: {event(ev, ui)}, update?(dt, ui), draw?(g, ui, layer)})
//       layer: 'floor' (under actors) | 'world' (over actors) | 'screen' (over HUD)
//   BD.ui.sfx.register({id, play(ac, dest, opts)})          WebAudio synth; BD.client.sfx(id) plays
//
// Unknown ids throw (screens for a mode that is entered, sfx ids that are played).

BD.ui = {
  screens: BD.makeRegistry('screen'),
  overlays: BD.makeRegistry('overlay'),
  hud: BD.makeRegistry('hud layer', { required: ['draw'] }),
  effects: BD.makeRegistry('effect'),
  sfx: BD.makeRegistry('sfx', { required: ['play'] }),
};

BD.ui.FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Noto Sans CJK KR",system-ui,sans-serif';
BD.ui.INK = '#0a0a0c';
BD.ui.ORANGE = '#ff9a3c';
BD.ui.font = (px, weight) => (weight || 700) + ' ' + px + 'px ' + BD.ui.FONT;
