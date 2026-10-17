/* 서버 API. 내보낸 단독 HTML 에서는 window.CSM_DATA 가 있고 서버가 없다 (isStatic). */
(function (CSM) {
  const isStatic = !!window.CSM_DATA;

  // 1회성 토큰: 앱 창을 연 URL 의 ?t= 로 받아 sessionStorage 에 옮기고 주소창에서 지운다.
  let token = "";
  if (!isStatic) {
    try {
      const u = new URL(location.href);
      const t = u.searchParams.get("t");
      if (t) { sessionStorage.setItem("csm:token", t); u.searchParams.delete("t"); history.replaceState(null, "", u.pathname + u.search); }
      token = sessionStorage.getItem("csm:token") || "";
    } catch { token = ""; }
  }

  async function call(method, path, body) {
    const headers = { "X-CSM-Token": token };
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  CSM.api = {
    isStatic,
    state: () => call("GET", "/api/state"),
    scan: () => call("POST", "/api/scan", {}),
    geocode: (force = false) => call("POST", "/api/geocode", { force }),
    config: (patch) => call("POST", "/api/config", patch),
    override: (id, lat, lng) => call("POST", "/api/override", { id, lat, lng }),
    clearOverride: (id) => call("POST", "/api/override", { id, clear: true }),
    exportFile: (format) => call("POST", "/api/export", { format }),
    quit: () => call("POST", "/api/quit", {}),
    hasToken: () => !!token,
    ping: () => fetch("/api/ping", { headers: { "X-CSM-Token": token } }).then((r) => r.json()).catch(() => null),
    boundaries: async () => {
      if (window.CSM_BOUNDARIES) return window.CSM_BOUNDARIES;
      const r = await fetch("data/boundaries.json");
      return r.json();
    },
    /** SSE 구독. handlers: {progress, done, error} */
    events(handlers) {
      if (isStatic || !window.EventSource) return () => {};
      const es = new EventSource("/api/events?t=" + encodeURIComponent(token));
      for (const [name, fn] of Object.entries(handlers)) {
        es.addEventListener(name, (e) => { try { fn(JSON.parse(e.data)); } catch (err) { console.error(err); } });
      }
      es.onerror = () => { /* 서버가 내려가면 브라우저가 재시도한다 */ };
      return () => es.close();
    },
  };
})(window.CSM);
