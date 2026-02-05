import Decimal from 'decimal.js'
import type { PrepaymentInput, PrepaymentFeeResult } from '../models/types'

// Decimal 정밀도 설정
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

/**
 * 중도상환 입력값 유효성 검증
 */
function validatePrepaymentInput(input: PrepaymentInput): void {
  if (input.amount.lessThanOrEqualTo(0)) {
    throw new Error('중도상환금액은 0보다 커야 합니다')
  }
  if (input.feeRate.lessThan(0)) {
    throw new Error('수수료율은 0 이상이어야 합니다')
  }
  if (input.month < 1) {
    throw new Error('상환 시점은 1개월 이상이어야 합니다')
  }
  if (input.exemptionMonths < 0) {
    throw new Error('면제기간은 0 이상이어야 합니다')
  }
}

/**
 * 중도상환수수료 계산
 *
 * 공식: 수수료 = 중도상환금액 × 수수료율
 *
 * 면제 조건:
 * - 면제기간이 설정되어 있고 (exemptionMonths > 0)
 * - 상환 시점이 면제기간 이상인 경우 (month >= exemptionMonths)
 *
 * @param input - 중도상환 입력 데이터
 * @returns 수수료 금액 및 면제 여부
 */
export function calculatePrepaymentFee(input: PrepaymentInput): PrepaymentFeeResult {
  validatePrepaymentInput(input)

  const { amount, month, feeRate, exemptionMonths } = input

  // 면제 조건 확인
  const isExempted = exemptionMonths > 0 && month >= exemptionMonths

  if (isExempted) {
    return {
      fee: new Decimal('0'),
      isExempted: true,
    }
  }

  // 수수료 계산: 금액 × 수수료율
  const fee = amount.times(feeRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

  return {
    fee,
    isExempted: false,
  }
}

/**
 * 중도상환 후 절감 이자 계산
 *
 * @param originalTotalInterest - 원래 총 이자
 * @param newTotalInterest - 중도상환 후 총 이자
 * @returns 절감 이자
 */
export function calculateSavedInterest(
  originalTotalInterest: Decimal,
  newTotalInterest: Decimal
): Decimal {
  return originalTotalInterest.minus(newTotalInterest).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

/**
 * 중도상환 후 잔여 원금 계산
 *
 * @param currentBalance - 현재 잔액
 * @param prepaymentAmount - 중도상환금액
 * @returns 잔여 원금
 */
export function calculateRemainingBalance(
  currentBalance: Decimal,
  prepaymentAmount: Decimal
): Decimal {
  const remaining = currentBalance.minus(prepaymentAmount)

  if (remaining.lessThan(0)) {
    return new Decimal('0')
  }

  return remaining.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}
