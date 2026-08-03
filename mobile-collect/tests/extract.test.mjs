/**
 * mobile-collect 추출 코어 테스트 — 의존성 0, `node --test`로 실행.
 *
 * 이 테스트가 보증하는 것은 변환 로직뿐이다. 실제 쿠팡 모바일 페이지와의
 * 적중 여부는 보증하지 않는다 (tests/fixtures/README.md 참고).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLOCK_MARKERS_HARD,
  BLOCK_MARKERS_SOFT,
  MIN_CHARS,
  SHORT_PAGE_CHARS,
  buildCapture,
  buildFileName,
  detectBlock,
  normalizeText,
  parseProductUrl,
} from '../extract.js';
import { OUTPUT_PATH, SOURCE_PATH, buildSnippet } from '../tools/build-snippet.mjs';
import { MARKERS_PATH, buildMarkers } from '../tools/dump-markers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');

const PRODUCT = fixture('product_normal.txt');
const BLOCKED = fixture('blocked_akamai.txt');
const LOADING = fixture('loading.txt');

const MOBILE_URL =
  'https://m.coupang.com/vm/products/8868816986?itemId=25987141234&vendorItemId=93012345678&src=1042503&spec=10305199';
const DESKTOP_URL = 'https://www.coupang.com/vp/products/8868816986?itemId=25987141234&q=%EA%B7%B8%EB%A6%AD';

// ── normalizeText ────────────────────────────────────────────

test('normalizeText: CRLF를 LF로 바꾼다', () => {
  assert.equal(normalizeText('가\r\n나\r다'), '가\n나\n다\n');
});

test('normalizeText: NBSP와 zero-width를 보통 공백으로 바꾼다', () => {
  assert.equal(normalizeText('12,900 원​'), '12,900 원\n');
});

test('normalizeText: 행 앞뒤 공백을 턴다', () => {
  assert.equal(normalizeText('   가   \n\t나\t'), '가\n나\n');
});

test('normalizeText: 빈 줄 3개 이상은 2개로 줄인다', () => {
  assert.equal(normalizeText('가\n\n\n\n\n나'), '가\n\n나\n');
});

test('normalizeText: 문자열이 아니면 빈 문자열', () => {
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
  assert.equal(normalizeText(42), '');
});

test('normalizeText: 공백뿐이면 빈 문자열 (개행을 붙이지 않는다)', () => {
  assert.equal(normalizeText('   \n\n  '), '');
});

// ── detectBlock ──────────────────────────────────────────────

test('detectBlock: HARD 마커는 페이지 길이와 무관하게 차단', () => {
  for (const marker of BLOCK_MARKERS_HARD) {
    const long = marker + '\n' + 'ㄱ'.repeat(SHORT_PAGE_CHARS * 2);
    const result = detectBlock(long);
    assert.equal(result.blocked, true, `HARD 마커 미감지: ${marker}`);
    assert.equal(result.marker, marker);
  }
});

test('detectBlock: SOFT 마커는 짧은 페이지에서만 차단', () => {
  for (const marker of BLOCK_MARKERS_SOFT) {
    const short = marker + '\n짧은 페이지';
    assert.equal(detectBlock(short).blocked, true, `짧은 페이지에서 미감지: ${marker}`);

    const long = marker + '\n' + 'ㄱ'.repeat(SHORT_PAGE_CHARS);
    assert.equal(detectBlock(long).blocked, false, `긴 페이지에서 오탐: ${marker}`);
  }
});

test('detectBlock: 정상 상품 페이지는 통과', () => {
  assert.equal(detectBlock(normalizeText(PRODUCT)).blocked, false);
});

test('detectBlock: 합성 Akamai 차단 페이지를 잡는다', () => {
  assert.equal(detectBlock(normalizeText(BLOCKED)).blocked, true);
});

// ── parseProductUrl ──────────────────────────────────────────

test('parseProductUrl: 모바일 URL에서 식별자를 뽑는다', () => {
  assert.deepEqual(parseProductUrl(MOBILE_URL), {
    productId: '8868816986',
    itemId: '25987141234',
    vendorItemId: '93012345678',
    host: 'm.coupang.com',
  });
});

test('parseProductUrl: 데스크톱 URL도 같은 product_id를 준다', () => {
  const parsed = parseProductUrl(DESKTOP_URL);
  assert.equal(parsed.productId, '8868816986');
  assert.equal(parsed.itemId, '25987141234');
  assert.equal(parsed.vendorItemId, null);
  assert.equal(parsed.host, 'www.coupang.com');
});

test('parseProductUrl: 상품 페이지가 아니면 product_id는 null', () => {
  const parsed = parseProductUrl('https://m.coupang.com/nm/search?q=%EA%B7%B8%EB%A6%AD');
  assert.equal(parsed.productId, null);
  assert.equal(parsed.host, 'm.coupang.com');
});

test('parseProductUrl: 빈 입력에도 터지지 않는다', () => {
  for (const bad of [null, undefined, '', 123]) {
    assert.deepEqual(parseProductUrl(bad), {
      productId: null,
      itemId: null,
      vendorItemId: null,
      host: null,
    });
  }
});

// ── buildCapture ─────────────────────────────────────────────

test('buildCapture: 정상 페이지는 status ok와 정규화된 텍스트를 준다', () => {
  const out = buildCapture({ innerText: PRODUCT, url: MOBILE_URL });
  assert.equal(out.status, 'ok');
  assert.equal(out.productId, '8868816986');
  assert.equal(out.itemId, '25987141234');
  assert.ok(out.text.includes('옵션 선택'));
  assert.equal(out.text, normalizeText(PRODUCT));
  assert.equal(out.chars, out.text.trimEnd().length, 'chars는 끝 개행을 뺀 본문 길이');
});

test('buildCapture: 차단이면 텍스트를 넘기지 않는다 (저장 금지)', () => {
  const out = buildCapture({ innerText: BLOCKED, url: MOBILE_URL });
  assert.equal(out.status, 'blocked');
  assert.equal(out.text, '');
  assert.equal(out.reason, 'Access Denied');
});

test('buildCapture: 렌더가 덜 끝났으면 empty', () => {
  const out = buildCapture({ innerText: LOADING, url: MOBILE_URL });
  assert.equal(out.status, 'empty');
  assert.equal(out.text, '');
  assert.match(out.reason, /최소 500자/);
});

test('buildCapture: MIN_CHARS 경계값', () => {
  const url = MOBILE_URL;
  const justUnder = 'ㄱ'.repeat(MIN_CHARS - 1);
  const exact = 'ㄱ'.repeat(MIN_CHARS);
  assert.equal(buildCapture({ innerText: justUnder, url }).status, 'empty');
  assert.equal(buildCapture({ innerText: exact, url }).status, 'ok');
});

test('buildCapture: 인자가 없어도 터지지 않는다', () => {
  const out = buildCapture();
  assert.equal(out.status, 'empty');
  assert.equal(out.text, '');
  assert.equal(out.productId, null);
});

test('buildCapture: 차단 판정이 empty 판정보다 우선한다', () => {
  const out = buildCapture({ innerText: 'Access Denied', url: MOBILE_URL });
  assert.equal(out.status, 'blocked');
});

test('buildCapture: 결과는 JSON으로 왕복 가능하다 (단축어가 사전으로 받는다)', () => {
  const out = buildCapture({ innerText: PRODUCT, url: MOBILE_URL });
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
});

// ── buildFileName ────────────────────────────────────────────

test('buildFileName: source별 접미사 규칙', () => {
  const productId = '8868816986';
  assert.equal(buildFileName({ productId, kind: 'options' }), '8868816986.txt');
  assert.equal(buildFileName({ productId, kind: 'sellers' }), '8868816986_sellers.txt');
  assert.equal(buildFileName({ productId, kind: 'search' }), '8868816986_search.txt');
});

test('buildFileName: product_id가 없으면 fallback을 쓴다', () => {
  assert.equal(buildFileName({ productId: null, kind: 'options', fallback: '그릭마일드' }), '그릭마일드.txt');
  assert.equal(buildFileName({ productId: null, kind: 'search' }), 'unknown_search.txt');
  assert.equal(buildFileName(), 'unknown.txt');
});

// ── 드리프트 감지 ─────────────────────────────────────────────

test('차단 마커 목록 고정 — parse.py를 고쳤다면 여기도 같이 고칠 것', () => {
  assert.deepEqual(BLOCK_MARKERS_HARD, [
    'Access Denied',
    'Request Rejected',
    "You don't have permission to access",
  ]);
  assert.deepEqual(BLOCK_MARKERS_SOFT, [
    'Reference #',
    '접근이 거부',
    '잘못된 접근',
    '비정상적인 접근',
    '일시적으로 이용이 제한',
  ]);
});

test('단축어 스니펫이 extract.js와 일치한다', () => {
  const expected = buildSnippet(readFileSync(SOURCE_PATH, 'utf8'));
  const actual = readFileSync(OUTPUT_PATH, 'utf8');
  assert.equal(
    actual,
    expected,
    '스니펫이 낡았습니다. `node mobile-collect/tools/build-snippet.mjs`로 다시 생성하세요.'
  );
});

test('스니펫에는 export 문이 남아 있지 않다 (단축어에서 문법 오류)', () => {
  const snippet = readFileSync(OUTPUT_PATH, 'utf8');
  assert.equal(/^export /m.test(snippet), false);
  assert.equal(/^import /m.test(snippet), false);
  assert.ok(snippet.includes('completion(JSON.stringify('));
});

test('markers.json이 extract.js와 일치한다', () => {
  const expected = buildMarkers();
  const actual = readFileSync(MARKERS_PATH, 'utf8');
  assert.equal(
    actual,
    expected,
    'markers.json이 낡았습니다. `node mobile-collect/tools/dump-markers.mjs`로 다시 생성하세요.'
  );
});

test('markers.json 스키마 고정 — check_pc_side.py가 이 모양을 읽는다', () => {
  const markers = JSON.parse(readFileSync(MARKERS_PATH, 'utf8'));
  assert.deepEqual(Object.keys(markers).sort(), [
    '_generated',
    'hard',
    'minChars',
    'soft',
    'softThresholdChars',
  ]);
  assert.ok(Array.isArray(markers.hard) && markers.hard.every((m) => typeof m === 'string'));
  assert.ok(Array.isArray(markers.soft) && markers.soft.every((m) => typeof m === 'string'));
  // SOFT 임계값이 낮아지면 정상 수집이 조용히 버려진다 (pc-side/NOTES.md 확인 3).
  assert.equal(markers.softThresholdChars, 2000);
  assert.equal(markers.minChars, 500);
});
