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

### ⚠️ 여기서 브라우저가 "연결할 수 없음" 을 띄웁니다 — 정상입니다

`https://localhost` 에는 서버가 없으니 페이지가 안 열리는 게 당연합니다.
이 주소는 **인가 코드를 주소창으로 되돌려받기 위한 용도**일 뿐입니다.

**에러 화면은 무시하고 주소창을 보세요.**

```
https://localhost/?code=abcd1234EFGH...
```

여기서 **`code=` 뒤의 값**을 복사합니다. (뒤에 `&` 가 붙어 있으면 `&` 앞까지만.)

주소창에 `code=` 가 안 보인다면 그건 진짜 문제입니다:

| 주소창 상태 | 원인 | 조치 |
|---|---|---|
| `error=invalid_request` 등 | Redirect URI 불일치 | 앱의 Redirect URI 가 **`https://localhost`** 인지 확인 (`http://`, 끝 슬래시 주의) |
| 아직 `kauth.kakao.com/...` | 동의 미완료 | 동의 화면에서 "동의하고 계속하기" 클릭 |
| `error=...consent...` | 동의항목 미설정 | `talk_message` 를 "이용 중 동의" 로 |

## 4. refresh_token 발급

> **`client_secret` 이 필요한가요?**
> 카카오 앱 **보안 → Client Secret** 의 "활성화 상태" 가 **사용함** 이면 필수입니다.
> 사용 안 함이면 아래에서 `client_secret` 줄을 **지우세요** — 끈 앱에 빈 값을 보내면
> 그것대로 거부됩니다. 켰다면 이 값은 이후 **매일 토큰 갱신에도 계속 필요**하므로
> `KAKAO_CLIENT_SECRET` 시크릿으로도 등록해야 합니다.

### PowerShell (Windows)

PowerShell 의 `curl` 은 `Invoke-WebRequest` 별칭이라 bash 문법이 깨집니다.
`Invoke-RestMethod` 를 쓰세요.

값은 `Read-Host` 로 입력받습니다. **인가 코드에는 하이픈이 섞여 있어서**, 스크립트에
직접 붙여넣으면 따옴표를 빠뜨렸을 때 PowerShell 이 `-Xxxx` 를 파라미터로 오해하고
`식 또는 문에서 예기치 않은 '-Xxxx' 토큰입니다` 로 죽습니다. `Read-Host` 는 입력을
그대로 받으므로 그 함정이 없고, Client Secret 유무도 자동으로 처리됩니다.

```powershell
$RestApiKey   = Read-Host "REST API 키"
$ClientSecret = Read-Host "Client Secret (안 켰으면 그냥 Enter)"
$Code         = Read-Host "인가 코드"

$body = @{
    grant_type   = 'authorization_code'
    client_id    = $RestApiKey
    redirect_uri = 'https://localhost'
    code         = $Code
}
if ($ClientSecret) { $body.client_secret = $ClientSecret }

$res = Invoke-RestMethod -Method Post -Uri 'https://kauth.kakao.com/oauth/token' -Body $body

# 콘솔 스크롤백에 토큰을 남기지 않고 바로 클립보드로
$res.refresh_token | Set-Clipboard
Write-Host "refresh_token 을 클립보드에 복사했습니다."
```

붙여넣은 뒤 흔적을 지웁니다:

```powershell
Remove-Variable res, body, Code, RestApiKey, ClientSecret
```

> 변수에 값을 직접 적는 방식을 고집한다면 **반드시 큰따옴표로 감싸세요**:
> `$Code = "abc-EbiWeEe..."` — 따옴표 없이 두면 위 오류가 납니다.

### bash / zsh (macOS · Linux)

```bash
curl -X POST 'https://kauth.kakao.com/oauth/token' \
  -d 'grant_type=authorization_code' \
  -d 'client_id={REST_API_KEY}' \
  -d 'client_secret={CLIENT_SECRET}' \
  -d 'redirect_uri=https://localhost' \
  -d 'code={CODE}'
```

응답의 **`refresh_token`** 값이 `KAKAO_REFRESH_TOKEN` 에 넣을 값입니다.

> 인가 코드는 **1회용이고 몇 분 뒤 만료**됩니다. 응답에 `refresh_token` 없이 `error`
> 만 있다면 코드가 만료됐거나 이미 쓰인 것입니다 — 3번부터 다시 하세요.

## 5. GitHub Secrets 등록

저장소 **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 | 필수 |
|---|---|---|
| `KAKAO_REST_API_KEY` | 1번의 REST API 키 | 발송에 필요 |
| `KAKAO_CLIENT_SECRET` | 앱의 Client Secret | Client Secret 을 켰다면 **필수** |
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
