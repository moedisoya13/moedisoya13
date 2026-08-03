// ⚠ 자동 생성 파일 — 직접 고치지 말 것.
//   원본: mobile-collect/extract.js
//   재생성: node mobile-collect/tools/build-snippet.mjs
//
// B-1(첫 실기기 확인) 전용 **임시** 스니펫이다. 수집 경로에는 쓰지 않는다.
// 하는 일은 run-javascript-body.js와 같고, 결과를 JSON 대신 폰에서 읽을 수 있는
// 요약으로 돌려준다. 확인이 끝나면 액션의 내용을 run-javascript-body.js로 되돌린다.

/**
 * 쿠팡 모바일 수집 — 페이지 텍스트 추출 코어
 *
 * 설계 원칙 (인수인계 문서 §6 "판단은 parse.py에, 브라우저 조작은 collect.py에"의 이식):
 *   - 이 파일의 함수는 전부 **순수 함수**다. DOM·네트워크·전역 상태를 건드리지 않는다.
 *     따라서 브라우저 없이 `node --test`로 검증할 수 있다.
 *   - DOM을 읽는 3줄짜리 래퍼는 tools/build-snippet.mjs가 이 파일 뒤에 붙여 준다.
 *
 * 자동화를 하지 않는다는 점이 이 경로의 전부다. 사람이 Safari에서 직접 연 페이지를
 * 사람이 공유 시트에서 탭했을 때만 실행된다. 클릭·스크롤 시뮬레이션, 지문 위조,
 * 센서 조작은 하지 않는다(인수인계 문서 §5 채택 불가 목록).
 */

/** innerText가 이보다 짧으면 아직 렌더가 안 끝난 것으로 본다. */
const MIN_CHARS = 500;

/** SOFT 마커는 이 길이 미만일 때만 차단으로 인정한다(오탐 방지). */
const SHORT_PAGE_CHARS = 2000;

/**
 * 명백한 차단 문구. 길이와 무관하게 차단으로 판정한다.
 *
 * ⚠ 이 목록은 PC측 `parse.py`가 가진 차단 마커의 **사본**이다. 최종 판단은 언제나
 *   parse.py가 한다. 폰에서 미리 멈추는 이유는 인수인계 문서 §8의 종료코드 2 정책
 *   ("차단 → 즉시 중단·재시도 금지")을 수집 시작점에서 지키기 위해서다.
 *   parse.py의 목록을 고칠 때 이 목록도 같이 고치고, tests/extract.test.mjs의
 *   고정 테스트를 갱신할 것.
 */
const BLOCK_MARKERS_HARD = [
  'Access Denied',
  'Request Rejected',
  "You don't have permission to access",
];

/** 정상 페이지에도 등장할 수 있는 문구. 짧은 페이지에서만 차단으로 본다. */
const BLOCK_MARKERS_SOFT = [
  'Reference #',
  '접근이 거부',
  '잘못된 접근',
  '비정상적인 접근',
  '일시적으로 이용이 제한',
];

/**
 * 페이지 텍스트를 정규화한다.
 *
 * 데스크톱 `--from-text` 경로가 받아들이는 "Ctrl+A · Ctrl+C 텍스트"와 같은 모양을
 * 유지하는 것이 목적이다. 구조를 바꾸지 않고 잡음만 고른다.
 *
 * @param {string} raw document.body.innerText
 * @returns {string} 정규화된 텍스트 (끝에 개행 1개)
 */
function normalizeText(raw) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ ​﻿]/g, ' ') // NBSP·zero-width — 가격 표기에 자주 섞인다
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned ? cleaned + '\n' : '';
}

/**
 * 차단 페이지인지 본다.
 *
 * @param {string} text 정규화된 텍스트
 * @returns {{blocked: boolean, marker?: string}}
 */
function detectBlock(text) {
  for (const marker of BLOCK_MARKERS_HARD) {
    if (text.includes(marker)) return { blocked: true, marker };
  }
  if (text.length < SHORT_PAGE_CHARS) {
    for (const marker of BLOCK_MARKERS_SOFT) {
      if (text.includes(marker)) return { blocked: true, marker };
    }
  }
  return { blocked: false };
}

