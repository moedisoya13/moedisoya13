/**
 * 자막 오버레이.
 *
 * 페이드는 CSS 트랜지션이 아니라 story.js가 계산한 alpha를 직접 반영한다.
 * 그래야 타임라인을 스크럽했을 때 자막이 뒤늦게 따라오지 않는다.
 */
export function createSubtitles(root) {
  const nodes = new Map();
  let enabled = true;

  function ensure(key, text, cls) {
    let el = nodes.get(key);
    if (!el) {
      el = document.createElement('div');
      el.className = `sub ${cls}`.trim();
      el.style.transition = 'none';
      el.textContent = text;
      root.appendChild(el);
      nodes.set(key, el);
    } else if (el.textContent !== text) {
      el.textContent = text;
    }
    return el;
  }

  return {
    /** @param {{key:string,text:string,cls:string,alpha:number}[]} lines */
    render(lines) {
      const seen = new Set();
      for (const line of lines) {
        seen.add(line.key);
        const el = ensure(line.key, line.text, line.cls);
        el.style.opacity = String(line.alpha);
        el.style.transform = `translateY(${(1 - line.alpha) * 10}px)`;
      }
      for (const [key, el] of nodes) {
        if (!seen.has(key)) {
          el.remove();
          nodes.delete(key);
        }
      }
    },

    setEnabled(v) {
      enabled = v;
      root.classList.toggle('is-hidden', !v);
    },
    isEnabled: () => enabled,

    clear() {
      nodes.forEach((el) => el.remove());
      nodes.clear();
    },
  };
}
