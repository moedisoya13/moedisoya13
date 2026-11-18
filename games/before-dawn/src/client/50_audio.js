// WebAudio base. The AudioContext is created on the first user input (GDD §10). Sounds are
// registered by the UI agent in BD.ui.sfx; BD.client.sfx(id, opts) plays one, skipping
// repeats of the same id within 50 ms. Playing an unregistered id throws.
// unlock() also resumes a suspended context: iOS Safari creates it suspended and only lets a
// touchend/click start it, so the input layer calls unlock() on those too; every sound resumes
// a context the system suspended meanwhile.

const AU = BD.client.audio = { ac: null, master: null, last: {}, muted: false };

AU.resume = function () {
  if (AU.ac && AU.ac.state === 'suspended' && AU.ac.resume) { try { AU.ac.resume(); } catch (err) { /* ignore */ } }
};

AU.unlock = function () {
  if (AU.ac) { AU.resume(); return; }
  if (AU.muted) return;
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
  AU.resume();
  def.play(AU.ac, AU.master, opts || {});
};
