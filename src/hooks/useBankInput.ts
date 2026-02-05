import { useState, useCallback } from 'react'
import Decimal from 'decimal.js'
import type { RateType, BaseRateType } from '../models/types'

export interface BankInputState {
  bankName: string
  loanAmount: string
  loanPeriodYears: string
  rateType: RateType
  annualRate: string
  baseRateType: BaseRateType
  baseRate: string
  spreadRate: string
  // 중도상환
  enablePrepayment: boolean
  prepaymentAmount: string
  prepaymentMonth: string
  prepaymentFeeRate: string
  exemptionMonths: string
}

export interface BankInputValidation {
  isValid: boolean
  errors: Partial<Record<keyof BankInputState, string>>
}

const initialState: BankInputState = {
  bankName: '',
  loanAmount: '',
  loanPeriodYears: '',
  rateType: 'fixed',
  annualRate: '',
  baseRateType: 'COFIX',
  baseRate: '',
  spreadRate: '',
  enablePrepayment: false,
  prepaymentAmount: '',
  prepaymentMonth: '',
  prepaymentFeeRate: '1.5',
  exemptionMonths: '36',
}

export function useBankInput(defaultBankName: string = '') {
  const [state, setState] = useState<BankInputState>({
    ...initialState,
    bankName: defaultBankName,
  })

  const updateField = useCallback(<K extends keyof BankInputState>(
    field: K,
    value: BankInputState[K]
  ) => {
    setState((prev) => ({ ...prev, [field]: value }))
  }, [])

  const reset = useCallback(() => {
    setState({ ...initialState, bankName: defaultBankName })
  }, [defaultBankName])

  const validate = useCallback((): BankInputValidation => {
    const errors: Partial<Record<keyof BankInputState, string>> = {}

    // 은행명
    if (!state.bankName.trim()) {
      errors.bankName = '은행명을 입력해주세요'
    }

    // 대출금액
    const loanAmount = parseFloat(state.loanAmount.replace(/,/g, ''))
    if (!state.loanAmount || isNaN(loanAmount)) {
      errors.loanAmount = '대출금액을 입력해주세요'
    } else if (loanAmount < 10000000) {
      errors.loanAmount = '최소 1,000만원 이상이어야 합니다'
    } else if (loanAmount > 5000000000) {
      errors.loanAmount = '최대 50억원까지 가능합니다'
    }

    // 대출기간
    const years = parseInt(state.loanPeriodYears, 10)
    if (!state.loanPeriodYears || isNaN(years)) {
      errors.loanPeriodYears = '대출기간을 입력해주세요'
    } else if (years < 1) {
      errors.loanPeriodYears = '최소 1년 이상이어야 합니다'
    } else if (years > 40) {
      errors.loanPeriodYears = '최대 40년까지 가능합니다'
    }

    // 금리
    if (state.rateType === 'fixed') {
      const rate = parseFloat(state.annualRate)
      if (!state.annualRate || isNaN(rate)) {
        errors.annualRate = '금리를 입력해주세요'
      } else if (rate <= 0) {
        errors.annualRate = '0보다 큰 값을 입력해주세요'
      } else if (rate > 20) {
        errors.annualRate = '20% 이하여야 합니다'
      }
    } else {
      const baseRate = parseFloat(state.baseRate)
      const spreadRate = parseFloat(state.spreadRate)

      if (!state.baseRate || isNaN(baseRate)) {
        errors.baseRate = '기준금리를 입력해주세요'
      } else if (baseRate < 0 || baseRate > 10) {
        errors.baseRate = '0~10% 범위여야 합니다'
      }

      if (!state.spreadRate || isNaN(spreadRate)) {
        errors.spreadRate = '가산금리를 입력해주세요'
      } else if (spreadRate < 0 || spreadRate > 10) {
        errors.spreadRate = '0~10% 범위여야 합니다'
      }
    }

    // 중도상환
    if (state.enablePrepayment) {
      const prepaymentAmount = parseFloat(state.prepaymentAmount.replace(/,/g, ''))
      if (!state.prepaymentAmount || isNaN(prepaymentAmount)) {
        errors.prepaymentAmount = '중도상환금액을 입력해주세요'
      } else if (prepaymentAmount <= 0) {
        errors.prepaymentAmount = '0보다 큰 값을 입력해주세요'
      } else if (prepaymentAmount > loanAmount) {
        errors.prepaymentAmount = '대출금액보다 클 수 없습니다'
      }

      const prepaymentMonth = parseInt(state.prepaymentMonth, 10)
      const totalMonths = years * 12
      if (!state.prepaymentMonth || isNaN(prepaymentMonth)) {
        errors.prepaymentMonth = '상환시점을 입력해주세요'
      } else if (prepaymentMonth < 1) {
        errors.prepaymentMonth = '1개월 이상이어야 합니다'
      } else if (prepaymentMonth > totalMonths) {
        errors.prepaymentMonth = `${totalMonths}개월 이하여야 합니다`
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    }
  }, [state])

  const toCalculationInput = useCallback(() => {
    const loanAmount = new Decimal(state.loanAmount.replace(/,/g, '') || '0')
    const years = parseInt(state.loanPeriodYears, 10) || 0

    let annualRate: Decimal
    if (state.rateType === 'fixed') {
      annualRate = new Decimal(state.annualRate || '0').dividedBy(100)
    } else {
      const base = new Decimal(state.baseRate || '0')
      const spread = new Decimal(state.spreadRate || '0')
      annualRate = base.plus(spread).dividedBy(100)
    }

    return {
      bankName: state.bankName,
      principal: loanAmount,
      annualRate,
      termMonths: years * 12,
      prepayment: state.enablePrepayment
        ? {
            amount: new Decimal(state.prepaymentAmount.replace(/,/g, '') || '0'),
            month: parseInt(state.prepaymentMonth, 10) || 0,
            feeRate: new Decimal(state.prepaymentFeeRate || '0').dividedBy(100),
            exemptionMonths: parseInt(state.exemptionMonths, 10) || 0,
            type: 'partial' as const,
          }
        : undefined,
    }
  }, [state])

  return {
    state,
    updateField,
    reset,
    validate,
    toCalculationInput,
  }
}

export default useBankInput
