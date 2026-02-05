import { describe, test, expect } from 'vitest'
import Decimal from 'decimal.js'
import { calculatePrepaymentFee } from '../../../src/calculators/prepayment'

describe('PrepaymentCalculator - 중도상환수수료', () => {
  describe('calculatePrepaymentFee - 수수료 계산', () => {
    test('기본 수수료 계산: 5천만원, 1.5% → 75만원', () => {
      const result = calculatePrepaymentFee({
        amount: new Decimal('50000000'),
        month: 12,
        feeRate: new Decimal('0.015'),
        exemptionMonths: 0,
        type: 'partial',
      })

      expect(result.fee.equals(new Decimal('750000'))).toBe(true)
      expect(result.isExempted).toBe(false)
    })

    test('면제기간 전 중도상환 시 수수료 발생', () => {
      const result = calculatePrepaymentFee({
        amount: new Decimal('50000000'),
        month: 24, // 2년차
        feeRate: new Decimal('0.015'),
        exemptionMonths: 36, // 3년 면제기간
        type: 'partial',
      })

      expect(result.fee.equals(new Decimal('750000'))).toBe(true)
      expect(result.isExempted).toBe(false)
    })

    test('면제기간 후 중도상환 시 수수료 없음', () => {
      const result = calculatePrepaymentFee({
        amount: new Decimal('50000000'),
        month: 37, // 3년 1개월차
        feeRate: new Decimal('0.015'),
        exemptionMonths: 36, // 3년 면제기간
        type: 'partial',
      })

      expect(result.fee.equals(new Decimal('0'))).toBe(true)
      expect(result.isExempted).toBe(true)
    })

    test('면제기간 경계값: 정확히 면제기간일 때 수수료 면제', () => {
      const result = calculatePrepaymentFee({
        amount: new Decimal('50000000'),
        month: 36, // 정확히 3년차
        feeRate: new Decimal('0.015'),
        exemptionMonths: 36, // 3년 면제기간
        type: 'partial',
      })

      expect(result.fee.equals(new Decimal('0'))).toBe(true)
      expect(result.isExempted).toBe(true)
    })

    test('면제기간 경계값: 면제기간 직전 수수료 발생', () => {
      const result = calculatePrepaymentFee({
        amount: new Decimal('50000000'),
        month: 35, // 3년 미만
        feeRate: new Decimal('0.015'),
        exemptionMonths: 36, // 3년 면제기간
        type: 'partial',
      })

      expect(result.fee.greaterThan(new Decimal('0'))).toBe(true)
      expect(result.isExempted).toBe(false)
    })

    test('부분 상환 시 해당 금액에만 수수료 적용', () => {
      const partialAmount = new Decimal('30000000')
      const result = calculatePrepaymentFee({
        amount: partialAmount,
        month: 12,
        feeRate: new Decimal('0.015'),
        exemptionMonths: 0,
        type: 'partial',
      })

      // 3천만원 × 1.5% = 45만원
      expect(result.fee.equals(new Decimal('450000'))).toBe(true)
    })

    test('전액 상환 시 전체 금액에 수수료 적용', () => {
      const fullAmount = new Decimal('100000000')
      const result = calculatePrepaymentFee({
        amount: fullAmount,
        month: 12,
        feeRate: new Decimal('0.015'),
        exemptionMonths: 0,
        type: 'full',
      })

      // 1억원 × 1.5% = 150만원
      expect(result.fee.equals(new Decimal('1500000'))).toBe(true)
    })

    test('다양한 수수료율: 1.0%', () => {
      const result = calculatePrepaymentFee({
        amount: new Decimal('100000000'),
        month: 12,
        feeRate: new Decimal('0.01'),
        exemptionMonths: 0,
        type: 'partial',
      })

      // 1억원 × 1.0% = 100만원
      expect(result.fee.equals(new Decimal('1000000'))).toBe(true)
    })

    test('다양한 수수료율: 1.2%', () => {
      const result = calculatePrepaymentFee({
        amount: new Decimal('100000000'),
        month: 12,
        feeRate: new Decimal('0.012'),
        exemptionMonths: 0,
        type: 'partial',
      })

      // 1억원 × 1.2% = 120만원
      expect(result.fee.equals(new Decimal('1200000'))).toBe(true)
    })

    test('수수료율 0%일 때', () => {
      const result = calculatePrepaymentFee({
        amount: new Decimal('100000000'),
        month: 12,
        feeRate: new Decimal('0'),
        exemptionMonths: 0,
        type: 'partial',
      })

      expect(result.fee.equals(new Decimal('0'))).toBe(true)
    })
  })

  describe('오류 케이스', () => {
    test('음수 중도상환금액 입력 시 에러', () => {
      expect(() =>
        calculatePrepaymentFee({
          amount: new Decimal('-50000000'),
          month: 12,
          feeRate: new Decimal('0.015'),
          exemptionMonths: 0,
          type: 'partial',
        })
      ).toThrow('중도상환금액은 0보다 커야 합니다')
    })

    test('0원 중도상환금액 입력 시 에러', () => {
      expect(() =>
        calculatePrepaymentFee({
          amount: new Decimal('0'),
          month: 12,
          feeRate: new Decimal('0.015'),
          exemptionMonths: 0,
          type: 'partial',
        })
      ).toThrow('중도상환금액은 0보다 커야 합니다')
    })

    test('음수 수수료율 입력 시 에러', () => {
      expect(() =>
        calculatePrepaymentFee({
          amount: new Decimal('50000000'),
          month: 12,
          feeRate: new Decimal('-0.015'),
          exemptionMonths: 0,
          type: 'partial',
        })
      ).toThrow('수수료율은 0 이상이어야 합니다')
    })

    test('0 또는 음수 상환 시점 입력 시 에러', () => {
      expect(() =>
        calculatePrepaymentFee({
          amount: new Decimal('50000000'),
          month: 0,
          feeRate: new Decimal('0.015'),
          exemptionMonths: 0,
          type: 'partial',
        })
      ).toThrow('상환 시점은 1개월 이상이어야 합니다')

      expect(() =>
        calculatePrepaymentFee({
          amount: new Decimal('50000000'),
          month: -1,
          feeRate: new Decimal('0.015'),
          exemptionMonths: 0,
          type: 'partial',
        })
      ).toThrow('상환 시점은 1개월 이상이어야 합니다')
    })

    test('음수 면제기간 입력 시 에러', () => {
      expect(() =>
        calculatePrepaymentFee({
          amount: new Decimal('50000000'),
          month: 12,
          feeRate: new Decimal('0.015'),
          exemptionMonths: -1,
          type: 'partial',
        })
      ).toThrow('면제기간은 0 이상이어야 합니다')
    })
  })

  describe('소수점 정밀도', () => {
    test('소수점 금액도 정확히 계산', () => {
      const result = calculatePrepaymentFee({
        amount: new Decimal('12345678'),
        month: 12,
        feeRate: new Decimal('0.015'),
        exemptionMonths: 0,
        type: 'partial',
      })

      // 12,345,678 × 0.015 = 185,185.17
      // 원 단위 반올림 → 185,185원
      expect(result.fee.equals(new Decimal('185185.17'))).toBe(true)
    })
  })
})
