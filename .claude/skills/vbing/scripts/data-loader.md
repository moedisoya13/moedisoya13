# 데이터 로더 패턴

## CSV

```python
import pandas as pd
df = pd.read_csv('path/to/file.csv', encoding='utf-8')
# 한글 CSV가 깨질 때: encoding='cp949' 또는 'euc-kr'
```

## Excel

```python
df = pd.read_excel('path/to/file.xlsx', sheet_name=0)   # 첫 시트
df = pd.read_excel('path/to/file.xlsx', sheet_name='매출')  # 이름 지정
```
(`openpyxl` 필요: `pip install openpyxl`)

## JSON

```python
df = pd.read_json('path/to/file.json')
# 중첩 구조: pd.json_normalize(json_obj)
```

## 데이터 확인 루틴 (항상 실행)

```python
print("Shape:", df.shape)
print("\nDtypes:"); print(df.dtypes)
print("\nHead:"); print(df.head())
print("\nDescribe:"); print(df.describe(include='all'))
print("\nMissing:"); print(df.isnull().sum())
```

## 인라인 값 → DataFrame

사용자가 `[A:30, B:25, O:40]` 형태로 값을 줄 때:

```python
data = {'A': 30, 'B': 25, 'O': 40, 'AB': 5}
df = pd.DataFrame({'혈액형': list(data.keys()), '인원': list(data.values())})
```

또는 단순 리스트만 필요할 때:

```python
labels = ['A', 'B', 'O', 'AB']
values = [30, 25, 40, 5]
```

## 흔한 이슈

| 증상 | 원인 | 해결 |
|---|---|---|
| 한글 깨짐 | 인코딩 불일치 | `encoding='cp949'` |
| 날짜가 문자열 | 자동 파싱 실패 | `parse_dates=['날짜컬럼']` |
| 숫자가 문자열 | 쉼표/통화 기호 | `df[col].str.replace(',','').astype(float)` |
| 첫 행이 헤더 아님 | 메타 행 | `skiprows=N` |
| NaN 많음 | 결측값 | `df.dropna()` 또는 `df.fillna(0)` |
