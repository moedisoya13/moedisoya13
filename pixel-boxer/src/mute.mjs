/* The one mute button of every page that makes sound (a-mute, 2026-11-28): the game (index.html, and its knockdown replay),
   the sparring (spar.html, and its replay) and the sound audition (sfx.html). The same round 44 px button on each (a
   speaker; crossed out while muted), in a corner where it covers nothing that matters; pressed, it calls audio.mute (game/
   audio.mjs: everything off at once, what was already scheduled too).
   What it is set to is kept for the other pages and the next visit (localStorage KEY: '1' muted, '0' not). With no storage
   (a private window, blocked site data) it still works on the page, and is simply not remembered. Another tab of the same
   site that changes it is followed (the storage event).
     storedMute(fallback)                   what was last chosen on any of the pages, or fallback if nothing was (or storage
                                            is not to be had)
     muteButton(audio, { place, fallback, into, onChange })
                                            -> { el, get muted, set(on) }. place: the page's CSS for where it sits (position
                                            and z-index); fallback: muted or not when nothing was chosen yet (the sparring
                                            starts silent, as it always has); into: the element it goes in (the body);
                                            onChange(muted) after each change, for a page that gates its own sound too. A
                                            press does not reach the page under it (the game starts on any press). */
export const KEY = 'pixel-boxer.muted';

const INK = '#090a11',
  PAPER = '#f6f3ea';
const SPEAKER = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>',
  WAVES = '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  CROSS = '<path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';

export function storedMute(fallback = false) {
  try {
    const v = localStorage.getItem(KEY);
    return v === '1' ? true : v === '0' ? false : fallback;
  } catch {
    return fallback;
  }
}
function keep(on) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // (a page that may not keep anything: the button still works here)
  }
}

export function muteButton(audio, o = {}) {
  const b = document.createElement('button');
  let muted = storedMute(!!o.fallback);
  b.type = 'button';
  b.id = 'mute';
  b.className = 'mute';
  b.setAttribute('aria-label', '음소거');
  b.style.cssText =
    `position:absolute;width:44px;height:44px;padding:0;margin:0;border-radius:50%;display:grid;place-items:center;cursor:pointer;` +
    `color:${PAPER};background:rgba(9,10,17,.55);border:2px solid rgba(246,243,234,.55);touch-action:manipulation;-webkit-tap-highlight-color:transparent;` +
    (o.place || 'right:16px;top:16px;');
  function draw() {
    b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">${SPEAKER}${muted ? CROSS : WAVES}</svg>`;
    b.setAttribute('aria-pressed', String(muted));
    b.title = muted ? '소리 켜기' : '소리 끄기';
    b.style.background = muted ? 'rgba(246,243,234,.88)' : 'rgba(9,10,17,.55)';
    b.style.color = muted ? INK : PAPER;
  }
  function set(on, kept = true) {
    muted = !!on;
    audio.mute(muted);
    if (!muted && audio.unlock) audio.unlock();
    if (kept) keep(muted);
    draw();
    if (o.onChange) o.onChange(muted);
  }
  // (the press is the button's alone: the game under it begins on any press, the sparring skips a replay)
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) b.addEventListener(type, e => e.stopPropagation(), { passive: true });
  b.addEventListener('keydown', e => e.stopPropagation());
  b.addEventListener('click', e => (e.stopPropagation(), set(!muted)));
  addEventListener('storage', e => e.key === KEY && (e.newValue === '1') !== muted && (e.newValue === '1' || e.newValue === '0') && set(e.newValue === '1', false));
  audio.mute(muted);
  draw();
  (o.into || document.body).append(b);
  return {
    el: b,
    get muted() {
      return muted;
    },
    set
  };
}
