# CLAUDE.md

## 웹 fetch 폴백

임의의 `https://…` URL 을 fetch 하다가 요청이 **정책(네트워크 policy·프록시 차단 등)에 의해 실패하면**,
같은 URL 앞에 `r.jina.ai/` 를 붙여 `https://r.jina.ai/https://…` 형식으로 한 번 더 접근한다.

- 대상은 정책 차단(403/405/407, `blocked by policy`, 허용되지 않은 host 등)일 때뿐이다.
  404·타임아웃·5xx 처럼 원 서버 쪽 문제는 폴백 대상이 아니다.
- 원 URL 은 스킴까지 그대로 붙인다: `https://r.jina.ai/https://example.com/path?q=1`
- r.jina.ai 는 본문을 Markdown 으로 변환해 돌려주므로 원문 HTML·바이너리와 다를 수 있다.
  결과를 전할 때 jina 경유로 가져왔다고 밝힌다.
- 이 규칙은 에이전트가 조사용으로 fetch 할 때의 동작이다. `geeknews/` 의 수집 코드(`sources._fetch`)에는
  적용하지 않는다.
