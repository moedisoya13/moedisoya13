import React, { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import { Card, Button } from '../common'
import type { PaymentScheduleItem } from '../../models/types'

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export interface ScheduleData {
  bankName: string
  schedule: PaymentScheduleItem[]
  color: string
}

export interface PaymentScheduleChartProps {
  /** 은행별 상환 스케줄 */
  schedules: ScheduleData[]
  /** 차트 타입 */
  chartType?: 'balance' | 'breakdown'
}

const CHART_COLORS = {
  bank1: { main: '#10b981', light: 'rgba(16, 185, 129, 0.1)' },
  bank2: { main: '#f59e0b', light: 'rgba(245, 158, 11, 0.1)' },
  bank3: { main: '#8b5cf6', light: 'rgba(139, 92, 246, 0.1)' },
}

export const PaymentScheduleChart: React.FC<PaymentScheduleChartProps> = ({
  schedules,
  chartType: initialType = 'balance',
}) => {
  const [chartType, setChartType] = React.useState(initialType)

  // 레이블 생성 (12개월 단위로 표시)
  const labels = useMemo(() => {
    if (schedules.length === 0) return []
    const maxLength = Math.max(...schedules.map((s) => s.schedule.length))
    return Array.from({ length: maxLength }, (_, i) => {
      const month = i + 1
      if (month % 12 === 0 || month === 1) {
        return `${Math.ceil(month / 12)}년`
      }
      return ''
    })
  }, [schedules])

  // 잔액 변화 차트 데이터
  const balanceChartData = useMemo(() => {
    return {
      labels,
      datasets: schedules.map((data, index) => {
        const colorKey = (['bank1', 'bank2', 'bank3'] as const)[index]
        const colors = CHART_COLORS[colorKey]
        return {
          label: data.bankName,
          data: data.schedule.map((item) => item.remainingBalance.toNumber()),
          borderColor: colors.main,
          backgroundColor: colors.light,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
        }
      }),
    }
  }, [schedules, labels])

  // 원금/이자 분해 차트 데이터 (첫 번째 은행만)
  const breakdownChartData = useMemo(() => {
    if (schedules.length === 0) return null

    const firstSchedule = schedules[0]
    // 12개월 단위로 집계
    const yearlyData: { principal: number; interest: number }[] = []

    for (let i = 0; i < firstSchedule.schedule.length; i += 12) {
      const yearSlice = firstSchedule.schedule.slice(i, i + 12)
      const principal = yearSlice.reduce(
        (sum, item) => sum + item.principal.toNumber(),
        0
      )
      const interest = yearSlice.reduce(
        (sum, item) => sum + item.interest.toNumber(),
        0
      )
      yearlyData.push({ principal, interest })
    }

    return {
      labels: yearlyData.map((_, i) => `${i + 1}년차`),
      datasets: [
        {
          label: '원금',
          data: yearlyData.map((d) => d.principal),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderRadius: 4,
        },
        {
          label: '이자',
          data: yearlyData.map((d) => d.interest),
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderRadius: 4,
        },
      ],
    }
  }, [schedules])

  const balanceOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: unknown) => {
            const ctx = context as { dataset: { label?: string }; parsed: { y: number } }
            const value = ctx.parsed.y
            return `${ctx.dataset.label || ''}: ${Math.round(value).toLocaleString()}원`
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: unknown) => {
            const num = typeof value === 'string' ? parseFloat(value) : (value as number)
            if (num >= 100000000) {
              return `${(num / 100000000).toFixed(1)}억`
            }
            if (num >= 10000) {
              return `${Math.round(num / 10000)}만`
            }
            return num.toString()
          },
        },
      },
    },
  }

  const breakdownOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: unknown) => {
            const ctx = context as { dataset: { label?: string }; parsed: { y: number } }
            const value = ctx.parsed.y
            return `${ctx.dataset.label || ''}: ${Math.round(value).toLocaleString()}원`
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: {
          display: false,
        },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          callback: (value: unknown) => {
            const num = typeof value === 'string' ? parseFloat(value) : (value as number)
            if (num >= 10000) {
              return `${Math.round(num / 10000)}만`
            }
            return num.toString()
          },
        },
      },
    },
  }

  if (schedules.length === 0) {
    return (
      <Card title="상환 스케줄 차트">
        <div className="py-12 text-center text-gray-500">
          <p>계산 결과가 없습니다.</p>
        </div>
      </Card>
    )
  }

  return (
    <Card
      title="상환 스케줄 차트"
      headerAction={
        <div className="flex gap-1">
          <Button
            variant={chartType === 'balance' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setChartType('balance')}
          >
            잔액 변화
          </Button>
          <Button
            variant={chartType === 'breakdown' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setChartType('breakdown')}
          >
            원금/이자 구성
          </Button>
        </div>
      }
    >
      <div className="h-80 w-full">
        {chartType === 'balance' ? (
          <Line data={balanceChartData} options={balanceOptions} />
        ) : (
          breakdownChartData && <Bar data={breakdownChartData} options={breakdownOptions} />
        )}
      </div>
    </Card>
  )
}

export default PaymentScheduleChart
