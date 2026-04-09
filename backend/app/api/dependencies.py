"""
Shared FastAPI dependencies.

get_current_user — extracts and verifies the Supabase JWT from the
Authorization header, then returns the matching User row from the DB.

Usage:
    from app.api.dependencies import get_current_user
    from app.models.models import User

    @router.get("/something")
    def my_route(current_user: User = Depends(get_current_user)):
        ...
"""

from fastapi import Depends, Header, HTTPException, status
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import SUPABASE_KEY, SUPABASE_URL
from app.db.base import get_db
from app.models.models import User

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _supabase_get_user(access_token: str) -> dict:
    """Call Supabase /auth/v1/user to validate token and return user profile."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase auth is not configured.",
        )

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    req = Request(
        url,
        method="GET",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code == 401:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token.")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Auth service error.")
    except URLError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Cannot reach auth service.")


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """
    Dependency that validates the Bearer token and returns the User ORM object.
    Raises 401 if the token is missing, invalid, or the user doesn't exist in the DB.
    """
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header.")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Authorization header format.")

    access_token = parts[1].strip()
    profile = _supabase_get_user(access_token)

    email = profile.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unable to resolve user from token.")

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that additionally requires the user to have the admin role."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return current_user