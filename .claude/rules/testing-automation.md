# 테스트 자동화 규칙

## 필수 테스트 커버리지

| 모듈 | 최소 커버리지 | 대상 |
|------|-------------|------|
| calculators/ | 90% | 금융 계산 로직 |
| utils/ | 80% | 유틸리티 함수 |
| components/ | 70% | UI 컴포넌트 |
| 전체 | 80% | 프로젝트 전체 |

## 테스트 실행 명령

```bash
# 전체 테스트 실행
npm run test

# 커버리지 포함
npm run test:coverage

# 특정 파일만
npm run test -- mortgage.test.ts

# Watch 모드
npm run test:watch
```

## 테스트 구조

```
tests/
├── unit/
│   ├── calculators/
│   │   ├── mortgage.test.ts      # 상환금 계산
│   │   ├── prepayment.test.ts    # 중도상환 계산
│   │   └── interest.test.ts      # 이자 계산
│   └── utils/
│       ├── decimal.test.ts       # Decimal 유틸
│       └── format.test.ts        # 포맷팅 유틸
├── integration/
│   └── calculation-flow.test.ts  # 전체 계산 플로우
└── e2e/
    └── comparison.spec.ts        # E2E 비교 시나리오
```

## 필수 테스트 케이스

### 1. 원리금균등상환 계산

```typescript
describe('calculateMonthlyPayment', () => {
  // 정상 케이스
  test('표준 대출 조건에서 월 상환금 계산', () => {
    // 1억원, 3.5%, 30년 → 449,045원
  })

  // 경계값
  test('0% 금리일 때 원금만 균등 분할', () => {})
  test('최소 대출금(1천만원) 계산', () => {})
  test('최대 대출금(50억원) 계산', () => {})
  test('최소 기간(1년) 계산', () => {})
  test('최대 기간(40년) 계산', () => {})

  // 오류 케이스
  test('음수 대출금 입력 시 에러', () => {})
  test('0원 대출금 입력 시 에러', () => {})
  test('음수 금리 입력 시 에러', () => {})
})
```

### 2. 중도상환수수료 계산

```typescript
describe('calculatePrepaymentFee', () => {
  // 정상 케이스
  test('면제기간 전 중도상환 시 수수료 발생', () => {})
  test('면제기간 후 중도상환 시 수수료 없음', () => {})

  // 부분 상환
  test('부분 상환 시 해당 금액에만 수수료 적용', () => {})

  // 전액 상환
  test('전액 상환 시 잔액 전체에 수수료 적용', () => {})
})
```

### 3. 상환 스케줄 생성

```typescript
describe('generatePaymentSchedule', () => {
  test('스케줄 항목 수가 대출 기간과 일치', () => {})
  test('마지막 회차 잔액이 0', () => {})
  test('총 원금 합계가 대출금과 일치', () => {})
  test('각 회차 원금+이자 = 상환금', () => {})
})
```

## 자동 실행 트리거

### Pre-commit Hook

```bash
# .husky/pre-commit
#!/bin/sh
npm run lint
npm run type-check
npm run test:unit
```

### CI Pipeline (GitHub Actions)

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test:coverage
      - name: Check coverage
        run: |
          COVERAGE=$(npm run test:coverage -- --reporter=json-summary | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80%"
            exit 1
          fi
```

## 테스트 리포트 형식

코드 작성 후 자동 테스트 실행 시 다음 형식으로 보고:

```markdown
## 테스트 실행 결과

### 실행 요약
- 총 테스트: 45개
- 성공: 43개 ✅
- 실패: 2개 ❌
- 건너뜀: 0개

### 커버리지
| 모듈 | 라인 | 분기 | 함수 |
|------|------|------|------|
| calculators/ | 92% ✅ | 88% ✅ | 95% ✅ |
| utils/ | 85% ✅ | 80% ✅ | 90% ✅ |
| 전체 | 88% ✅ | 84% ✅ | 92% ✅ |

### 실패한 테스트
1. `mortgage.test.ts > calculateMonthlyPayment > 최대 대출금 계산`
   - 예상: 449045
   - 실제: 449044
   - 원인: 반올림 오차

2. `prepayment.test.ts > 면제기간 경계값`
   - 예상: 0
   - 실제: 750000
   - 원인: 경계 조건 오류

### 권장 조치
1. mortgage.ts:45 - 반올림 규칙 재검토
2. prepayment.ts:28 - 면제기간 조건문 수정 (>= 대신 >)
```

## 검증 자동화 체크리스트

모든 코드 변경 후 자동 확인:

- [ ] `npm run lint` 통과
- [ ] `npm run type-check` 통과
- [ ] `npm run test` 전체 통과
- [ ] 커버리지 80% 이상
- [ ] 금융 계산 로직 커버리지 90% 이상
- [ ] 새로운 함수에 테스트 추가됨
- [ ] 엣지 케이스 테스트 포함
