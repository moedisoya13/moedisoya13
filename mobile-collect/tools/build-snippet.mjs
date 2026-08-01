#!/usr/bin/env node
/**
 * shortcut/run-javascript-body.js 생성기.
 *
 * 단축어의 "웹페이지에서 JavaScript 실행" 액션에는 파일을 import할 방법이 없어
 * 코드를 통째로 붙여넣어야 한다. 손으로 두 벌을 관리하면 반드시 어긋나므로
 * extract.js 하나만 고치고 이 스크립트로 스니펫을 다시 만든다.
 *
 * 사용법:
 *   node mobile-collect/tools/build-snippet.mjs          # 생성/갱신
 *   node mobile-collect/tools/build-snippet.mjs --check  # 최신인지 확인만 (CI·테스트용)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCE_PATH = join(here, '..', 'extract.js');
export const OUTPUT_PATH = join(here, '..', 'shortcut', 'run-javascript-body.js');

const HEADER = `// ⚠ 자동 생성 파일 — 직접 고치지 말 것.
//   원본: mobile-collect/extract.js
//   재생성: node mobile-collect/tools/build-snippet.mjs
//
// 이 파일 전체를 단축어의 "웹페이지에서 JavaScript 실행" 액션에 붙여넣는다.
`;

const TAIL = `
// ── 브라우저 래퍼 ─────────────────────────────────────────────
// 사람이 공유 시트에서 단축어를 탭했을 때만 실행된다.
// completion()은 단축어 액션이 넣어 주는 전역이다.
(function () {
  try {
    var body = document.body ? document.body.innerText : '';
    completion(JSON.stringify(buildCapture({ innerText: body, url: location.href })));
  } catch (err) {
    completion(JSON.stringify({
      status: 'error',
      text: '',
      chars: 0,
      productId: null,
      reason: String((err && err.message) || err),
    }));
  }
})();
`;

/**
 * ESM 소스를 단축어에 붙여넣을 수 있는 평문 스크립트로 바꾼다.
 *
 * @param {string} source extract.js 원문
 * @returns {string}
 */
export function buildSnippet(source) {
  const stripped = source.replace(/^export /gm, '');
  return `${HEADER}\n${stripped.trim()}\n${TAIL}`;
}

function main() {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const snippet = buildSnippet(source);
  const check = process.argv.includes('--check');

  let current = null;
  try {
    current = readFileSync(OUTPUT_PATH, 'utf8');
  } catch {
    current = null;
  }

  if (check) {
    if (current !== snippet) {
      console.error(
        '스니펫이 extract.js와 어긋났습니다. ' +
          '`node mobile-collect/tools/build-snippet.mjs`로 다시 생성하세요.'
      );
      process.exit(1);
    }
    console.log('스니펫 최신 상태 확인됨.');
    return;
  }

  if (current === snippet) {
    console.log('변경 없음:', OUTPUT_PATH);
    return;
  }
  writeFileSync(OUTPUT_PATH, snippet, 'utf8');
  console.log('생성됨:', OUTPUT_PATH);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
