import Decimal from 'decimal.js'

/**
 * 금리 유형
 */
export type RateType = 'fixed' | 'variable'

/**
 * 변동금리 기준금리 종류
 */
export type BaseRateType = 'COFIX' | 'MOR' | 'CD' | 'CUSTOM'

/**
 * 중도상환 유형
 */
export type PrepaymentType = 'partial' | 'full'

/**
 * 대출 입력 데이터
 */
export interface LoanInput {
  /** 대출원금 (원) */
  principal: Decimal
  /** 연이율 (예: 3.5% → 0.035) */
  annualRate: Decimal
  /** 대출기간 (개월) */
  termMonths: number
}

/**
 * 중도상환 입력 데이터
 */
export interface PrepaymentInput {
  /** 중도상환금액 (원) */
  amount: Decimal
  /** 상환 시점 (개월, 1부터 시작) */
  month: number
  /** 수수료율 (예: 1.5% → 0.015) */
  feeRate: Decimal
  /** 면제기간 (개월, 0이면 면제 없음) */
  exemptionMonths: number
  /** 부분/전액 상환 */
  type: PrepaymentType
}

/**
 * 월 상환금 계산 결과
 */
export interface MonthlyPaymentResult {
  /** 월 상환금 (원) */
  monthlyPayment: Decimal
  /** 총 상환금액 (원) */
  totalPayment: Decimal
  /** 총 이자 (원) */
  totalInterest: Decimal
}

/**
 * 중도상환 수수료 계산 결과
 */
export interface PrepaymentFeeResult {
  /** 중도상환수수료 (원) */
  fee: Decimal
  /** 면제 여부 */
  isExempted: boolean
}

/**
 * 상환 스케줄 항목
 */
export interface PaymentScheduleItem {
  /** 회차 (1부터 시작) */
  month: number
  /** 월 상환금 (원) */
  payment: Decimal
  /** 원금 상환분 (원) */
  principal: Decimal
  /** 이자 상환분 (원) */
  interest: Decimal
  /** 잔여 원금 (원) */
  remainingBalance: Decimal
}

/**
 * 은행 비교 데이터
 */
export interface BankComparisonData {
  /** 은행명 */
  bankName: string
  /** 대출 정보 */
  loan: LoanInput
  /** 금리 유형 */
  rateType: RateType
  /** 기준금리 종류 (변동금리용) */
  baseRateType?: BaseRateType
  /** 기준금리 (변동금리용) */
  baseRate?: Decimal
  /** 가산금리 (변동금리용) */
  spreadRate?: Decimal
  /** 중도상환 정보 */
  prepayment?: PrepaymentInput
}

/**
 * 비교 계산 결과
 */
export interface ComparisonResult {
  /** 은행명 */
  bankName: string
  /** 월 상환금 계산 결과 */
  payment: MonthlyPaymentResult
  /** 중도상환 수수료 (있는 경우) */
  prepaymentFee?: PrepaymentFeeResult
  /** 상환 스케줄 */
  schedule: PaymentScheduleItem[]
}
