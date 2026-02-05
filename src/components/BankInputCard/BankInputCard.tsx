import React from 'react'
import { Card, Input, Select, Button } from '../common'
import { useBankInput, BankInputState } from '../../hooks/useBankInput'

export interface BankInputCardProps {
  /** 은행 인덱스 (1, 2, 3) */
  bankIndex: 1 | 2 | 3
  /** 데이터 변경 콜백 */
  onDataChange?: (data: ReturnType<ReturnType<typeof useBankInput>['toCalculationInput']>) => void
  /** 유효성 상태 변경 콜백 */
  onValidChange?: (isValid: boolean) => void
}

const BANK_THEMES = {
  1: 'bank1',
  2: 'bank2',
  3: 'bank3',
} as const

const DEFAULT_BANK_NAMES = {
  1: 'A은행',
  2: 'B은행',
  3: 'C은행',
}

const RATE_TYPE_OPTIONS = [
  { value: 'fixed', label: '고정금리' },
  { value: 'variable', label: '변동금리' },
]

const BASE_RATE_TYPE_OPTIONS = [
  { value: 'COFIX', label: 'COFIX' },
  { value: 'MOR', label: 'MOR' },
  { value: 'CD', label: 'CD금리' },
  { value: 'CUSTOM', label: '직접입력' },
]

export const BankInputCard: React.FC<BankInputCardProps> = ({
  bankIndex,
  onDataChange: _onDataChange,
  onValidChange,
}) => {
  void _onDataChange // Unused but kept for API compatibility
  const { state, updateField, reset, validate } = useBankInput(DEFAULT_BANK_NAMES[bankIndex])
  const validation = validate()

  const handleChange = (field: keyof BankInputState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = e.target.type === 'checkbox'
      ? (e.target as HTMLInputElement).checked
      : e.target.value

    updateField(field, value as BankInputState[typeof field])
  }

  const formatNumber = (value: string): string => {
    const num = value.replace(/[^\d]/g, '')
    if (!num) return ''
    return parseInt(num, 10).toLocaleString('ko-KR')
  }

  const handleAmountChange = (field: 'loanAmount' | 'prepaymentAmount') => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const formatted = formatNumber(e.target.value)
    updateField(field, formatted)
  }

  React.useEffect(() => {
    onValidChange?.(validation.isValid)
  }, [validation.isValid, onValidChange])

  return (
    <Card
      title={state.bankName || DEFAULT_BANK_NAMES[bankIndex]}
      colorTheme={BANK_THEMES[bankIndex]}
      headerAction={
        <Button variant="ghost" size="sm" onClick={reset}>
          초기화
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 은행명 */}
        <Input
          label="은행명"
          value={state.bankName}
          onChange={handleChange('bankName')}
          error={validation.errors.bankName}
          placeholder="은행명 입력"
        />

        {/* 대출금액 */}
        <Input
          label="대출금액"
          value={state.loanAmount}
          onChange={handleAmountChange('loanAmount')}
          error={validation.errors.loanAmount}
          placeholder="100,000,000"
          suffix="원"
          inputMode="numeric"
          hint="1천만원 ~ 50억원"
        />

        {/* 대출기간 */}
        <Input
          label="대출기간"
          type="number"
          value={state.loanPeriodYears}
          onChange={handleChange('loanPeriodYears')}
          error={validation.errors.loanPeriodYears}
          placeholder="30"
          suffix="년"
          min={1}
          max={40}
          hint="1년 ~ 40년"
        />

        {/* 금리 유형 */}
        <Select
          label="금리 유형"
          options={RATE_TYPE_OPTIONS}
          value={state.rateType}
          onChange={handleChange('rateType')}
        />

        {/* 고정금리 입력 */}
        {state.rateType === 'fixed' && (
          <Input
            label="연이율"
            type="number"
            value={state.annualRate}
            onChange={handleChange('annualRate')}
            error={validation.errors.annualRate}
            placeholder="3.5"
            suffix="%"
            step="0.01"
            min={0.1}
            max={20}
          />
        )}

        {/* 변동금리 입력 */}
        {state.rateType === 'variable' && (
          <>
            <Select
              label="기준금리 종류"
              options={BASE_RATE_TYPE_OPTIONS}
              value={state.baseRateType}
              onChange={handleChange('baseRateType')}
            />
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
              <Input
                label="기준금리"
                type="number"
                value={state.baseRate}
                onChange={handleChange('baseRate')}
                error={validation.errors.baseRate}
                placeholder="3.0"
                suffix="%"
                step="0.01"
              />
              <span className="pb-2 text-gray-400 font-medium">+</span>
              <Input
                label="가산금리"
                type="number"
                value={state.spreadRate}
                onChange={handleChange('spreadRate')}
                error={validation.errors.spreadRate}
                placeholder="1.5"
                suffix="%"
                step="0.01"
              />
            </div>
            {state.baseRate && state.spreadRate && (
              <p className="text-sm text-gray-600 text-right">
                총 금리: <strong className="text-blue-600">{(parseFloat(state.baseRate) + parseFloat(state.spreadRate)).toFixed(2)}%</strong>
              </p>
            )}
          </>
        )}

        {/* 중도상환 토글 */}
        <div className="pt-4 mt-2 border-t border-gray-100">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={state.enablePrepayment}
              onChange={handleChange('enablePrepayment')}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm font-medium text-gray-700">중도상환 시뮬레이션</span>
          </label>
        </div>

        {/* 중도상환 입력 */}
        {state.enablePrepayment && (
          <div className="flex flex-col gap-4 p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <Input
              label="중도상환금액"
              value={state.prepaymentAmount}
              onChange={handleAmountChange('prepaymentAmount')}
              error={validation.errors.prepaymentAmount}
              placeholder="50,000,000"
              suffix="원"
              inputMode="numeric"
            />
            <Input
              label="상환시점"
              type="number"
              value={state.prepaymentMonth}
              onChange={handleChange('prepaymentMonth')}
              error={validation.errors.prepaymentMonth}
              placeholder="24"
              suffix="개월 후"
              min={1}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="수수료율"
                type="number"
                value={state.prepaymentFeeRate}
                onChange={handleChange('prepaymentFeeRate')}
                placeholder="1.5"
                suffix="%"
                step="0.1"
              />
              <Input
                label="면제기간"
                type="number"
                value={state.exemptionMonths}
                onChange={handleChange('exemptionMonths')}
                placeholder="36"
                suffix="개월"
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

export default BankInputCard
