# 카카오톡 '나에게 보내기' 설정 (최초 1회)

이 자동화는 카카오 REST API 로 **나와의 채팅**에 메시지를 보냅니다.
브라우저 로그인이 필요한 단계가 있어 아래 절차는 사람이 직접 해야 합니다.

## 1. 카카오 개발자 앱 만들기

1. https://developers.kakao.com 에 로그인하고 **내 애플리케이션 → 애플리케이션 추가하기**
2. 생성된 앱의 **앱 키 → REST API 키**를 복사해 둡니다. → 나중에 `KAKAO_REST_API_KEY`

## 2. 카카오 로그인 활성화

1. **제품 설정 → 카카오 로그인 → 활성화 설정 ON**
2. **Redirect URI** 에 `https://localhost` 를 등록합니다.
   (실제 서비스가 아니라 인가 코드를 브라우저 주소창에서 읽어오기 위한 용도입니다.)
3. **제품 설정 → 카카오 로그인 → 동의항목** 에서 **카카오톡 메시지 전송(`talk_message`)** 을
   `이용 중 동의` 로 설정합니다.

## 3. 인가 코드 받기

브라우저 주소창에 아래 주소를 넣고 이동한 뒤 동의합니다. `{REST_API_KEY}` 는 1번에서 복사한 값입니다.

```
https://kauth.kakao.com/oauth/authorize?client_id={REST_API_KEY}&redirect_uri=https://localhost&response_type=code&scope=talk_message
```

동의하면 `https://localhost/?code=XXXXXXXX` 로 이동합니다.
(페이지는 열리지 않아도 정상입니다.) 주소창의 **`code=` 뒤 값**을 복사합니다.

## 4. refresh_token 발급

터미널에서 아래를 실행합니다. `{CODE}` 는 3번에서 복사한 값입니다.

```bash
curl -X POST 'https://kauth.kakao.com/oauth/token' \
  -d 'grant_type=authorization_code' \
  -d 'client_id={REST_API_KEY}' \
  -d 'redirect_uri=https://localhost' \
  -d 'code={CODE}'
```

응답의 **`refresh_token`** 값을 복사합니다. → `KAKAO_REFRESH_TOKEN`

> 인가 코드는 1회용이며 곧 만료됩니다. 실패하면 3번부터 다시 하세요.

## 5. GitHub Secrets 등록

저장소 **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 | 필수 |
|---|---|---|
| `KAKAO_REST_API_KEY` | 1번의 REST API 키 | 발송에 필요 |
| `KAKAO_REFRESH_TOKEN` | 4번의 refresh_token | 발송에 필요 |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | 요약에 필요 |
| `GH_PAT` | fine-grained PAT | 선택 |

앞의 둘이 없으면 워크플로는 실패하지 않고 **발송만 건너뛴 채** 수집·요약 결과를 로그에 남깁니다.
등록하는 순간 다음 실행부터 자동으로 보내기 시작합니다.

## 6. 토큰 만료 대비 (중요)

카카오 `refresh_token` 의 유효기간은 **약 2개월**입니다. 그대로 두면 어느 날 조용히 발송이 멈춥니다.

- **`GH_PAT` 를 등록해 두면** 카카오가 새 refresh_token 을 내려줄 때
  워크플로가 `KAKAO_REFRESH_TOKEN` 시크릿을 자동으로 갈아끼웁니다.
  PAT 는 **fine-grained**, **이 저장소만**, 권한은 **Secrets: Read and write** 하나만 주세요.
- **등록하지 않으면** 대신 "KAKAO_REFRESH_TOKEN 갱신 필요" 이슈가 열립니다.
  그때 3~5번을 다시 해서 시크릿을 교체하면 됩니다.
  (보안상 이슈 본문에 토큰 값은 적지 않습니다.)

## 7. 확인

1. **Actions → geeknews-daily → Run workflow** 에서 `dry_run` 을 **true** 로 두고 실행 →
   로그에서 수집 건수와 만들어진 메시지 템플릿을 확인
2. 같은 방식으로 `dry_run` 을 **false** 로 실행 → **카카오톡 '나와의 채팅'** 에 메시지 도착 확인
