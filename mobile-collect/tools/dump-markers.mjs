#!/usr/bin/env node
/**
 * pc-side/markers.json 생성기.
 *
 * PC측 확인 3(차단 마커 동기화)을 하려면 Python 쪽에서 extract.js의 마커 목록을 읽어야 한다.
 * 그렇다고 check_pc_side.py가 extract.js를 정규식으로 다시 파싱하면 **규칙이 두 벌**이 된다 —
 * pc-side/NOTES.md 확인 1 ⓑ가 직접 경고한 실수다.
 * 그래서 마커를 기계가 읽는 형식으로 한 번만 뽑아 두고, Python은 그 파일만 읽는다.
 *
 * 생성물이 원본과 어긋나는 것은 tools/build-snippet.mjs와 같은 방식으로 막는다:
 * `--check` + tests/extract.test.mjs의 고정 테스트.
 *
 * 사용법:
 *   node mobile-collect/tools/dump-markers.mjs          # 생성/갱신
 *   node mobile-collect/tools/dump-markers.mjs --check  # 최신인지 확인만 (CI·테스트용)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLOCK_MARKERS_HARD,
  BLOCK_MARKERS_SOFT,
  MIN_CHARS,
  SHORT_PAGE_CHARS,
} from '../extract.js';

const here = dirname(fileURLToPath(import.meta.url));
export const MARKERS_PATH = join(here, '..', 'pc-side', 'markers.json');

/**
 * extract.js의 상수를 pc-side가 읽을 JSON 문자열로 만든다.
 *
 * JSON에는 주석을 못 쓰므로 경고를 `_generated` 필드로 넣는다.
 *
 * @returns {string} 끝에 개행 1개가 붙은 JSON 텍스트
 */
export function buildMarkers() {
  const payload = {
    _generated:
      '자동 생성 파일 — 직접 고치지 말 것. ' +
      '원본: mobile-collect/extract.js · 재생성: node mobile-collect/tools/dump-markers.mjs',
    hard: BLOCK_MARKERS_HARD,
    soft: BLOCK_MARKERS_SOFT,
    softThresholdChars: SHORT_PAGE_CHARS,
    minChars: MIN_CHARS,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function main() {
  const markers = buildMarkers();
  const check = process.argv.includes('--check');

  let current = null;
  try {
    current = readFileSync(MARKERS_PATH, 'utf8');
  } catch {
    current = null;
  }

  if (check) {
    if (current !== markers) {
      console.error(
        'markers.json이 extract.js와 어긋났습니다. ' +
          '`node mobile-collect/tools/dump-markers.mjs`로 다시 생성하세요.'
      );
      process.exit(1);
    }
    console.log('markers.json 최신 상태 확인됨.');
    return;
  }

  if (current === markers) {
    console.log('변경 없음:', MARKERS_PATH);
    return;
  }
  writeFileSync(MARKERS_PATH, markers, 'utf8');
  console.log('생성됨:', MARKERS_PATH);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
