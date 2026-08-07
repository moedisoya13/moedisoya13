/**
 * dist/index.html → Artifact용 페이지 조각으로 변환.
 *
 *   node tools/build-artifact.mjs [출력경로]
 *
 * Artifact는 파일을 <!doctype html><head>…</head><body> 스켈레톤 안에 감싸서
 * 게시하므로, 문서 전체가 아니라 "본문에 들어갈 내용"만 넘겨야 한다.
 * 그래서 빌드 결과에서 <title>·<style>·<body> 마크업·인라인 모듈 스크립트를
 * 뽑아 순서대로 다시 붙인다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'dist/index.html');
const out = process.argv[2] || resolve(root, 'dist/artifact.html');

const html = await readFile(src, 'utf8');

/** 여는 태그는 속성이 붙을 수 있으므로(예: <style rel=… crossorigin>) 이름으로 찾는다. */
function slice(name) {
  const open = new RegExp(`<${name}(\\s[^>]*)?>`, 'i');
  const m = open.exec(html);
  const close = `</${name}>`;
  const j = m ? html.indexOf(close, m.index) : -1;
  if (!m || j < 0) throw new Error(`${name} 블록을 찾지 못했습니다`);
  return html.slice(m.index, j + close.length);
}

const title = slice('title');
const style = slice('style');
const script = slice('script');

const bodyStart = html.indexOf('<body>');
const bodyEnd = html.indexOf('</body>');
if (bodyStart < 0 || bodyEnd < 0) throw new Error('body 블록을 찾지 못했습니다');
const markup = html.slice(bodyStart + '<body>'.length, bodyEnd).trim();

/**
 * Artifact는 iframe 안에서 렌더된다. 캔버스와 오버레이가 전부 position:fixed라
 * 본문 높이와 무관하게 동작하지만, 호스트가 iframe 높이를 콘텐츠에 맞추는 경우를
 * 대비해 뷰포트 높이를 명시해 둔다.
 */
const shim = `
    <style>
      /* Artifact iframe 안에서도 전체 화면을 차지하도록 */
      html, body { height: 100%; min-height: 100dvh; margin: 0; padding: 0; }
      body { background: #05070b; overflow: hidden; }
    </style>`;

// 번들 스크립트는 head에 있지만 type="module"이라 defer 동작이다.
// 마크업 뒤로 옮겨 둬도 동작이 같고, 조각 형태에서는 이쪽이 안전하다.
const page = `${title}
    ${style}${shim}

${markup}

    ${script}
`;

await writeFile(out, page, 'utf8');
console.log(`✓ ${out}  (${(page.length / 1024).toFixed(0)} KB)`);
