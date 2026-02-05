import React from 'react'
import Decimal from 'decimal.js'
import { Card } from '../common'
import { formatCurrency, formatCompactCurrency } from '../../utils/format'
import type { MonthlyPaymentResult, PrepaymentFeeResult } from '../../models/types'

export interface BankResult {
  bankName: string
  payment: MonthlyPaymentResult
  prepaymentFee?: PrepaymentFeeResult
}

export interface ComparisonDashboardProps {
  /** 은행별 계산 결과 (최대 3개) */
  results: BankResult[]
}

interface ComparisonItemProps {
  label: string
  values: { bankName: string; value: Decimal; color: string }[]
  format: 'currency' | 'compact'
  highlight?: 'lowest' | 'highest'
}

const BANK_COLORS = ['#10b981', '#f59e0b', '#8b5cf6']

const ComparisonItem: React.FC<ComparisonItemProps> = ({
  label,
  values,
  format,
  highlight = 'lowest',
}) => {
  // 최저/최고값 찾기
  const sortedValues = [...values].sort((a, b) =>
    highlight === 'lowest'
      ? a.value.minus(b.value).toNumber()
      : b.value.minus(a.value).toNumber()
  )
  const bestValue = sortedValues[0]?.value

  return (
    <div className="py-4 border-b border-gray-100 last:border-b-0">
      <h4 className="text-sm font-medium text-gray-500 mb-3">{label}</h4>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${values.length}, 1fr)` }}>
        {values.map((item) => {
          const isBest = bestValue && item.value.equals(bestValue)
          const formatted =
            format === 'compact'
              ? formatCompactCurrency(item.value)
              : formatCurrency(item.value)

          return (
            <div
              key={item.bankName}
              className={`relative p-3 rounded-lg border-2 transition-all ${
                isBest
                  ? 'border-current bg-opacity-5'
                  : 'border-gray-100 bg-gray-50'
              }`}
              style={{
                borderColor: isBest ? item.color : undefined,
                backgroundColor: isBest ? `${item.color}10` : undefined
              }}
            >
              <span className="block text-xs text-gray-500 mb-1">{item.bankName}</span>
              <span
                className="block text-lg font-bold"
                style={{ color: isBest ? item.color : '#374151' }}
              >
                {formatted}
              </span>
              {isBest && (
                <span
                  className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium text-white rounded-full"
                  style={{ backgroundColor: item.color }}
                >
                  최저
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const ComparisonDashboard: React.FC<ComparisonDashboardProps> = ({ results }) => {
  if (results.length === 0) {
    return (
      <Card title="비교 결과">
        <div className="py-12 text-center text-gray-500">
          <p>은행 정보를 입력하고 계산 버튼을 눌러주세요.</p>
        </div>
      </Card>
    )
  }

  const monthlyPayments = results.map((r, i) => ({
    bankName: r.bankName,
    value: r.payment.monthlyPayment,
    color: BANK_COLORS[i],
  }))

  const totalPayments = results.map((r, i) => ({
    bankName: r.bankName,
    value: r.payment.totalPayment,
    color: BANK_COLORS[i],
  }))

  const totalInterests = results.map((r, i) => ({
    bankName: r.bankName,
    value: r.payment.totalInterest,
    color: BANK_COLORS[i],
  }))

  const prepaymentFees = results
    .filter((r) => r.prepaymentFee)
    .map((r, i) => ({
      bankName: r.bankName,
      value: r.prepaymentFee!.fee,
      color: BANK_COLORS[i],
    }))

  // 최저 총 상환금액 은행 찾기
  const bestBank = [...results].sort((a, b) =>
    a.payment.totalPayment.minus(b.payment.totalPayment).toNumber()
  )[0]

  // 최대 절감액 계산
  const worstBank = [...results].sort((a, b) =>
    b.payment.totalPayment.minus(a.payment.totalPayment).toNumber()
  )[0]

  const maxSavings = worstBank.payment.totalPayment.minus(bestBank.payment.totalPayment)

  return (
    <div className="space-y-6">
      {/* 요약 헤더 */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
        <div className="flex items-center justify-between flex-wrap gap-4 py-2">
          <div className="flex flex-col">
            <span className="text-sm text-gray-500 mb-1">가장 유리한 조건</span>
            <span
              className="text-2xl font-bold"
              style={{ color: BANK_COLORS[results.indexOf(bestBank)] }}
            >
              {bestBank.bankName}
            </span>
          </div>
          {maxSavings.greaterThan(0) && (
            <div className="flex flex-col items-end">
              <span className="text-sm text-gray-500 mb-1">최대 절감액</span>
              <span className="text-2xl font-bold text-emerald-600">
                {formatCompactCurrency(maxSavings)}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* 상세 비교 */}
      <Card title="상세 비교">
        <div>
          <ComparisonItem
            label="월 상환금"
            values={monthlyPayments}
            format="currency"
            highlight="lowest"
          />

          <ComparisonItem
            label="총 상환금액"
            values={totalPayments}
            format="compact"
            highlight="lowest"
          />

          <ComparisonItem
            label="총 이자"
            values={totalInterests}
            format="compact"
            highlight="lowest"
          />

          {prepaymentFees.length > 0 && (
            <ComparisonItem
              label="중도상환수수료"
              values={prepaymentFees}
              format="currency"
              highlight="lowest"
            />
          )}
        </div>
      </Card>

      {/* 은행별 상세 정보 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result, index) => (
          <Card
            key={result.bankName}
            title={result.bankName}
            colorTheme={(['bank1', 'bank2', 'bank3'] as const)[index]}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">월 상환금</span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(result.payment.monthlyPayment)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">총 상환금액</span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCompactCurrency(result.payment.totalPayment)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">총 이자</span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCompactCurrency(result.payment.totalInterest)}
                </span>
              </div>
              {result.prepaymentFee && (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 mb-1">중도상환수수료</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {result.prepaymentFee.isExempted
                      ? '면제'
                      : formatCurrency(result.prepaymentFee.fee)}
                  </span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default ComparisonDashboard
