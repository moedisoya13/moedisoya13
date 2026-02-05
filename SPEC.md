# 주택담보대출 비교 계산기 - 기능 명세서 (SPEC.md)

## 1. 프로젝트 개요

### 1.1 목적
최대 3개 은행의 주택담보대출 조건을 동시에 비교하여 최적의 대출 상품을 선택할 수 있도록 돕는 웹 애플리케이션

### 1.2 핵심 가치
- **정확성**: 금융 계산의 정밀도 보장 (Decimal 기반)
- **비교 용이성**: 3개 은행 조건을 한눈에 비교
- **시각화**: 차트를 통한 직관적인 데이터 표현

## 2. 기술 스택

| 분류 | 기술 | 비고 |
|------|------|------|
| 프론트엔드 | React 18+ | TypeScript 필수 |
| 상태관리 | React Context 또는 Zustand | 경량 상태관리 |
| 차트 | Chart.js | react-chartjs-2 래퍼 사용 |
| 스타일링 | Tailwind CSS 또는 CSS Modules | 반응형 디자인 |
| 빌드 | Vite | 빠른 개발 서버 |
| 테스트 | Vitest + React Testing Library | 단위/통합 테스트 |
| 내보내기 | jsPDF + xlsx | PDF/Excel 생성 |

## 3. 기능 요구사항

### 3.1 상환 방식
- [x] **원리금균등상환** (Equal Principal and Interest)
  - 매월 동일한 금액 상환
  - 초기 이자 비중 높음, 후기 원금 비중 높음

> 원금균등, 만기일시 상환은 MVP 범위 외

### 3.2 금리 유형

#### 고정금리
```typescript
interface FixedRate {
  type: 'fixed'
  annualRate: number  // 연 이율 (예: 3.5 → 3.5%)
}
```

#### 변동금리
```typescript
interface VariableRate {
  type: 'variable'
  baseRateType: 'COFIX' | 'MOR' | 'CD' | 'CUSTOM'
  baseRate: number      // 기준금리 (%)
  spreadRate: number    // 가산금리 (%)
  // 총 금리 = baseRate + spreadRate
}
```

### 3.3 대출 입력 필드

| 필드 | 타입 | 범위 | 필수 | 설명 |
|------|------|------|------|------|
| bankName | string | - | O | 은행명 |
| loanAmount | number | 1,000만~50억원 | O | 대출금액 |
| loanPeriodYears | number | 1~40년 | O | 대출기간 |
| rateType | 'fixed' \| 'variable' | - | O | 금리유형 |
| annualRate | number | 0.1~20% | O | 연이율 (고정금리용) |
| baseRateType | string | - | △ | 기준금리 종류 (변동금리용) |
| baseRate | number | 0~10% | △ | 기준금리 (변동금리용) |
| spreadRate | number | 0~10% | △ | 가산금리 (변동금리용) |

### 3.4 중도상환 입력 필드

| 필드 | 타입 | 범위 | 필수 | 설명 |
|------|------|------|------|------|
| prepaymentAmount | number | 1원~대출잔액 | O | 중도상환금액 |
| prepaymentMonth | number | 1~총대출기간 | O | 상환 시점 (개월) |
| feeRate | number | 0~3% | O | 수수료율 |
| exemptionMonths | number | 0~60 | X | 면제기간 (개월) |
| prepaymentType | 'partial' \| 'full' | - | O | 부분/전액 상환 |

### 3.5 계산 결과 출력

#### 기본 결과
```typescript
interface CalculationResult {
  monthlyPayment: number           // 월 상환금
  totalPayment: number             // 총 상환금액
  totalInterest: number            // 총 이자
  effectiveRate: number            // 실질금리 (%)
}
```

#### 중도상환 시나리오 결과
```typescript
interface PrepaymentResult {
  prepaymentFee: number            // 중도상환수수료
  savedInterest: number            // 절감 이자
  newMonthlyPayment: number        // 변경된 월 상환금
  newTotalPayment: number          // 변경된 총 상환금액
  remainingPeriod: number          // 잔여 기간 (개월)
}
```

#### 상환 스케줄
```typescript
interface PaymentScheduleItem {
  month: number                    // 회차
  payment: number                  // 상환금액
  principal: number                // 원금
  interest: number                 // 이자
  remainingBalance: number         // 잔액
}
```

## 4. UI/UX 요구사항

### 4.1 레이아웃 구조

