/* When the picture's graphics context is lost (a phone takes the GPU's memory back from a page left in the background, or
   runs short of it): the canvas would stay blank white for good while the bout goes on unseen. Instead a notice covers it,
   with a button that loads the page again (the user's answer to a-gl-lost, 2026-11-28: the reload button only, no rebuilding
   of the picture). The loss is not asked to be undone (no preventDefault): the page does not draw again by itself.
     watchLost(canvas, { note })   once, for the game and the sparring page; note: a line under the title (what reloading
                                   gives back), if the page has one -> { get lost() } */
const INK = '#090a11',
  PAPER = '#f6f3ea',
  GOLD = '#ffc24a';

export function watchLost(canvas, o = {}) {
  let lost = false;
  canvas.addEventListener('webglcontextlost', () => {
    if (lost) return;
    lost = true;
    const box = document.createElement('div'),
      h = document.createElement('p'),
      p = document.createElement('p'),
      b = document.createElement('button');
    box.id = 'lost';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-labelledby', 'losttitle');
    box.style.cssText = `position:fixed;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;background:${INK};color:${PAPER};text-align:center;font:inherit;`;
    h.id = 'losttitle';
    h.textContent = '그림이 멈췄습니다';
    h.style.cssText = 'margin:0;font-size:18px;letter-spacing:.06em;';
    p.textContent = '기기가 그래픽 메모리를 거둬 갔습니다(백그라운드 · 메모리 부족). ' + (o.note || '다시 불러오면 처음부터 엽니다.');
    p.style.cssText = 'margin:0;max-width:34ch;font-size:13px;line-height:1.5;color:#d9d6cc;';
    b.type = 'button';
    b.textContent = '다시 불러오기';
    b.style.cssText = `font:inherit;font-size:14px;color:${GOLD};background:transparent;border:2px solid ${GOLD};padding:9px 16px;min-height:44px;cursor:pointer;`;
    b.addEventListener('click', () => location.reload());
    box.append(h, p, b);
    document.body.append(box);
    try {
      b.focus();
    } catch {
      // (nothing to focus)
    }
  });
  return {
    get lost() {
      return lost;
    }
  };
}
