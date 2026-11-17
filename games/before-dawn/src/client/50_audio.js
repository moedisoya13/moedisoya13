// WebAudio base. The AudioContext is created on the first user input (GDD §10). Sounds are
// registered by the UI agent in BD.ui.sfx; BD.client.sfx(id, opts) plays one, skipping
// repeats of the same id within 50 ms. Playing an unregistered id throws.

const AU = BD.client.audio = { ac: null, master: null, last: {}, muted: false };

AU.unlock = function () {
  if (AU.ac || AU.muted) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    AU.ac = new Ctx();
    AU.master = AU.ac.createGain();
    AU.master.connect(AU.ac.destination);
  } catch (err) { AU.ac = null; }
};

AU.setVolume = function (v) { if (AU.master) AU.master.gain.value = v; };

BD.client.sfx = function (id, opts) {
  const def = BD.ui.sfx.get(id);
  if (AU.muted || !AU.ac) return;
  const t = AU.ac.currentTime;
  if (AU.last[id] !== undefined && t - AU.last[id] < 0.05) return;
  AU.last[id] = t;
  def.play(AU.ac, AU.master, opts || {});
};
