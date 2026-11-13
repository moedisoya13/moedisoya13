# PAX 옷장 플래너 (공유용 페이지)

좌상단 방 서쪽 240cm 벽에 들어갈 IKEA PAX 오픈형·코너형 옷장 구성을 고르는 페이지입니다. Claude 계정이 없는 사람도 열 수 있도록 Vercel에 올립니다.

- `index.html`: 플래너 전체(방 평면도, 정면도, 3D, 견적). 고친 내용은 그 기기의 브라우저에만 저장되고, "지금 구성을 링크로 보내기"로 상대에게 전달합니다.
- `api/command.js`: "말로 바꾸기" 요청을 Claude API(`claude-opus-5-5`)로 보내는 서버 함수. API 키는 서버 환경변수에만 있습니다.
- `lib/rules.js`: Claude에게 주는 고정 지시문. 페이지의 `buildPrompt`에서 뽑아낸 것이라, 페이지의 작업(op) 목록을 바꾸면 함께 다시 만들어야 합니다.

## Vercel 환경변수

| 이름 | 내용 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Console에서 만든 API 키. 이 페이지 전용 키를 만들고, 그 워크스페이스에 월 사용 한도를 걸어 두세요. |
| `PAX_PASSCODE` | 말로 바꾸기에 필요한 암호. 페이지 주소만 아는 사람이 API를 쓰지 못하게 막습니다. |

환경변수를 바꾼 뒤에는 다시 배포해야 반영됩니다. `GET /api/command`는 두 값이 설정됐는지(`keySet`, `passSet`)만 알려 줍니다.
