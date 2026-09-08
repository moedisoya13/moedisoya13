"""카카오 refresh_token 로테이션.

refresh_token 은 약 2개월이면 만료된다. 갱신 응답에 새 토큰이 딸려 오면
그때 저장소 시크릿을 갈아끼워야 자동화가 조용히 멈추지 않는다.

  - GH_PAT 가 있으면 Actions Secrets API 로 직접 갱신한다.
  - 없으면 Issue 로 알린다. Issue 본문에 토큰 값은 절대 넣지 않는다.
"""

from __future__ import annotations

import base64

import requests

from .secrets import SecretStr, mask

API = "https://api.github.com"
TIMEOUT_SECONDS = 10
SECRET_NAME = "KAKAO_REFRESH_TOKEN"
ISSUE_TITLE = "KAKAO_REFRESH_TOKEN 갱신 필요"

ISSUE_BODY = f"""카카오가 새 refresh_token 을 발급했습니다.
저장소 시크릿 `{SECRET_NAME}` 이 오래된 값이라 곧 발송이 멈춥니다.

**토큰 값은 보안상 이 이슈에 적지 않습니다.** `docs/SETUP-KAKAO.md` 의 절차대로
새 refresh_token 을 발급받아 시크릿을 교체해 주세요.

`GH_PAT` 시크릿(fine-grained PAT, 이 저장소의 Secrets: write)을 등록해 두면
다음부터는 이 교체가 자동으로 이뤄집니다.
"""


def _headers(token: SecretStr) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token.reveal()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def update_secret(repo: str, pat: SecretStr, value: SecretStr) -> None:
    """Actions 시크릿을 sealed box 로 암호화해 갱신한다."""
    from nacl import encoding, public

    key_resp = requests.get(
        f"{API}/repos/{repo}/actions/secrets/public-key",
        headers=_headers(pat),
        timeout=TIMEOUT_SECONDS,
    )
    if key_resp.status_code != 200:
        raise RuntimeError(f"공개키 조회 실패 status={key_resp.status_code} body={mask(key_resp.text)}")
    key_data = key_resp.json()

    sealed = public.SealedBox(
        public.PublicKey(key_data["key"].encode(), encoding.Base64Encoder())
    ).encrypt(value.reveal().encode())

    put_resp = requests.put(
        f"{API}/repos/{repo}/actions/secrets/{SECRET_NAME}",
        headers=_headers(pat),
        json={
            "encrypted_value": base64.b64encode(sealed).decode(),
            "key_id": key_data["key_id"],
        },
        timeout=TIMEOUT_SECONDS,
    )
    if put_resp.status_code not in (201, 204):
        raise RuntimeError(f"시크릿 갱신 실패 status={put_resp.status_code} body={mask(put_resp.text)}")


def open_issue(repo: str, token: SecretStr) -> None:
    """같은 제목의 열린 이슈가 없을 때만 새로 만든다."""
    search = requests.get(
        f"{API}/repos/{repo}/issues",
        headers=_headers(token),
        params={"state": "open", "per_page": 100},
        timeout=TIMEOUT_SECONDS,
    )
    if search.status_code == 200:
        for issue in search.json():
            if issue.get("title") == ISSUE_TITLE:
                return

    requests.post(
        f"{API}/repos/{repo}/issues",
        headers=_headers(token),
        json={"title": ISSUE_TITLE, "body": ISSUE_BODY},
        timeout=TIMEOUT_SECONDS,
    )


def handle(repo: str, new_refresh: SecretStr, pat: SecretStr | None,
           gh_token: SecretStr | None, log) -> None:
    """새 refresh_token 을 받았을 때의 처리. 실패해도 발송 결과를 뒤집지 않는다."""
    if pat is not None:
        try:
            update_secret(repo, pat, new_refresh)
            log(f"{SECRET_NAME} 시크릿을 자동 갱신했습니다.")
            return
        except Exception as exc:
            log(f"경고: 시크릿 자동 갱신 실패 -> {type(exc).__name__}: {mask(str(exc))}")

    if gh_token is None:
        log(f"경고: {SECRET_NAME} 을 수동으로 교체해야 합니다 (알릴 수단이 없습니다).")
        return
    try:
        open_issue(repo, gh_token)
        log(f"{SECRET_NAME} 수동 교체 안내 이슈를 확인/생성했습니다.")
    except Exception as exc:
        log(f"경고: 안내 이슈 생성 실패 -> {type(exc).__name__}: {mask(str(exc))}")
