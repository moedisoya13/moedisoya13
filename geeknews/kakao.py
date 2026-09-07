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

# 카카오 기본 리스트 템플릿의 contents 는 최소 2개, 최대 3개다.
# 그래서 하루 분량이 3건을 넘으면 여러 통으로 쪼개 보내야 한다.
MAX_LIST_ITEMS = 3
MIN_LIST_ITEMS = 2
# 텍스트 템플릿의 text 는 최대 200자다.
MAX_TEXT_CHARS = 200


class KakaoError(RuntimeError):
    pass


@dataclasses.dataclass
class Tokens:
    access: SecretStr
    new_refresh: SecretStr | None


def refresh_tokens(
    rest_api_key: SecretStr,
    refresh_token: SecretStr,
    client_secret: SecretStr | None = None,
) -> Tokens:
    """refresh_token 으로 단기 access_token 을 받는다.

    카카오는 refresh_token 잔여 유효기간이 1개월 미만일 때만 새 refresh_token 을
    함께 내려준다. 그 경우 호출부가 로테이션을 처리해야 한다.

    client_secret 은 카카오 앱에서 'Client Secret 활성화 상태'를 '사용함'으로 둔
    경우에만 필요하다. 켜 두고 보내지 않으면 갱신이 거부되므로, 값이 있을 때만
    파라미터에 싣는다(꺼져 있는 앱에 빈 값을 보내면 그것대로 거부된다).
    """
    payload_data = {
        "grant_type": "refresh_token",
        "client_id": rest_api_key.reveal(),
        "refresh_token": refresh_token.reveal(),
    }
    if client_secret is not None:
        payload_data["client_secret"] = client_secret.reveal()

    resp = requests.post(TOKEN_URL, data=payload_data, timeout=TIMEOUT_SECONDS)
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


def chunk_sizes(total: int) -> list[int]:
    """리스트 템플릿 한 통에 담을 개수들로 나눈다.

    한 통은 2~3건이어야 하므로, 끝에 1건만 남는 분할을 만들지 않는다.
    예: 4 -> [2, 2], 5 -> [3, 2], 6 -> [3, 3], 7 -> [3, 2, 2].
    1건뿐인 경우만 [1] 을 돌려주는데, 이때는 호출부가 텍스트 템플릿으로 보낸다.
    """
    sizes: list[int] = []
    remaining = total
    while remaining > 0:
        if remaining == MAX_LIST_ITEMS + 1:
            # 3을 떼면 1이 남아 리스트로 못 보낸다. 2+2 로 나눈다.
            sizes += [MIN_LIST_ITEMS, MIN_LIST_ITEMS]
            remaining = 0
        elif remaining >= MAX_LIST_ITEMS:
            sizes.append(MAX_LIST_ITEMS)
            remaining -= MAX_LIST_ITEMS
        else:
            sizes.append(remaining)
            remaining = 0
    return sizes


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


def send_one(access: SecretStr, header: str, entries: list[dict[str, str]], log) -> str:
    """한 통을 보낸다. 리스트로 시도하고 거부되면 텍스트로 폴백한다."""
    attempts: list[tuple[str, dict]] = []
    if len(entries) >= MIN_LIST_ITEMS:
        attempts.append(("list", build_list_template(header, entries)))
    attempts.append(("text", build_text_template(header, entries)))

    last_error = ""
    for kind, template in attempts:
        resp = _post(access, template)
        if resp.status_code == 200:
            try:
                result_code = resp.json().get("result_code")
            except ValueError:
                result_code = None
            if result_code == 0:
                log(f"카카오 발송 성공 (템플릿: {kind}, {len(entries)}건)")
                return kind
            last_error = f"status=200 result_code={result_code} body={mask(resp.text)}"
        else:
            last_error = f"status={resp.status_code} body={mask(resp.text)}"
        log(f"경고: {kind} 템플릿 발송 실패 -> {last_error}")

    raise KakaoError(f"카카오 발송에 모두 실패했습니다: {last_error}")


def send(access: SecretStr, header: str, entries: list[dict[str, str]], log) -> list[str]:
    """분량이 리스트 한 통을 넘으면 여러 통으로 나눠 보낸다.

    보낸 템플릿 종류를 순서대로 돌려준다.
    한 통이라도 실패하면 KakaoError 를 올려 워크플로가 빨간불이 되게 한다.
    """
    sizes = chunk_sizes(len(entries))
    kinds: list[str] = []
    offset = 0
    for index, size in enumerate(sizes, start=1):
        part = entries[offset : offset + size]
        offset += size
        # 여러 통일 때만 (1/2) 같은 표시를 붙인다.
        part_header = header if len(sizes) == 1 else f"{header} ({index}/{len(sizes)})"
        kinds.append(send_one(access, part_header, part, log))
    return kinds
