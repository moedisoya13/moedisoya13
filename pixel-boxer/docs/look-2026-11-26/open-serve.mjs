// a tiny static server for repros: serve(root) -> { url, close }
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.woff2': 'font/woff2', '.bin': 'application/octet-stream' };
export function serve(root) {
  return new Promise((res) => {
    const s = http.createServer(async (req, rsp) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = path.join(root, p.endsWith('/') ? p + 'index.html' : p);
      if (!f.startsWith(root)) return rsp.writeHead(403).end();
      try {
        const b = await readFile(f);
        const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
        const type = TYPES[path.extname(f)] || 'application/octet-stream';
        if (range) {
          const a = range[1] ? +range[1] : 0, z = range[2] ? +range[2] : b.length - 1;
          rsp.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${z}/${b.length}`, 'accept-ranges': 'bytes', 'content-length': z - a + 1 });
          return rsp.end(b.subarray(a, z + 1));
        }
        rsp.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': b.length }).end(b);
      } catch { rsp.writeHead(404).end(); }
    });
    s.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${s.address().port}`, close: () => s.close() }));
  });
}
