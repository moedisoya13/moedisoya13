# Karpathy MicroGPT Gist 분석

> **원본**: https://gist.github.com/karpathy/8627fe009c40f57531cb18360106ce95
> **작성자**: Andrej Karpathy (@karpathy)

## 개요

MicroGPT는 **외부 의존성 없이 순수 Python만으로** GPT를 학습하고 추론하는 완전한 구현체이다. `os`, `math`, `random` 세 개의 표준 라이브러리만 사용하며, PyTorch, NumPy 등 어떤 딥러닝/수치 계산 프레임워크도 사용하지 않는다.

작성자의 철학이 코드 첫 줄에 명시되어 있다:

> *"This file is the complete algorithm. Everything else is just efficiency."*

이 코드는 GPT의 **본질적 알고리즘**을 모든 최적화 레이어를 벗겨내고 가장 원자적(atomic) 형태로 보여주는 것이 목적이다.

---

## 구조 분석

코드는 크게 6개의 섹션으로 나뉜다:

### 1. 데이터셋 및 토크나이저

```python
docs = [l.strip() for l in open('input.txt').read().strip().split('\n') if l.strip()]
uchars = sorted(set(''.join(docs)))
BOS = len(uchars)
vocab_size = len(uchars) + 1
```

- **데이터**: Karpathy의 `makemore` 프로젝트에서 사용하는 이름 데이터셋 (`names.txt`)
- **토크나이저**: 문자 단위(character-level) 토큰화. 데이터셋에 등장하는 고유 문자를 정렬하여 각각 0~n-1의 토큰 ID를 부여
- **특수 토큰**: BOS(Beginning of Sequence) 토큰 하나만 사용. 시퀀스의 시작과 끝 모두에 BOS를 배치하여, EOS 역할도 겸함

### 2. Autograd 엔진 (`Value` 클래스)

```python
class Value:
    __slots__ = ('data', 'grad', '_children', '_local_grads')
```

