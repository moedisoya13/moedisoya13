"""카카오톡 '나에게 보내기'.

PlayMCP 의 KakaotalkChat-MemoChat 은 카카오 계정 OAuth 로 붙는 remote MCP 서버라
GitHub Actions 러너에서 헤드리스 인증이 되지 않는다. 그래서 그 도구가 내부적으로
쓰는 것과 같은 REST API 를 직접 호출한다. 사용자에게 도착하는 결과는 동일하다.

  토큰 갱신 : POST https://kauth.kakao.com/oauth/token
  발송      : POST https://kapi.kakao.com/v2/api/talk/memo/default/send
"""

from __future__ import annotations

import dataclasses
import json

import requests

from .secrets import SecretStr, gha_add_mask, mask
from .sources import SITE_NEW_URL, is_safe_url

TOKEN_URL = "https://kauth.kakao.com/oauth/token"
SEND_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send"
TIMEOUT_SECONDS = 10

# 리스트 템플릿의 contents 는 최대 3개다.
MAX_LIST_ITEMS = 3
# 텍스트 템플릿의 text 는 최대 200자다.
MAX_TEXT_CHARS = 200


class KakaoError(RuntimeError):
    pass


@dataclasses.dataclass
class Tokens:
    access: SecretStr
    new_refresh: SecretStr | None


def refresh_tokens(rest_api_key: SecretStr, refresh_token: SecretStr) -> Tokens:
    """refresh_token 으로 단기 access_token 을 받는다.

    카카오는 refresh_token 잔여 유효기간이 1개월 미만일 때만 새 refresh_token 을
    함께 내려준다. 그 경우 호출부가 로테이션을 처리해야 한다.
    """
    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "client_id": rest_api_key.reveal(),
            "refresh_token": refresh_token.reveal(),
        },
        timeout=TIMEOUT_SECONDS,
    )
    if resp.status_code != 200:
        raise KakaoError(f"토큰 갱신 실패 status={resp.status_code} body={mask(resp.text)}")

    payload = resp.json()
    access = payload.get("access_token")
    if not access:
        raise KakaoError(f"토큰 갱신 응답에 access_token 이 없습니다: {mask(resp.text)}")
    gha_add_mask(access)

    rotated = payload.get("refresh_token")
    if rotated:
        gha_add_mask(rotated)
    return Tokens(access=SecretStr(access), new_refresh=SecretStr(rotated) if rotated else None)


def _link(url: str) -> dict[str, str]:
    return {"web_url": url, "mobile_web_url": url}


def build_list_template(header: str, entries: list[dict[str, str]]) -> dict:
    """리스트 템플릿을 만든다. entries 는 title / summary / url 을 가진다."""
    contents = []
    for entry in entries[:MAX_LIST_ITEMS]:
        url = entry["url"]
        if not is_safe_url(url):
            raise KakaoError(f"안전하지 않은 링크는 메시지에 넣지 않습니다: {url!r}")
        contents.append(
            {
                "title": entry["title"],
                "description": entry["summary"],
                "link": _link(url),
            }
        )
    return {
        "object_type": "list",
        "header_title": header,
        "header_link": _link(SITE_NEW_URL),
        "contents": contents,
        "buttons": [{"title": "긱뉴스 열기", "link": _link(SITE_NEW_URL)}],
    }


def build_text_template(header: str, entries: list[dict[str, str]]) -> dict:
    """리스트 템플릿이 거부될 때 쓰는 폴백. text 는 200자로 자른다."""
    lines = [header]
    for idx, entry in enumerate(entries[:MAX_LIST_ITEMS], start=1):
        lines.append(f"{idx}. {entry['title']} — {entry['summary']}")
    text = "\n".join(lines)
    if len(text) > MAX_TEXT_CHARS:
        text = text[: MAX_TEXT_CHARS - 1] + "…"
    return {
        "object_type": "text",
        "text": text,
        "link": _link(SITE_NEW_URL),
        "button_title": "긱뉴스 열기",
    }


def _post(access: SecretStr, template: dict) -> requests.Response:
    return requests.post(
        SEND_URL,
        headers={"Authorization": f"Bearer {access.reveal()}"},
        data={"template_object": json.dumps(template, ensure_ascii=False)},
        timeout=TIMEOUT_SECONDS,
    )


def send(access: SecretStr, header: str, entries: list[dict[str, str]], log) -> str:
    """리스트 템플릿으로 보내고, 거부되면 텍스트 템플릿으로 폴백한다.

    실제로 보낸 템플릿 종류를 돌려준다.
    """
    attempts: list[tuple[str, dict]] = [
        ("list", build_list_template(header, entries)),
        ("text", build_text_template(header, entries)),
    ]

    last_error = ""
    for kind, template in attempts:
        resp = _post(access, template)
        if resp.status_code == 200:
            try:
                result_code = resp.json().get("result_code")
            except ValueError:
                result_code = None
            if result_code == 0:
                log(f"카카오 발송 성공 (템플릿: {kind})")
                return kind
            last_error = f"status=200 result_code={result_code} body={mask(resp.text)}"
        else:
            last_error = f"status={resp.status_code} body={mask(resp.text)}"
        log(f"경고: {kind} 템플릿 발송 실패 -> {last_error}")

    raise KakaoError(f"카카오 발송에 모두 실패했습니다: {last_error}")
