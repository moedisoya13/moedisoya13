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
export const DIAGNOSE_PATH = join(here, '..', 'shortcut', 'diagnose-body.js');

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

const DIAGNOSE_HEADER = `// ⚠ 자동 생성 파일 — 직접 고치지 말 것.
//   원본: mobile-collect/extract.js
//   재생성: node mobile-collect/tools/build-snippet.mjs
//
// B-1(첫 실기기 확인) 전용 **임시** 스니펫이다. 수집 경로에는 쓰지 않는다.
// 하는 일은 run-javascript-body.js와 같고, 결과를 JSON 대신 폰에서 읽을 수 있는
// 요약으로 돌려준다. 확인이 끝나면 액션의 내용을 run-javascript-body.js로 되돌린다.
`;

// 진단 래퍼. 수집용 TAIL과 추출 로직은 같고 출력 모양만 다르다.
// 수천 자짜리 JSON을 아이폰에서 눈으로 훑는 것은 사실상 불가능해서,
// 증거 체크리스트(BUILD.md §4)에 그대로 옮겨 적을 수 있는 형태로 줄인다.
const DIAGNOSE_TAIL = `
// ── 진단 래퍼 (B-1 전용) ─────────────────────────────────────
(function () {
  function count(haystack, needle) {
    return haystack.split(needle).length - 1;
  }
  function excerpt(haystack, needle) {
    var at = haystack.indexOf(needle);
    if (at < 0) return '(없음)';
    var from = at - 60 < 0 ? 0 : at - 60;
    return haystack.slice(from, at + 140).replace(/\\n/g, ' ⏎ ');
  }
  try {
    var body = document.body ? document.body.innerText : '';
    var cap = buildCapture({ innerText: body, url: location.href });
    var out = [];
    out.push('status    = ' + cap.status);
    out.push('chars     = ' + cap.chars);
    out.push('productId = ' + cap.productId);
    out.push('host      = ' + cap.host);
    if (cap.reason) out.push('reason    = ' + cap.reason);

    if (cap.status !== 'ok') {
      out.push('');
      out.push('※ status가 ok가 아니라 본문 확인을 건너뜁니다.');
      out.push('  blocked면 재시도하지 마세요. empty면 잠깐 뒤 다시 탭하세요.');
      completion(out.join('\\n'));
      return;
    }

    var text = cap.text;
    out.push('');
    out.push('── 문구 확인 (체크리스트 4~6번) ──');
    var probes = ['옵션', '원', '판매자'];
    for (var i = 0; i < probes.length; i++) {
      var n = count(text, probes[i]);
      out.push('"' + probes[i] + '" : ' + (n > 0 ? '있음 (' + n + '회)' : '없음'));
    }

    out.push('');
    out.push('── "판매자" 주변 (parse.py 구간 마커 후보) ──');
    out.push(excerpt(text, '판매자'));

    out.push('');
    out.push('── "옵션" 주변 ──');
    out.push(excerpt(text, '옵션'));

    out.push('');
    out.push('── 본문 첫 300자 ──');
    out.push(text.slice(0, 300).replace(/\\n/g, ' ⏎ '));

    completion(out.join('\\n'));
  } catch (err) {
    completion('error = ' + String((err && err.message) || err));
  }
})();
`;

/**
 * ESM 소스를 단축어에 붙여넣을 수 있는 평문 스크립트로 바꾼다.
 *
 * @param {string} source extract.js 원문
 * @param {{header?: string, tail?: string}} [wrapper] 기본은 수집용 래퍼
 * @returns {string}
 */
export function buildSnippet(source, wrapper = {}) {
  const header = wrapper.header ?? HEADER;
  const tail = wrapper.tail ?? TAIL;
  const stripped = source.replace(/^export /gm, '');
  return `${header}\n${stripped.trim()}\n${tail}`;
}

/**
 * B-1 확인용 진단 스니펫을 만든다. 추출 코어는 수집용과 같은 것을 쓴다.
 *
 * @param {string} source extract.js 원문
 * @returns {string}
 */
export function buildDiagnose(source) {
  return buildSnippet(source, { header: DIAGNOSE_HEADER, tail: DIAGNOSE_TAIL });
}

function main() {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const check = process.argv.includes('--check');

  // 수집용과 진단용 두 벌 모두 extract.js 하나에서 나온다.
  const outputs = [
    { path: OUTPUT_PATH, content: buildSnippet(source), label: '스니펫' },
    { path: DIAGNOSE_PATH, content: buildDiagnose(source), label: '진단 스니펫' },
  ];

  let stale = false;
  for (const { path, content, label } of outputs) {
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = null;
    }

    if (check) {
      if (current !== content) {
        console.error(
          `${label}이 extract.js와 어긋났습니다. ` +
            '`node mobile-collect/tools/build-snippet.mjs`로 다시 생성하세요.'
        );
        stale = true;
      }
      continue;
    }

    if (current === content) {
      console.log('변경 없음:', path);
      continue;
    }
    writeFileSync(path, content, 'utf8');
    console.log('생성됨:', path);
  }

  if (check) {
    if (stale) process.exit(1);
    console.log('스니펫 최신 상태 확인됨.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
