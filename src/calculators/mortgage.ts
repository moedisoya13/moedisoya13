import Decimal from 'decimal.js'
import type { LoanInput, MonthlyPaymentResult } from '../models/types'

// Decimal 정밀도 설정
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

/**
 * 입력값 유효성 검증
 */
function validateLoanInput(input: LoanInput): void {
  if (input.principal.lessThanOrEqualTo(0)) {
    throw new Error('대출원금은 0보다 커야 합니다')
  }
  if (input.annualRate.lessThan(0)) {
    throw new Error('금리는 0 이상이어야 합니다')
  }
  if (input.termMonths < 1) {
    throw new Error('대출기간은 1개월 이상이어야 합니다')
  }
}

/**
 * 원리금균등상환 월 상환금 계산
 *
 * 공식: 월 상환금 = P × (r × (1 + r)^n) / ((1 + r)^n - 1)
 * - P: 대출원금
 * - r: 월이율 (연이율 / 12)
 * - n: 대출기간 (개월)
 *
 * @param input - 대출 입력 데이터
 * @returns 월 상환금 (Decimal, 소수점 2자리)
 */
export function calculateMonthlyPayment(input: LoanInput): Decimal {
  validateLoanInput(input)

  const { principal, annualRate, termMonths } = input

  // 0% 금리인 경우: 원금만 균등 분할
  if (annualRate.equals(0)) {
    return principal.dividedBy(termMonths).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  }

  // 월이율 계산
  const monthlyRate = annualRate.dividedBy(12)

  // (1 + r)^n 계산
  const onePlusR = new Decimal(1).plus(monthlyRate)
  const power = onePlusR.pow(termMonths)

  // 분자: P × r × (1 + r)^n
  const numerator = principal.times(monthlyRate).times(power)

  // 분모: (1 + r)^n - 1
  const denominator = power.minus(1)

  // 월 상환금 계산
  const monthlyPayment = numerator.dividedBy(denominator)

  return monthlyPayment.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

/**
 * 총 상환금액 계산
 *
 * @param monthlyPayment - 월 상환금
 * @param termMonths - 대출기간 (개월)
 * @returns 총 상환금액
 */
export function calculateTotalPayment(monthlyPayment: Decimal, termMonths: number): Decimal {
  return monthlyPayment.times(termMonths).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

/**
 * 총 이자 계산
 *
 * @param totalPayment - 총 상환금액
 * @param principal - 대출원금
 * @returns 총 이자
 */
export function calculateTotalInterest(totalPayment: Decimal, principal: Decimal): Decimal {
  return totalPayment.minus(principal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

/**
 * 월 상환금 계산 결과 (전체)
 *
 * @param input - 대출 입력 데이터
 * @returns 월 상환금, 총 상환금액, 총 이자
 */
export function calculateMortgage(input: LoanInput): MonthlyPaymentResult {
  const monthlyPayment = calculateMonthlyPayment(input)
  const totalPayment = calculateTotalPayment(monthlyPayment, input.termMonths)
  const totalInterest = calculateTotalInterest(totalPayment, input.principal)

  return {
    monthlyPayment,
    totalPayment,
    totalInterest,
  }
}
