import { useState, useCallback } from 'react'
import { BankInputCard } from './components/BankInputCard'
import { ComparisonDashboard } from './components/ComparisonDashboard'
import type { BankResult } from './components/ComparisonDashboard'
import { PaymentScheduleChart } from './components/PaymentScheduleChart'
import type { ScheduleData } from './components/PaymentScheduleChart'
import { Button } from './components/common'
import { useBankInput } from './hooks/useBankInput'
import { calculateMortgage } from './calculators/mortgage'
import { calculatePrepaymentFee } from './calculators/prepayment'
import { generatePaymentSchedule } from './calculators/schedule'
import type { LoanInput } from './models/types'

const BANK_COLORS = ['#10b981', '#f59e0b', '#8b5cf6']

function App() {
  const [results, setResults] = useState<BankResult[]>([])
  const [schedules, setSchedules] = useState<ScheduleData[]>([])
  const [isCalculating, setIsCalculating] = useState(false)
  const [activeBanks, setActiveBanks] = useState<Set<1 | 2 | 3>>(new Set([1]))

  // 각 은행 입력 훅
  const bank1 = useBankInput('A은행')
  const bank2 = useBankInput('B은행')
  const bank3 = useBankInput('C은행')

  const bankInputs = { 1: bank1, 2: bank2, 3: bank3 } as const

  const toggleBank = (bankIndex: 1 | 2 | 3) => {
    setActiveBanks((prev) => {
      const next = new Set(prev)
      if (next.has(bankIndex)) {
        // 최소 1개는 유지
        if (next.size > 1) {
          next.delete(bankIndex)
        }
      } else {
        next.add(bankIndex)
      }
      return next
    })
  }

  const handleCalculate = useCallback(() => {
    setIsCalculating(true)

    try {
      const newResults: BankResult[] = []
      const newSchedules: ScheduleData[] = []

      const activeBankList = Array.from(activeBanks).sort()

      for (const bankIndex of activeBankList) {
        const bankInput = bankInputs[bankIndex]
        const validation = bankInput.validate()

        if (!validation.isValid) {
          alert(`${bankInput.state.bankName}의 입력값을 확인해주세요.`)
          setIsCalculating(false)
          return
        }

        const input = bankInput.toCalculationInput()

        // 대출 계산
        const loanInput: LoanInput = {
          principal: input.principal,
          annualRate: input.annualRate,
          termMonths: input.termMonths,
        }

        const payment = calculateMortgage(loanInput)
        const schedule = generatePaymentSchedule(loanInput)

        // 중도상환 계산
        let prepaymentFee = undefined
        if (input.prepayment) {
          prepaymentFee = calculatePrepaymentFee({
            amount: input.prepayment.amount,
            month: input.prepayment.month,
            feeRate: input.prepayment.feeRate,
            exemptionMonths: input.prepayment.exemptionMonths,
            type: input.prepayment.type,
          })
        }

        newResults.push({
          bankName: input.bankName,
          payment,
          prepaymentFee,
        })

        newSchedules.push({
          bankName: input.bankName,
          schedule,
          color: BANK_COLORS[bankIndex - 1],
        })
      }

      setResults(newResults)
      setSchedules(newSchedules)
    } catch (error) {
      console.error('계산 오류:', error)
      alert('계산 중 오류가 발생했습니다. 입력값을 확인해주세요.')
    } finally {
      setIsCalculating(false)
    }
  }, [activeBanks, bankInputs])

  const handleReset = useCallback(() => {
    bank1.reset()
    bank2.reset()
    bank3.reset()
    setResults([])
    setSchedules([])
    setActiveBanks(new Set([1]))
  }, [bank1, bank2, bank3])

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            주택담보대출 비교 계산기
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            최대 3개 은행의 대출 조건을 비교하세요
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Bank Toggle */}
        <section className="mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium text-gray-700">비교할 은행 선택:</span>
            <div className="flex gap-2">
              {([1, 2, 3] as const).map((index) => (
                <Button
                  key={index}
                  variant={activeBanks.has(index) ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => toggleBank(index)}
                >
                  {index === 1 ? 'A은행' : index === 2 ? 'B은행' : 'C은행'}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {/* Input Cards */}
        <section className="mb-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {([1, 2, 3] as const).map(
              (index) =>
                activeBanks.has(index) && (
                  <BankInputCard key={index} bankIndex={index} />
                )
            )}
          </div>
        </section>

        {/* Action Buttons */}
        <section className="flex justify-center gap-4 mb-10">
          <Button variant="secondary" onClick={handleReset}>
            초기화
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handleCalculate}
            loading={isCalculating}
          >
            계산하기
          </Button>
        </section>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-8">
            <section>
              <ComparisonDashboard results={results} />
            </section>

            <section>
              <PaymentScheduleChart schedules={schedules} />
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            본 계산기는 참고용이며, 실제 대출 조건은 은행에 문의하세요.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
