import { describe, test, expect } from 'vitest'
import Decimal from 'decimal.js'
import {
  calculateMonthlyPayment,
  calculateTotalPayment,
  calculateTotalInterest,
} from '../../../src/calculators/mortgage'

describe('MortgageCalculator - 원리금균등상환', () => {
  describe('calculateMonthlyPayment - 월 상환금 계산', () => {
    test('표준 대출 조건: 1억원, 3.5%, 30년 → 약 449,045원', () => {
      const result = calculateMonthlyPayment({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 360,
      })

      // 실제 은행 계산 결과와 비교 (1원 오차 허용)
      expect(result.minus(new Decimal('449045')).abs().lessThanOrEqualTo(1)).toBe(true)
    })

    test('표준 대출 조건: 2억원, 4.0%, 20년 → 약 1,211,960원', () => {
      const result = calculateMonthlyPayment({
        principal: new Decimal('200000000'),
        annualRate: new Decimal('0.04'),
        termMonths: 240,
      })

      expect(result.minus(new Decimal('1211960')).abs().lessThanOrEqualTo(1)).toBe(true)
    })

    test('표준 대출 조건: 3억원, 3.0%, 35년 → 약 1,154,551원', () => {
      const result = calculateMonthlyPayment({
        principal: new Decimal('300000000'),
        annualRate: new Decimal('0.03'),
        termMonths: 420,
      })

      // 실제 계산 결과: 약 1,154,550.57원 (원리금균등상환 공식 기반)
      expect(result.minus(new Decimal('1154551')).abs().lessThanOrEqualTo(1)).toBe(true)
    })

    test('0% 금리일 때 원금만 균등 분할', () => {
      const result = calculateMonthlyPayment({
        principal: new Decimal('120000000'),
        annualRate: new Decimal('0'),
        termMonths: 120,
      })

      // 1.2억 / 120개월 = 100만원
      expect(result.equals(new Decimal('1000000'))).toBe(true)
    })

    test('최소 대출금(1천만원) 계산', () => {
      const result = calculateMonthlyPayment({
        principal: new Decimal('10000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 120,
      })

      // 결과가 양수인지 확인
      expect(result.greaterThan(0)).toBe(true)
      // 대략적인 범위 확인 (약 99,000원 예상)
      expect(result.greaterThan(new Decimal('90000'))).toBe(true)
      expect(result.lessThan(new Decimal('110000'))).toBe(true)
    })

    test('최대 대출금(50억원) 계산', () => {
      const result = calculateMonthlyPayment({
        principal: new Decimal('5000000000'),
        annualRate: new Decimal('0.05'),
        termMonths: 480,
      })

      // 결과가 양수이고 합리적인 범위인지 확인
      expect(result.greaterThan(0)).toBe(true)
      expect(result.greaterThan(new Decimal('20000000'))).toBe(true)
    })

    test('최소 기간(1년, 12개월) 계산', () => {
      const result = calculateMonthlyPayment({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 12,
      })

      // 1년 대출의 월 상환금은 원금/12보다 커야 함 (이자 포함)
      const minPayment = new Decimal('100000000').dividedBy(12)
      expect(result.greaterThan(minPayment)).toBe(true)
    })

    test('최대 기간(40년, 480개월) 계산', () => {
      const result = calculateMonthlyPayment({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 480,
      })

      // 40년 대출의 월 상환금은 30년보다 작아야 함
      const payment30y = calculateMonthlyPayment({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 360,
      })
      expect(result.lessThan(payment30y)).toBe(true)
    })
  })

  describe('오류 케이스', () => {
    test('음수 대출금 입력 시 에러', () => {
      expect(() =>
        calculateMonthlyPayment({
          principal: new Decimal('-100000000'),
          annualRate: new Decimal('0.035'),
          termMonths: 360,
        })
      ).toThrow('대출원금은 0보다 커야 합니다')
    })

    test('0원 대출금 입력 시 에러', () => {
      expect(() =>
        calculateMonthlyPayment({
          principal: new Decimal('0'),
          annualRate: new Decimal('0.035'),
          termMonths: 360,
        })
      ).toThrow('대출원금은 0보다 커야 합니다')
    })

    test('음수 금리 입력 시 에러', () => {
      expect(() =>
        calculateMonthlyPayment({
          principal: new Decimal('100000000'),
          annualRate: new Decimal('-0.035'),
          termMonths: 360,
        })
      ).toThrow('금리는 0 이상이어야 합니다')
    })

    test('0 또는 음수 기간 입력 시 에러', () => {
      expect(() =>
        calculateMonthlyPayment({
          principal: new Decimal('100000000'),
          annualRate: new Decimal('0.035'),
          termMonths: 0,
        })
      ).toThrow('대출기간은 1개월 이상이어야 합니다')

      expect(() =>
        calculateMonthlyPayment({
          principal: new Decimal('100000000'),
          annualRate: new Decimal('0.035'),
          termMonths: -12,
        })
      ).toThrow('대출기간은 1개월 이상이어야 합니다')
    })
  })

  describe('calculateTotalPayment - 총 상환금액 계산', () => {
    test('총 상환금액 = 월 상환금 × 기간', () => {
      const monthlyPayment = new Decimal('449045')
      const termMonths = 360

      const result = calculateTotalPayment(monthlyPayment, termMonths)

      expect(result.equals(monthlyPayment.times(termMonths))).toBe(true)
    })
  })

  describe('calculateTotalInterest - 총 이자 계산', () => {
    test('총 이자 = 총 상환금액 - 원금', () => {
      const totalPayment = new Decimal('161656200')  // 449045 × 360
      const principal = new Decimal('100000000')

      const result = calculateTotalInterest(totalPayment, principal)

      expect(result.equals(new Decimal('61656200'))).toBe(true)
    })
  })

  describe('Decimal 정밀도 검증', () => {
    test('부동소수점 오류 없이 정확한 계산', () => {
      // 0.1 + 0.2 = 0.3 (JavaScript에서는 0.30000000000000004)
      const a = new Decimal('0.1')
      const b = new Decimal('0.2')
      const sum = a.plus(b)

      expect(sum.equals(new Decimal('0.3'))).toBe(true)
    })

    test('월이율 계산 정밀도', () => {
      const annualRate = new Decimal('0.035')
      const monthlyRate = annualRate.dividedBy(12)

      // 0.035 / 12 = 0.00291666...
      expect(monthlyRate.toDecimalPlaces(10).toString()).toBe('0.0029166667')
    })
  })
})