```
┌─────────────────────────────────────────────────────────────┐
│                         헤더                                 │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │  은행 1   │  │  은행 2   │  │  은행 3   │  ← 병렬 카드  │
│  │  입력폼   │  │  입력폼   │  │  입력폼   │               │
│  └───────────┘  └───────────┘  └───────────┘               │
├─────────────────────────────────────────────────────────────┤
│                    비교 계산 버튼                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              종합 비교 대시보드                       │   │
│  │  - 월 상환금 비교                                    │   │
│  │  - 총 상환금액 비교                                  │   │
│  │  - 총 이자 비교                                      │   │
│  │  - 중도상환수수료 비교                               │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              상환 스케줄 차트                         │   │
│  │  - 원금/이자 비율 변화                               │   │
│  │  - 잔액 변화 추이                                    │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│              PDF 내보내기 | Excel 내보내기                   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 반응형 브레이크포인트

| 디바이스 | 너비 | 카드 배치 |
|----------|------|-----------|
| 데스크톱 | ≥1024px | 3열 가로 |
| 태블릿 | 768~1023px | 2열 + 1열 |
| 모바일 | <768px | 1열 세로 |

### 4.3 접근성 요구사항
- 모든 입력 필드에 label 연결
- 키보드 네비게이션 지원
- 색상 대비 WCAG AA 준수
- 스크린 리더 호환

## 5. 에이전트 위임 계획

### 5.1 logic-auditor (금융 로직 검증)

**역할**: 모든 금융 계산 로직의 정확성 검증

**담당 업무**:
- [ ] 원리금균등상환 공식 검증
- [ ] 중도상환수수료 계산 공식 검증
- [ ] 소수점 처리 규칙 준수 확인
- [ ] 경계값 테스트 케이스 검토
- [ ] 실제 은행 계산 결과와 비교 검증

**검증 체크리스트**:
```markdown
1. Decimal 타입 사용 여부
2. ROUND_HALF_UP 반올림 적용
3. 0원, 음수, 최대값 처리
4. 이자 계산 정확도 (1원 이내 오차)
5. 테스트 커버리지 80% 이상
```

### 5.2 ui-specialist (UI 구현)

**역할**: 사용자 인터페이스 컴포넌트 개발

**담당 업무**:
- [ ] 은행 입력 카드 컴포넌트
- [ ] 비교 대시보드 컴포넌트
- [ ] 상환 스케줄 차트 컴포넌트
- [ ] 반응형 레이아웃 구현
- [ ] PDF/Excel 내보내기 기능

**UI 컴포넌트 목록**:
```
components/
├── BankInputCard/          # 은행별 입력 폼
├── ComparisonDashboard/    # 비교 결과 대시보드
├── PaymentScheduleChart/   # 상환 스케줄 차트
├── PrepaymentSimulator/    # 중도상환 시뮬레이터
├── ExportButtons/          # 내보내기 버튼
└── common/                 # 공통 컴포넌트
    ├── Input/
    ├── Select/
    ├── Button/
    └── Card/
```

## 6. 검증 자동화

### 6.1 필수 테스트 범위

| 테스트 유형 | 대상 | 최소 커버리지 |
|------------|------|--------------|
| 단위 테스트 | 계산 로직 | 90% |
| 단위 테스트 | 유틸리티 함수 | 80% |
| 통합 테스트 | API/컴포넌트 | 70% |
| E2E 테스트 | 주요 시나리오 | 핵심 플로우 |

### 6.2 테스트 시나리오

#### 계산 로직 테스트
```typescript
describe('MortgageCalculator', () => {
  test('1억원, 3.5%, 30년 원리금균등 - 월 상환금 검증', () => {
    const result = calculateMonthlyPayment({
      principal: 100_000_000,
      annualRate: 3.5,
      periodYears: 30
    })
    expect(result).toBeCloseTo(449_045, 0)  // 1원 오차 허용
  })

  test('중도상환 시 수수료 계산', () => {
    const fee = calculatePrepaymentFee({
      amount: 50_000_000,
      feeRate: 1.5,
      elapsedMonths: 12,
      exemptionMonths: 36
    })
    expect(fee).toBe(750_000)
  })
})
```

### 6.3 자동화 파이프라인

```yaml
# 커밋 전 자동 실행
pre-commit:
  - lint
  - type-check
  - test:unit

# PR 시 자동 실행
ci:
  - lint
  - type-check
  - test:unit
  - test:integration
  - test:coverage (minimum 80%)
```

## 7. 마일스톤

### Phase 1: 핵심 기능 (MVP)
- [ ] 프로젝트 초기 설정
- [ ] 금융 계산 로직 구현 및 테스트
- [ ] 기본 UI 컴포넌트 구현
- [ ] 3개 은행 비교 기능

### Phase 2: 고급 기능
- [ ] 중도상환 시뮬레이션
- [ ] 상환 스케줄 차트
- [ ] 종합 대시보드

### Phase 3: 완성도
- [ ] PDF/Excel 내보내기
- [ ] 반응형 최적화
- [ ] 접근성 검토
- [ ] 성능 최적화

## 8. 제약사항 및 가정

### 8.1 제약사항
- 실시간 은행 금리 연동 없음 (사용자 직접 입력)
- 서버 없이 클라이언트에서만 동작
- 세금 및 기타 부대비용 미포함

### 8.2 가정
- 사용자는 기본적인 대출 개념을 이해함
- 금리는 대출 기간 동안 고정된다고 가정 (변동금리도 시뮬레이션 시점 기준)
- 중도상환은 1회만 가정 (다중 중도상환은 향후 확장)

---

*문서 버전: 1.0*
*최종 수정: 2024-01-XX*
