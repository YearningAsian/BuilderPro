import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException, status

from app.core.config import APP_BASE_URL, INVITE_FROM_EMAIL, RESEND_API_KEY


def build_invite_join_url(invite_token: str, invited_email: str) -> str:
    if not APP_BASE_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invite email delivery is not configured: APP_BASE_URL is missing.",
        )

    query = urlencode({"token": invite_token, "email": invited_email})
    return f"{APP_BASE_URL}/join-invite?{query}"


def is_invite_email_configured() -> bool:
    return bool(APP_BASE_URL and RESEND_API_KEY and INVITE_FROM_EMAIL)


def send_workspace_invite_email(
    *,
    invited_email: str,
    workspace_name: str,
    invite_token: str,
) -> str:
    if not RESEND_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invite email delivery is not configured: RESEND_API_KEY is missing.",
        )
    if not INVITE_FROM_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invite email delivery is not configured: INVITE_FROM_EMAIL is missing.",
        )

    invite_url = build_invite_join_url(invite_token, invited_email)
    payload = {
        "from": INVITE_FROM_EMAIL,
        "to": [invited_email],
        "subject": f"You're invited to join {workspace_name} on BuilderPro",
        "text": (
            f"You've been invited to join {workspace_name} in BuilderPro.\n\n"
            f"Open the link below to join the workspace:\n{invite_url}\n\n"
            "If the join page asks for an invite token, you can paste the full link "
            "or use the token from the URL."
        ),
        "html": (
            f"<p>You've been invited to join <strong>{workspace_name}</strong> in BuilderPro.</p>"
            f"<p><a href=\"{invite_url}\">Join the workspace</a></p>"
            "<p>If the join page asks for an invite token, you can paste the full link "
            "or use the token from the URL.</p>"
        ),
    }

    request = Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw) if raw else {}
    except HTTPError as exc:
        body_text = exc.read().decode("utf-8") if exc.fp else ""
        try:
            parsed = json.loads(body_text) if body_text else {}
        except json.JSONDecodeError:
            parsed = {}

        message = parsed.get("message") or parsed.get("error") or "Invite email could not be sent."
        if 400 <= exc.code < 500:
            raise HTTPException(status_code=exc.code, detail=message) from exc

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invite email provider is unavailable.",
        ) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invite email provider is unavailable.",
        ) from exc

    email_id = parsed.get("id")
    if not isinstance(email_id, str) or not email_id.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invite email provider returned an invalid response.",
        )

    return invite_url
