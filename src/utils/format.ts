import Decimal from 'decimal.js'

/**
 * 금액을 원화 형식으로 포맷팅
 * @param amount - 금액 (Decimal 또는 number)
 * @param options - 포맷 옵션
 * @returns 포맷팅된 문자열 (예: "1,234,567원")
 */
export function formatCurrency(
  amount: Decimal | number,
  options: {
    /** 통화 단위 표시 여부 */
    showUnit?: boolean
    /** 음수 표시 방식 */
    negativeFormat?: 'minus' | 'parentheses'
    /** 소수점 자리수 */
    decimals?: number
  } = {}
): string {
  const { showUnit = true, negativeFormat = 'minus', decimals = 0 } = options

  const value = amount instanceof Decimal ? amount : new Decimal(amount)
  const isNegative = value.lessThan(0)
  const absValue = value.abs()

  // 소수점 처리 및 반올림
  const rounded = absValue.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP)

  // 천 단위 구분자 추가
  const parts = rounded.toFixed(decimals).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const formatted = parts.join('.')

  // 음수 처리
  let result: string
  if (isNegative) {
    if (negativeFormat === 'parentheses') {
      result = `(${formatted})`
    } else {
      result = `-${formatted}`
    }
  } else {
    result = formatted
  }

  // 단위 추가
  return showUnit ? `${result}원` : result
}

/**
 * 퍼센트 형식으로 포맷팅
 * @param rate - 비율 (0.035 = 3.5%)
 * @param decimals - 소수점 자리수 (기본 2)
 * @returns 포맷팅된 문자열 (예: "3.50%")
 */
export function formatPercent(rate: Decimal | number, decimals: number = 2): string {
  const value = rate instanceof Decimal ? rate : new Decimal(rate)
  const percent = value.times(100).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP)
  return `${percent.toFixed(decimals)}%`
}

/**
 * 기간을 년/개월 형식으로 포맷팅
 * @param months - 개월 수
 * @returns 포맷팅된 문자열 (예: "30년", "2년 6개월")
 */
export function formatPeriod(months: number): string {
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12

  if (remainingMonths === 0) {
    return `${years}년`
  }

  if (years === 0) {
    return `${remainingMonths}개월`
  }

  return `${years}년 ${remainingMonths}개월`
}

/**
 * 큰 금액을 축약 형식으로 포맷팅
 * @param amount - 금액
 * @returns 축약된 문자열 (예: "1억", "5,000만원")
 */
export function formatCompactCurrency(amount: Decimal | number): string {
  const value = amount instanceof Decimal ? amount.toNumber() : amount

  if (value >= 100000000) {
    const billions = value / 100000000
    return billions % 1 === 0 ? `${billions}억원` : `${billions.toFixed(1)}억원`
  }

  if (value >= 10000000) {
    const millions = value / 10000
    return `${Math.round(millions).toLocaleString()}만원`
  }

  if (value >= 10000) {
    const millions = value / 10000
    return `${millions.toLocaleString()}만원`
  }

  return formatCurrency(value)
}

/**
 * 숫자를 한글 금액으로 변환
 * @param amount - 금액
 * @returns 한글 금액 (예: "일억 이천삼백만원")
 */
export function formatKoreanCurrency(amount: number): string {
  if (amount === 0) return '영원'

  const units = ['', '만', '억', '조']
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  const subUnits = ['', '십', '백', '천']

  let result = ''
  let unitIndex = 0

  while (amount > 0) {
    const chunk = amount % 10000
    if (chunk > 0) {
      let chunkStr = ''
      let tempChunk = chunk
      let subUnitIndex = 0

      while (tempChunk > 0) {
        const digit = tempChunk % 10
        if (digit > 0) {
          const digitStr = subUnitIndex > 0 && digit === 1 ? '' : digits[digit]
          chunkStr = digitStr + subUnits[subUnitIndex] + chunkStr
        }
        tempChunk = Math.floor(tempChunk / 10)
        subUnitIndex++
      }

      result = chunkStr + units[unitIndex] + ' ' + result
    }
    amount = Math.floor(amount / 10000)
    unitIndex++
  }

  return result.trim() + '원'
}