/**
 * 쿠팡 URL에서 식별자를 뽑는다.
 *
 * 모바일(`/vm/products/{id}`)과 데스크톱(`/vp/products/{id}`)을 모두 받는다.
 * 추적 파라미터는 버리고 itemId·vendorItemId만 남긴다
 * (인수인계 문서 §6 "키는 상품명이 아니라 product_id").
 *
 * @param {string} url
 * @returns {{productId: string|null, itemId: string|null, vendorItemId: string|null, host: string|null}}
 */
function parseProductUrl(url) {
  const empty = { productId: null, itemId: null, vendorItemId: null, host: null };
  if (typeof url !== 'string' || !url) return empty;

  const hostMatch = url.match(/^https?:\/\/([^/?#]+)/i);
  const host = hostMatch ? hostMatch[1].toLowerCase() : null;

  const idMatch = url.match(/\/v[mp]\/products\/(\d+)/);
  const productId = idMatch ? idMatch[1] : null;

  const pick = (name) => {
    const m = url.match(new RegExp('[?&]' + name + '=(\\d+)'));
    return m ? m[1] : null;
  };

  return {
    productId,
    itemId: pick('itemId'),
    vendorItemId: pick('vendorItemId'),
    host,
  };
}

/**
 * 캡처 결과를 만든다. 단축어(Shortcuts)는 이 객체를 JSON으로 받아
 * `status`로 분기하고 `text`를 파일로 저장한다.
 *
 * status 별 의미:
 *   ok      — 정상. text를 저장한다.
 *   blocked — 차단 문구 발견. **저장하지 않고 즉시 중단**한다.
 *   empty   — 렌더가 덜 끝났거나 빈 페이지. 다시 시도한다.
 *
 * @param {{innerText: string, url: string}} input
 * @returns {{status: string, text: string, chars: number, productId: string|null,
 *            itemId: string|null, vendorItemId: string|null, host: string|null,
 *            reason?: string}}
 */
function buildCapture(input) {
  const source = input || {};
  const text = normalizeText(source.innerText);
  // 길이 판정은 본문만 센다. normalizeText가 붙이는 끝 개행은 제외한다.
  const chars = text.trimEnd().length;
  const ids = parseProductUrl(source.url);
  const base = {
    text: '',
    chars,
    productId: ids.productId,
    itemId: ids.itemId,
    vendorItemId: ids.vendorItemId,
    host: ids.host,
  };

  const block = detectBlock(text);
  if (block.blocked) {
    return { ...base, status: 'blocked', reason: block.marker };
  }
  if (chars < MIN_CHARS) {
    return { ...base, status: 'empty', reason: `본문 ${chars}자 (최소 ${MIN_CHARS}자)` };
  }
  return { ...base, status: 'ok', text };
}

/**
 * 저장할 파일 이름을 만든다.
 *
 * 기존 수동 경로의 규칙(`<상품키>_search.txt`)을 그대로 잇는다.
 *
 * @param {{productId: string|null, kind: string, fallback?: string}} input
 *        kind: 'options' | 'sellers' | 'search'
 * @returns {string}
 */
function buildFileName(input) {
  const { productId, kind, fallback } = input || {};
  const stem = (productId || fallback || 'unknown').toString().trim() || 'unknown';
  const suffix = kind === 'sellers' ? '_sellers' : kind === 'search' ? '_search' : '';
  return `${stem}${suffix}.txt`;
}

// ── 진단 래퍼 (B-1 전용) ─────────────────────────────────────
(function () {
  function count(haystack, needle) {
    return haystack.split(needle).length - 1;
  }
  function excerpt(haystack, needle) {
    var at = haystack.indexOf(needle);
    if (at < 0) return '(없음)';
    var from = at - 60 < 0 ? 0 : at - 60;
    return haystack.slice(from, at + 140).replace(/\n/g, ' ⏎ ');
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
      completion(out.join('\n'));
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
    out.push(text.slice(0, 300).replace(/\n/g, ' ⏎ '));

    completion(out.join('\n'));
  } catch (err) {
    completion('error = ' + String((err && err.message) || err));
  }
})();
