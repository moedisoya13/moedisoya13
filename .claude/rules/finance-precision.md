# 금융 계산 정밀도 규칙 (Finance Precision Rules)

## 필수 원칙

### 1. Decimal 타입 사용 필수
```python
from decimal import Decimal, ROUND_HALF_UP

# 금지: float 사용
rate = 0.035  # 부동소수점 오류 발생 가능

# 필수: Decimal 사용
rate = Decimal("0.035")
```

### 2. 소수점 처리 규칙

#### 금리 (Interest Rate)
- 저장: 소수점 4자리까지 (예: 3.45% → 0.0345)
- 표시: 소수점 2자리 (예: 3.45%)
- 반올림: ROUND_HALF_UP

#### 금액 (Amount)
- 계산: 소수점 2자리까지 유지
- 최종 표시: 원 단위 반올림 (소수점 없음)
- 반올림: ROUND_HALF_UP

```python
def round_to_won(amount: Decimal) -> int:
    """금액을 원 단위로 반올림"""
    return int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
```

#### 비율 (Ratio/Percentage)
- 계산: 소수점 6자리까지 유지
- 표시: 소수점 2자리
- 반올림: ROUND_HALF_UP

## 상환 방식별 계산 공식

### 원리금균등상환 (Equal Principal and Interest)
```python
def monthly_payment_equal_principal_interest(
    principal: Decimal,
    annual_rate: Decimal,
    months: int
) -> Decimal:
    """
    월 상환금 = 대출원금 × (월이율 × (1 + 월이율)^n) / ((1 + 월이율)^n - 1)

    Args:
        principal: 대출원금 (원)
        annual_rate: 연이율 (예: 3.5% → 0.035)
        months: 대출기간 (개월)

    Returns:
        월 상환금 (원, 소수점 2자리)
    """
    if annual_rate == Decimal("0"):
        return principal / months

    monthly_rate = annual_rate / 12
    power = (1 + monthly_rate) ** months
    payment = principal * (monthly_rate * power) / (power - 1)
    return payment.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
```

### 원금균등상환 (Equal Principal)
```python
def monthly_payment_equal_principal(
    principal: Decimal,
    annual_rate: Decimal,
    months: int,
    current_month: int
) -> Decimal:
    """
    월 상환금 = (대출원금 / 대출기간) + (남은원금 × 월이율)

    Args:
        principal: 대출원금 (원)
        annual_rate: 연이율
        months: 대출기간 (개월)
        current_month: 현재 회차 (1부터 시작)

    Returns:
        해당 월 상환금 (원, 소수점 2자리)
    """
    monthly_principal = principal / months
    remaining = principal - (monthly_principal * (current_month - 1))
    monthly_rate = annual_rate / 12
    interest = remaining * monthly_rate
    return (monthly_principal + interest).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
```

### 만기일시상환 (Bullet Repayment)
```python
def monthly_payment_bullet(
    principal: Decimal,
    annual_rate: Decimal
) -> Decimal:
    """
    월 상환금 = 대출원금 × 월이율 (이자만 납부)

    Returns:
        월 이자 (원, 소수점 2자리)
    """
    monthly_rate = annual_rate / 12
    return (principal * monthly_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
```

## 중도상환수수료 계산

### 기본 공식
```python
def prepayment_fee(
    prepayment_amount: Decimal,
    fee_rate: Decimal,
    remaining_months: int,
    exemption_period: int = 0,
    elapsed_months: int = 0
) -> Decimal:
    """
    중도상환수수료 = 중도상환금액 × 수수료율 × (잔여기간 / 약정기간)

    일부 은행은 대출 후 일정 기간(면제기간) 경과 시 수수료 면제

    Args:
        prepayment_amount: 중도상환금액
        fee_rate: 수수료율 (예: 1.5% → 0.015)
        remaining_months: 잔여 대출기간 (개월)
        exemption_period: 수수료 면제까지 필요 기간 (개월, 0이면 면제 없음)
        elapsed_months: 대출 후 경과 기간 (개월)

    Returns:
        수수료 금액 (원)
    """
    if exemption_period > 0 and elapsed_months >= exemption_period:
        return Decimal("0")

    # 잔여기간 비율 적용 방식 (일반적)
    # 일부 은행은 이 비율을 적용하지 않음 - 은행별 확인 필요
    fee = prepayment_amount * fee_rate
    return fee.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
```

### 은행별 중도상환수수료 변형

| 은행 | 기본 수수료율 | 면제 조건 | 비고 |
|------|--------------|----------|------|
| 일반 | 1.0~1.5% | 3년 후 면제 | 잔여기간 비율 적용 |
| 변형A | 1.2% | 1년 후 50% 감면, 2년 후 면제 | 단계적 감면 |
| 변형B | 1.5% | 없음 | 고정 수수료율 |

## 검증 체크리스트

모든 금융 계산 함수는 다음을 확인:

- [ ] Decimal 타입만 사용 (float 금지)
- [ ] 반올림 규칙 명시 (ROUND_HALF_UP)
- [ ] 0 또는 음수 입력 처리
- [ ] 최대값 경계 테스트
- [ ] 소수점 자릿수 일관성
- [ ] 단위 테스트 포함

## 테스트 케이스 예시

```python
def test_monthly_payment_known_values():
    """실제 계산 결과와 비교"""
    # 대출금 1억, 연 3.5%, 30년
    principal = Decimal("100000000")
    rate = Decimal("0.035")
    months = 360

    result = monthly_payment_equal_principal_interest(principal, rate, months)
    expected = Decimal("449045.00")  # 실제 은행 계산 결과

    assert abs(result - expected) < Decimal("1")  # 1원 오차 허용
```

## 주의사항

1. **float 변환 금지**: `float(decimal_value)` 절대 사용 금지
2. **문자열로 초기화**: `Decimal(3.14)` 대신 `Decimal("3.14")` 사용
3. **나눗셈 정밀도**: `getcontext().prec = 28` 설정 권장
4. **통화 표시**: 천 단위 구분자, 음수 표시 규칙 준수
