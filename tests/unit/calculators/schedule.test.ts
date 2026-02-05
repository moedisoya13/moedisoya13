import { describe, test, expect } from 'vitest'
import Decimal from 'decimal.js'
import { generatePaymentSchedule } from '../../../src/calculators/schedule'

describe('ScheduleCalculator - 상환 스케줄', () => {
  describe('generatePaymentSchedule - 스케줄 생성', () => {
    test('스케줄 항목 수가 대출 기간과 일치', () => {
      const schedule = generatePaymentSchedule({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 360,
      })

      expect(schedule.length).toBe(360)
    })

    test('각 회차 번호가 1부터 순차적으로 증가', () => {
      const schedule = generatePaymentSchedule({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 12,
      })

      schedule.forEach((item, index) => {
        expect(item.month).toBe(index + 1)
      })
    })

    test('마지막 회차 잔액이 0', () => {
      const schedule = generatePaymentSchedule({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 360,
      })

      const lastItem = schedule[schedule.length - 1]
      // 반올림 오차로 인해 매우 작은 값 허용
      expect(lastItem.remainingBalance.abs().lessThanOrEqualTo(1)).toBe(true)
    })

    test('총 원금 합계가 대출금과 일치', () => {
      const principal = new Decimal('100000000')
      const schedule = generatePaymentSchedule({
        principal,
        annualRate: new Decimal('0.035'),
        termMonths: 360,
      })

      const totalPrincipal = schedule.reduce(
        (sum, item) => sum.plus(item.principal),
        new Decimal('0')
      )

      // 1원 오차 허용
      expect(totalPrincipal.minus(principal).abs().lessThanOrEqualTo(1)).toBe(true)
    })

    test('각 회차 원금 + 이자 = 상환금', () => {
      const schedule = generatePaymentSchedule({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 360,
      })

      schedule.forEach((item) => {
        const calculatedPayment = item.principal.plus(item.interest)
        // 반올림 오차로 인해 1원 오차 허용
        expect(calculatedPayment.minus(item.payment).abs().lessThanOrEqualTo(1)).toBe(true)
      })
    })

    test('잔액이 매 회차마다 감소', () => {
      const schedule = generatePaymentSchedule({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 360,
      })

      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].remainingBalance.lessThan(schedule[i - 1].remainingBalance)).toBe(true)
      }
    })

    test('원리금균등: 마지막 회차 제외 매월 상환금이 동일', () => {
      const schedule = generatePaymentSchedule({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 360,
      })

      const firstPayment = schedule[0].payment

      // 마지막 회차는 잔액 보정으로 인해 다를 수 있으므로 제외
      schedule.slice(0, -1).forEach((item) => {
        // 반올림으로 인한 1원 오차 허용
        expect(item.payment.minus(firstPayment).abs().lessThanOrEqualTo(1)).toBe(true)
      })
    })

    test('초기에는 이자 비중이 높고 후기에는 원금 비중이 높음', () => {
      const schedule = generatePaymentSchedule({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 360,
      })

      const firstItem = schedule[0]
      const lastItem = schedule[schedule.length - 1]

      // 첫 회차: 이자 > 원금
      expect(firstItem.interest.greaterThan(firstItem.principal)).toBe(true)

      // 마지막 회차: 원금 > 이자
      expect(lastItem.principal.greaterThan(lastItem.interest)).toBe(true)
    })

    test('0% 금리일 때 모든 이자가 0', () => {
      const schedule = generatePaymentSchedule({
        principal: new Decimal('120000000'),
        annualRate: new Decimal('0'),
        termMonths: 120,
      })

      schedule.forEach((item) => {
        expect(item.interest.equals(new Decimal('0'))).toBe(true)
      })
    })

    test('0% 금리일 때 매월 동일한 원금 상환', () => {
      const principal = new Decimal('120000000')
      const termMonths = 120
      const schedule = generatePaymentSchedule({
        principal,
        annualRate: new Decimal('0'),
        termMonths,
      })

      const expectedPrincipal = principal.dividedBy(termMonths)

      schedule.forEach((item) => {
        expect(item.principal.minus(expectedPrincipal).abs().lessThanOrEqualTo(1)).toBe(true)
      })
    })
  })

  describe('오류 케이스', () => {
    test('음수 대출금 입력 시 에러', () => {
      expect(() =>
        generatePaymentSchedule({
          principal: new Decimal('-100000000'),
          annualRate: new Decimal('0.035'),
          termMonths: 360,
        })
      ).toThrow('대출원금은 0보다 커야 합니다')
    })

    test('0원 대출금 입력 시 에러', () => {
      expect(() =>
        generatePaymentSchedule({
          principal: new Decimal('0'),
          annualRate: new Decimal('0.035'),
          termMonths: 360,
        })
      ).toThrow('대출원금은 0보다 커야 합니다')
    })

    test('음수 금리 입력 시 에러', () => {
      expect(() =>
        generatePaymentSchedule({
          principal: new Decimal('100000000'),
          annualRate: new Decimal('-0.035'),
          termMonths: 360,
        })
      ).toThrow('금리는 0 이상이어야 합니다')
    })

    test('0 또는 음수 기간 입력 시 에러', () => {
      expect(() =>
        generatePaymentSchedule({
          principal: new Decimal('100000000'),
          annualRate: new Decimal('0.035'),
          termMonths: 0,
        })
      ).toThrow('대출기간은 1개월 이상이어야 합니다')
    })
  })

  describe('특수 케이스', () => {
    test('1개월 대출', () => {
      const principal = new Decimal('10000000')
      const annualRate = new Decimal('0.12') // 연 12% = 월 1%

      const schedule = generatePaymentSchedule({
        principal,
        annualRate,
        termMonths: 1,
      })

      expect(schedule.length).toBe(1)
      // 원금 + 1개월 이자
      const expectedInterest = principal.times(annualRate.dividedBy(12))
      expect(schedule[0].principal.equals(principal)).toBe(true)
      expect(schedule[0].interest.minus(expectedInterest).abs().lessThanOrEqualTo(1)).toBe(true)
    })

    test('매우 긴 기간 (40년)', () => {
      const schedule = generatePaymentSchedule({
        principal: new Decimal('100000000'),
        annualRate: new Decimal('0.035'),
        termMonths: 480,
      })

      expect(schedule.length).toBe(480)
      // 마지막 잔액이 0에 가까운지 확인
      expect(schedule[479].remainingBalance.abs().lessThanOrEqualTo(1)).toBe(true)
    })
  })
})
