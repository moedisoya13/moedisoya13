import Decimal from 'decimal.js'
import type { LoanInput, PaymentScheduleItem } from '../models/types'
import { calculateMonthlyPayment } from './mortgage'

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
 * 원리금균등상환 상환 스케줄 생성
 *
 * 각 회차별로:
 * - 이자 = 잔액 × 월이율
 * - 원금 = 월 상환금 - 이자
 * - 잔액 = 이전 잔액 - 원금
 *
 * @param input - 대출 입력 데이터
 * @returns 상환 스케줄 배열
 */
export function generatePaymentSchedule(input: LoanInput): PaymentScheduleItem[] {
  validateLoanInput(input)

  const { principal, annualRate, termMonths } = input
  const schedule: PaymentScheduleItem[] = []

  // 월 상환금 계산
  const monthlyPayment = calculateMonthlyPayment(input)

  // 월이율
  const monthlyRate = annualRate.dividedBy(12)

  // 현재 잔액
  let remainingBalance = principal

  for (let month = 1; month <= termMonths; month++) {
    // 이자 계산: 잔액 × 월이율
    const interest = remainingBalance.times(monthlyRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

    // 원금 계산: 월 상환금 - 이자
    let principalPayment = monthlyPayment.minus(interest)

    // 마지막 회차 처리: 잔액 보정
    if (month === termMonths) {
      // 마지막 회차에서는 남은 잔액 전체를 원금으로 처리
      principalPayment = remainingBalance
    }

    // 새 잔액 계산
    const newBalance = remainingBalance.minus(principalPayment)

    // 스케줄 항목 추가
    schedule.push({
      month,
      payment: month === termMonths
        ? principalPayment.plus(interest).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        : monthlyPayment,
      principal: principalPayment.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      interest,
      remainingBalance: newBalance.lessThan(0)
        ? new Decimal('0')
        : newBalance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    })

    // 잔액 업데이트
    remainingBalance = newBalance.lessThan(0) ? new Decimal('0') : newBalance
  }

  return schedule
}

/**
 * 특정 회차까지의 누적 원금 상환액 계산
 *
 * @param schedule - 상환 스케줄
 * @param month - 회차 (1부터 시작)
 * @returns 누적 원금 상환액
 */
export function getCumulativePrincipal(schedule: PaymentScheduleItem[], month: number): Decimal {
  return schedule
    .slice(0, month)
    .reduce((sum, item) => sum.plus(item.principal), new Decimal('0'))
}

/**
 * 특정 회차까지의 누적 이자 계산
 *
 * @param schedule - 상환 스케줄
 * @param month - 회차 (1부터 시작)
 * @returns 누적 이자
 */
export function getCumulativeInterest(schedule: PaymentScheduleItem[], month: number): Decimal {
  return schedule
    .slice(0, month)
    .reduce((sum, item) => sum.plus(item.interest), new Decimal('0'))
}

/**
 * 특정 회차의 잔액 조회
 *
 * @param schedule - 상환 스케줄
 * @param month - 회차 (1부터 시작)
 * @returns 잔액 (회차가 범위를 벗어나면 null)
 */
export function getBalanceAtMonth(
  schedule: PaymentScheduleItem[],
  month: number
): Decimal | null {
  if (month < 1 || month > schedule.length) {
    return null
  }
  return schedule[month - 1].remainingBalance
}
