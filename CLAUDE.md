# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

**주택담보대출(주담대) 비교 계산기 웹 앱**

최대 3개 은행의 금리, 대출가액, 중도상환수수료를 비교하는 금융 계산기입니다.

### 핵심 기능
- 최대 3개 은행 대출 조건 동시 비교
- 월 상환금 계산 (원리금균등/원금균등/만기일시)
- 중도상환수수료 계산 및 시뮬레이션
- 총 상환금액 비교 분석

## Code Style & Conventions

### Python Standards
- Follow PEP 8 style guidelines
- Use type hints for function signatures
- Prefer f-strings for string formatting
- Use meaningful variable and function names
- Use Decimal for all financial calculations (see .claude/rules/finance-precision.md)

### Documentation
- Include docstrings for all public functions, classes, and modules
- Use Google-style docstrings consistently
- Add inline comments for complex financial logic
- Document all calculation formulas with references

### Project Structure
```
mortgage-calculator/
├── src/
│   ├── calculators/      # 금융 계산 로직
│   ├── models/           # 데이터 모델
│   ├── api/              # API 엔드포인트
│   └── utils/            # 유틸리티 함수
├── frontend/             # UI 컴포넌트
├── tests/                # 테스트 코드
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/                 # 문서
```

## Development Practices

### Testing (필수)
- **모든 금융 계산 로직은 테스트 필수** (최소 80% 커버리지)
- 경계값 테스트 포함 (0원, 최대금액, 소수점 경계)
- 실제 은행 시나리오 기반 테스트 케이스
- pytest 사용

### Error Handling
- 금융 계산 오류는 명확한 메시지와 함께 예외 발생
- 사용자 입력 유효성 검사 필수
- 계산 결과의 범위 검증

### Dependencies
- Use virtual environments (venv)
- Keep requirements.txt updated
- Pin dependency versions for reproducibility

## Common Commands

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest --cov=src --cov-report=html

# Format code
black .

# Check types
mypy src/
```

## 에이전트 위임 구조

### logic-auditor (금융 로직 검증)
- 모든 금융 계산 공식 검증
- 소수점 처리 규칙 준수 확인
- 엣지 케이스 테스트 검토

### ui-specialist (UI 구현)
- 사용자 인터페이스 컴포넌트 개발
- 반응형 디자인 구현
- 접근성 준수

## Preferences

### 호칭
- 사용자를 **"뚜님"** 으로 부른다. 다른 호칭(사장님 등)을 임의로 붙이지 않는다.

### 작업
- 금융 계산은 정확성 우선 (성능보다 정확성)
- 모든 금액은 원 단위로 처리
- 복잡한 계산식은 단계별로 분리하여 검증 가능하게