Karpathy의 [micrograd](https://github.com/karpathy/micrograd)와 동일한 스칼라 기반 자동 미분 엔진이다.

**핵심 설계**:
- 각 `Value` 노드는 스칼라 값(`data`), 기울기(`grad`), 자식 노드(`_children`), 로컬 미분값(`_local_grads`)을 저장
- `__slots__`로 메모리 최적화
- 연산자 오버로딩으로 `+`, `*`, `**`, `/`, `-` 등이 자동으로 계산 그래프를 구성
- `backward()`: 위상 정렬(topological sort) 후 역순으로 체인 룰(chain rule) 적용

**지원 연산**: `add`, `mul`, `pow`, `log`, `exp`, `relu`, `neg`, `sub`, `div` (총 9개)

**주목할 점**: 이 autograd 엔진은 **스칼라 단위**로 동작한다. 텐서 연산이 아니라 개별 숫자 하나하나에 대해 계산 그래프를 구성하므로, 실제로 어떤 일이 벌어지는지 완전히 투명하게 드러난다. 대신 매우 느리다 — 이것이 바로 "everything else is just efficiency"의 의미이다.

### 3. 모델 파라미터 초기화

```python
n_embd = 16      # 임베딩 차원
n_head = 4       # 어텐션 헤드 수
n_layer = 1      # 레이어 수
block_size = 16   # 최대 시퀀스 길이
head_dim = 4      # 헤드당 차원 (16 / 4)
```

**state_dict 구조**:

| 파라미터 | 크기 | 설명 |
|---------|------|------|
| `wte` | (vocab_size, 16) | 토큰 임베딩 |
| `wpe` | (16, 16) | 위치 임베딩 |
| `layer0.attn_wq` | (16, 16) | Query 투영 |
| `layer0.attn_wk` | (16, 16) | Key 투영 |
| `layer0.attn_wv` | (16, 16) | Value 투영 |
| `layer0.attn_wo` | (16, 16) | 출력 투영 |
| `layer0.mlp_fc1` | (64, 16) | MLP 첫 번째 레이어 (4x 확장) |
| `layer0.mlp_fc2` | (16, 64) | MLP 두 번째 레이어 |
| `lm_head` | (vocab_size, 16) | 출력 로짓 투영 |

총 파라미터 수는 약 5,000~6,000개 수준 (vocab_size에 따라 변동).

### 4. GPT 모델 아키텍처

GPT-2를 기반으로 하되 다음과 같은 단순화를 적용:

| GPT-2 | MicroGPT | 이유 |
|-------|----------|------|
| LayerNorm | **RMSNorm** | 더 단순 (평균 계산 불필요) |
| GeLU 활성화 | **ReLU** | 더 단순한 구현 |
| Bias 포함 | **Bias 없음** | 파라미터 수 감소 |
| 배치 처리 | **단일 문서** | 구현 단순화 |
| 텐서 연산 | **스칼라 연산** | 완전한 투명성 |

**모델 포워드 패스 흐름**:

```
입력 토큰 → 토큰 임베딩 + 위치 임베딩 → RMSNorm
  → [Transformer 블록] × n_layer:
      → RMSNorm → Multi-Head Attention → Residual Connection
      → RMSNorm → MLP (fc1 → ReLU → fc2) → Residual Connection
  → Linear (lm_head) → 로짓
```

**KV 캐시**: 추론 효율을 위해 `keys`와 `values` 리스트를 유지하며, 이전 토큰의 K/V를 재계산하지 않는다. 이는 학습 시에도 동일하게 적용되는데, 한 문서의 토큰을 순차적으로 처리하면서 KV를 누적한다.

**Attention 구현**:
```python
attn_logits = [sum(q_h[j] * k_h[t][j] for j in range(head_dim)) / head_dim**0.5
               for t in range(len(k_h))]
```
- Scaled dot-product attention을 스칼라 루프로 풀어 구현
- `head_dim**0.5`로 스케일링 (표준 방식)
- Causal masking이 **암시적으로** 적용됨: KV 캐시에는 현재까지의 토큰만 저장되므로, 미래 토큰에 대한 어텐션이 자연스럽게 불가능

### 5. 학습 루프

```python
for step in range(num_steps):  # 1000 스텝
    # 1. 데이터 준비: [BOS] + 문자열 토큰 + [BOS]
    # 2. 순차 포워드: 각 위치에서 다음 토큰 예측
    # 3. 손실 계산: cross-entropy loss의 평균
    # 4. 역전파: loss.backward()
    # 5. Adam 업데이트
```

**학습 특징**:
- **배치 크기 1**: 한 번에 문서 하나만 처리
- **손실 함수**: 평균 cross-entropy (`-log(prob[target])`)
- **옵티마이저**: Adam (bias correction 포함)
  - `lr=0.01`, `beta1=0.85`, `beta2=0.99`
  - beta1이 일반적인 0.9보다 낮음 → 모멘텀의 과거 의존도를 줄임
- **학습률 스케줄**: 선형 감소 (`lr * (1 - step/num_steps)`)

### 6. 추론 (텍스트 생성)

```python
temperature = 0.5
for sample_idx in range(20):
    # BOS에서 시작하여 다음 BOS가 나올 때까지 샘플링
    logits = gpt(token_id, pos_id, keys, values)
    probs = softmax([l / temperature for l in logits])
    token_id = random.choices(range(vocab_size), weights=[p.data for p in probs])[0]
```

- **Temperature sampling**: 0.5로 설정하여 비교적 보수적인(덜 창의적인) 생성
- **종료 조건**: BOS 토큰이 생성되면 시퀀스 종료
- 20개의 새로운 이름을 생성

---

## 핵심 인사이트

### 1. "Everything else is just efficiency"

이 코드의 가장 중요한 메시지이다. 현대 딥러닝 프레임워크의 수만 줄의 코드는 결국 이 ~150줄의 알고리즘을 **빠르게** 실행하기 위한 것이다:

- **텐서 연산** (NumPy, PyTorch): 스칼라 루프를 벡터화
- **GPU 가속** (CUDA): 병렬 연산
- **자동 미분** (autograd): 그래프 구성/역전파 최적화
- **분산 학습**: 데이터/모델 병렬화
- **혼합 정밀도**: FP16/BF16으로 메모리/속도 최적화
- **FlashAttention**: 어텐션 연산의 메모리/속도 최적화
- **KV 캐시 최적화**: PagedAttention 등

이 모든 것은 알고리즘 자체를 바꾸지 않는다. 같은 수학을 더 빠르게 실행할 뿐이다.

### 2. 교육적 설계 선택

- **RMSNorm > LayerNorm**: 평균 계산을 생략하여 코드가 짧아짐
- **ReLU > GeLU**: `max(0, x)` 한 줄로 구현 가능
- **Bias 제거**: 파라미터와 코드 복잡도 감소
- **문자 단위 토큰화**: BPE 같은 서브워드 토크나이저 불필요
- **이름 데이터셋**: 짧은 시퀀스로 빠른 학습 가능

### 3. Autograd의 본질

`Value` 클래스는 자동 미분이 결국 다음 두 가지임을 보여준다:
1. **포워드 패스**: 연산을 수행하면서 계산 그래프를 구성 (각 노드에 로컬 미분값 저장)
2. **백워드 패스**: 위상 정렬 → 역순 순회 → 체인 룰로 기울기 누적

PyTorch의 `torch.autograd`가 하는 일과 **수학적으로 동일**하다. 차이는 텐서 vs 스칼라일 뿐이다.

### 4. Transformer의 본질적 구성 요소

GPT 아키텍처가 결국 다음 4가지 기본 연산의 조합임을 보여준다:
1. **행렬 곱셈** (`linear`): 가중치 × 입력
2. **소프트맥스** (`softmax`): 확률 분포 변환
3. **정규화** (`rmsnorm`): 스케일 안정화
4. **비선형 활성화** (`relu`): 표현력 확보

---

## GPT-2 대비 차이점 정리

| 항목 | GPT-2 | MicroGPT |
|------|-------|----------|
| 정규화 | LayerNorm | RMSNorm |
| 활성화 | GeLU | ReLU |
| Bias | 있음 | 없음 |
| 토큰화 | BPE (50,257 토큰) | 문자 단위 (~27 토큰) |
| 임베딩 차원 | 768 | 16 |
| 어텐션 헤드 | 12 | 4 |
| 레이어 수 | 12 | 1 |
| 컨텍스트 길이 | 1,024 | 16 |
| 파라미터 수 | 117M | ~5K |
| 연산 방식 | 텐서 (GPU) | 스칼라 (CPU) |
| 배치 크기 | 64+ | 1 |
| 학습 스텝 | 수십만 | 1,000 |

---

## 코드 품질 관점

**강점**:
- 극도로 간결하면서도 완전한 구현
- 변수명이 명확하고 ML 관례를 따름
- 주석이 적절히 배치되어 각 섹션의 의도를 설명
- `__slots__` 사용 등 Python 최적화 적용

**의도적 생략** (교육 목적):
- 에러 처리 없음
- 배치 처리 없음
- 체크포인트/저장 없음
- gradient clipping 없음
- 검증 데이터셋 분리 없음

이는 결함이 아니라 **의도적 설계**이다. 핵심 알고리즘 외의 모든 것을 제거하여 본질에 집중한다.

---

## 결론

이 코드는 GPT의 "Hello, World!"이다. ~150줄의 순수 Python으로 Transformer 기반 언어 모델의 학습과 추론을 완전히 구현하며, 현대 딥러닝 스택의 각 레이어가 왜 존재하는지를 역으로 이해할 수 있게 한다. 모든 최적화를 제거했을 때 남는 것은 결국 **행렬 곱셈, 소프트맥스, 정규화, 비선형 활성화**라는 네 가지 기본 연산과 **자동 미분**이라는 하나의 학습 메커니즘이다.
