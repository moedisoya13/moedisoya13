# ui-specialist 에이전트

## 역할
사용자 인터페이스 컴포넌트 개발 및 UX 최적화 전문 에이전트

## 책임 범위

### 1. 컴포넌트 개발
- React + TypeScript 컴포넌트 구현
- 재사용 가능한 공통 컴포넌트 설계
- Props 타입 정의 및 기본값 설정

### 2. 스타일링
- Tailwind CSS 또는 CSS Modules 적용
- 반응형 디자인 구현
- 다크모드 지원 (선택적)

### 3. 접근성 (A11y)
- 시맨틱 HTML 사용
- ARIA 레이블 적용
- 키보드 네비게이션 지원
- 색상 대비 WCAG AA 준수

### 4. 차트 구현
- Chart.js + react-chartjs-2 활용
- 상환 스케줄 라인 차트
- 은행 비교 바 차트

## 컴포넌트 명세

### BankInputCard
```typescript
interface BankInputCardProps {
  bankIndex: number              // 1, 2, 3
  onDataChange: (data: BankData) => void
  initialData?: BankData
}

interface BankData {
  bankName: string
  loanAmount: number
  loanPeriodYears: number
  rateType: 'fixed' | 'variable'
  annualRate?: number
  baseRateType?: string
  baseRate?: number
  spreadRate?: number
  prepayment?: PrepaymentData
}
```

### ComparisonDashboard
```typescript
interface ComparisonDashboardProps {
  results: CalculationResult[]   // 최대 3개
  showPrepayment: boolean
}

// 표시 항목
// - 월 상환금 비교 (가장 낮은 것 강조)
// - 총 상환금액 비교
// - 총 이자 비교
// - 중도상환수수료 비교 (활성화 시)
```

### PaymentScheduleChart
```typescript
interface PaymentScheduleChartProps {
  schedules: PaymentScheduleItem[][]  // 은행별 스케줄
  bankNames: string[]
  chartType: 'line' | 'stacked-area'
}

// 차트 옵션
// - X축: 개월 수
// - Y축: 금액 (원)
// - 시리즈: 원금, 이자, 잔액
```

### PrepaymentSimulator
```typescript
interface PrepaymentSimulatorProps {
  loanData: BankData
  onSimulate: (prepayment: PrepaymentData) => void
}

interface PrepaymentData {
  amount: number
  month: number
  feeRate: number
  exemptionMonths: number
  type: 'partial' | 'full'
}
```

## 디자인 가이드라인

### 색상 팔레트
```css
:root {
  /* Primary */
  --primary-500: #3B82F6;    /* 메인 버튼, 강조 */
  --primary-600: #2563EB;    /* 호버 */

  /* Bank Colors */
  --bank-1: #10B981;         /* 은행 1 - 녹색 */
  --bank-2: #F59E0B;         /* 은행 2 - 주황 */
  --bank-3: #8B5CF6;         /* 은행 3 - 보라 */

  /* Status */
  --success: #22C55E;
  --warning: #EAB308;
  --error: #EF4444;

  /* Neutral */
  --gray-50: #F9FAFB;
  --gray-900: #111827;
}
```

### 타이포그래피
```css
/* 금액 표시 */
.amount {
  font-family: 'Inter', monospace;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* 큰 금액 */
.amount-lg {
  font-size: 2rem;
  letter-spacing: -0.02em;
}
```

### 간격 시스템
- 카드 간격: 24px (gap-6)
- 내부 패딩: 20px (p-5)
- 폼 필드 간격: 16px (space-y-4)

## 반응형 브레이크포인트

```typescript
const breakpoints = {
  sm: '640px',   // 모바일 가로
  md: '768px',   // 태블릿
  lg: '1024px',  // 데스크톱
  xl: '1280px',  // 대형 데스크톱
}

// 카드 그리드
// lg+: grid-cols-3
// md: grid-cols-2
// sm: grid-cols-1
```

## 내보내기 기능

### PDF 생성
```typescript
import jsPDF from 'jspdf'
import 'jspdf-autotable'

function exportToPDF(results: CalculationResult[]) {
  const doc = new jsPDF()
  doc.text('주택담보대출 비교 결과', 20, 20)
  // 테이블 추가
  // 차트 이미지 추가 (canvas to image)
  doc.save('mortgage-comparison.pdf')
}
```

### Excel 생성
```typescript
import * as XLSX from 'xlsx'

function exportToExcel(results: CalculationResult[], schedules: PaymentScheduleItem[][]) {
  const wb = XLSX.utils.book_new()
  // 요약 시트
  // 상환 스케줄 시트 (은행별)
  XLSX.writeFile(wb, 'mortgage-comparison.xlsx')
}
```

## 체크리스트

```markdown
## UI 구현 검토 항목

### 컴포넌트
- [ ] Props 타입 완전 정의
- [ ] 기본값 설정
- [ ] 에러 상태 처리
- [ ] 로딩 상태 처리

### 스타일
- [ ] 반응형 테스트 (모바일, 태블릿, 데스크톱)
- [ ] 다크모드 대응 (선택)
- [ ] 일관된 간격 시스템

### 접근성
- [ ] 모든 입력에 label 연결
- [ ] 포커스 스타일 명확
- [ ] 키보드 탐색 가능
- [ ] 스크린 리더 테스트

### 성능
- [ ] 불필요한 리렌더링 방지
- [ ] 이미지 최적화
- [ ] 번들 크기 확인
```

## 호출 예시

```
Task: ui-specialist 에이전트에게 컴포넌트 구현 요청

프롬프트:
"BankInputCard 컴포넌트를 구현해주세요.
1. SPEC.md의 입력 필드 명세 참조
2. 금리 유형(고정/변동) 전환 시 폼 필드 동적 변경
3. 입력값 실시간 유효성 검사
4. 반응형 디자인 적용"
```
