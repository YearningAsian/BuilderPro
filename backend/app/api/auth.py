import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import SUPABASE_KEY, SUPABASE_URL
from app.db.base import get_db
from app.models.models import User, Workspace, WorkspaceInvite, WorkspaceMember

router = APIRouter(prefix="/auth", tags=["auth"])


class SignInRequest(BaseModel):
    email: str
    password: str


class SignInResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    email: str
    workspace_id: str | None = None
    workspace_name: str | None = None


class SessionInfoResponse(BaseModel):
    role: str
    email: str
    workspace_id: str | None = None
    workspace_name: str | None = None


class CompanySignUpRequest(BaseModel):
    full_name: str
    company_name: str
    email: str
    password: str


class CompanySignUpResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    role: str = "admin"
    email: str
    workspace_id: str
    workspace_name: str
    requires_email_confirmation: bool


class CreateInviteRequest(BaseModel):
    workspace_id: str
    invited_email: str
    expires_in_days: int = 7


class CreateInviteResponse(BaseModel):
    invite_token: str
    workspace_id: str
    invited_email: str
    expires_at: str


class JoinInviteRequest(BaseModel):
    invite_token: str
    full_name: str
    email: str
    password: str


class JoinInviteResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    role: str = "user"
    email: str
    workspace_id: str
    workspace_name: str
    requires_email_confirmation: bool


class SignOutResponse(BaseModel):
    message: str


def _ensure_supabase_config() -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase auth is not configured on the backend.",
        )


def _supabase_request(method: str, path: str, payload: dict | None = None, bearer_token: str | None = None) -> dict:
    _ensure_supabase_config()

    url = f"{SUPABASE_URL.rstrip('/')}{path}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    authorization_value = f"Bearer {bearer_token}" if bearer_token else f"Bearer {SUPABASE_KEY}"

    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": authorization_value,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        body_text = exc.read().decode("utf-8") if exc.fp else ""
        try:
            parsed = json.loads(body_text) if body_text else {}
        except json.JSONDecodeError:
            parsed = {}

        message = parsed.get("error_description") or parsed.get("msg") or parsed.get("message") or "Auth service request failed."

        if 400 <= exc.code < 500:
            raise HTTPException(status_code=exc.code, detail=message)

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach Supabase auth service.",
        )
    except URLError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach Supabase auth service.",
        )


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _get_or_create_user(db: Session, email: str, full_name: str | None, role: str) -> User:
    normalized = _normalize_email(email)
    existing = db.query(User).filter(func.lower(User.email) == normalized).first()

    if existing:
        if full_name and not existing.full_name:
            existing.full_name = full_name.strip()
        if role == "admin":
            existing.role = "admin"
        db.add(existing)
        db.flush()
        return existing

    user = User(
        email=normalized,
        full_name=full_name.strip() if full_name else None,
        role=role,
    )
    db.add(user)
    db.flush()
    return user


def _membership_role_for_signin(db: Session, user: User) -> tuple[str, WorkspaceMember | None]:
    membership = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.user_id == user.id)
        .order_by(WorkspaceMember.created_at.asc())
        .first()
    )

    if membership:
        return membership.role, membership
    return (user.role if user.role in {"admin", "user"} else "user"), None


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header.")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Authorization header.")

    return parts[1].strip()


def _current_user_email_from_token(authorization: str | None) -> str:
    access_token = _extract_bearer_token(authorization)
    profile = _supabase_request("GET", "/auth/v1/user", bearer_token=access_token)
    email = profile.get("email")

    if not isinstance(email, str) or not email.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unable to resolve authenticated user.")

    return _normalize_email(email)


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("builderpro_auth", path="/")
    response.delete_cookie("builderpro_role", path="/")


@router.post("/signin", response_model=SignInResponse)
def sign_in(payload: SignInRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)

    if not email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Email is required.")
    if not payload.password.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password is required.")

    auth = _supabase_request(
        "POST",
        "/auth/v1/token?grant_type=password",
        payload={"email": email, "password": payload.password},
    )

    access_token = auth.get("access_token")
    token_type = auth.get("token_type", "bearer")

    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        user = _get_or_create_user(db, email=email, full_name=None, role="user")
        db.commit()

    role, membership = _membership_role_for_signin(db, user)
    workspace_name = None
    workspace_id = None

    if membership:
        workspace = db.query(Workspace).filter(Workspace.id == membership.workspace_id).first()
        if workspace:
            workspace_id = str(workspace.id)
            workspace_name = workspace.name

    return SignInResponse(
        access_token=access_token,
        token_type=token_type,
        role=role,
        email=email,
        workspace_id=workspace_id,
        workspace_name=workspace_name,
    )


@router.post("/signout", response_model=SignOutResponse)
def sign_out(response: Response, authorization: str | None = Header(default=None)):
    # Sign-out should be idempotent for frontend simplicity.
    # If the client has a bearer token, ask Supabase to invalidate that session.
    access_token: str | None = None
    if authorization:
        try:
            access_token = _extract_bearer_token(authorization)
        except HTTPException:
            access_token = None

    if access_token:
        try:
            _supabase_request("POST", "/auth/v1/logout", bearer_token=access_token)
        except HTTPException as exc:
            if exc.status_code >= 500:
                raise

    _clear_auth_cookies(response)
    return SignOutResponse(message="Signed out successfully")


@router.get("/me", response_model=SessionInfoResponse)
def get_session_info(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    email = _current_user_email_from_token(authorization)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        user = _get_or_create_user(db, email=email, full_name=None, role="user")
        db.commit()

    role, membership = _membership_role_for_signin(db, user)
    workspace_name = None
    workspace_id = None

    if membership:
        workspace = db.query(Workspace).filter(Workspace.id == membership.workspace_id).first()
        if workspace:
            workspace_id = str(workspace.id)
            workspace_name = workspace.name

    return SessionInfoResponse(
        role=role,
        email=email,
        workspace_id=workspace_id,
        workspace_name=workspace_name,
    )


@router.post("/signup-company", response_model=CompanySignUpResponse, status_code=status.HTTP_201_CREATED)
def sign_up_company(payload: CompanySignUpRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    full_name = payload.full_name.strip()
    company_name = payload.company_name.strip()
    password = payload.password

    if not full_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Full name is required.")
    if not company_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Company name is required.")
    if not email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Email is required.")
    if len(password) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password must be at least 8 characters.")

    existing_workspace = db.query(Workspace).filter(func.lower(Workspace.name) == company_name.lower()).first()
    if existing_workspace:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A workspace with this company name already exists.")

    auth = _supabase_request("POST", "/auth/v1/signup", payload={"email": email, "password": password})
    access_token = auth.get("access_token")
    token_type = auth.get("token_type", "bearer")
    user_payload = auth.get("user") or {}

    app_user = _get_or_create_user(db, email=email, full_name=full_name, role="admin")

    workspace = Workspace(name=company_name, created_by=app_user.id)
    db.add(workspace)
    db.flush()

    membership = WorkspaceMember(workspace_id=workspace.id, user_id=app_user.id, role="admin")
    db.add(membership)
    db.commit()

    requires_email_confirmation = not bool(access_token) and bool(user_payload)

    return CompanySignUpResponse(
        access_token=access_token,
        token_type=token_type,
        role="admin",
        email=email,
        workspace_id=str(workspace.id),
        workspace_name=workspace.name,
        requires_email_confirmation=requires_email_confirmation,
    )


@router.post("/invites", response_model=CreateInviteResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: CreateInviteRequest,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    inviter_email = _current_user_email_from_token(authorization)

    inviter_user = db.query(User).filter(func.lower(User.email) == inviter_email).first()
    if not inviter_user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inviter profile is not registered.")

    workspace = db.query(Workspace).filter(Workspace.id == payload.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")

    membership = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == inviter_user.id)
        .first()
    )
    if not membership or membership.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only workspace admins can create invites.")

    invited_email = _normalize_email(payload.invited_email)
    if not invited_email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invited email is required.")

    expires_days = payload.expires_in_days if payload.expires_in_days > 0 else 7
    expires_at = datetime.now(timezone.utc) + timedelta(days=min(expires_days, 30))
    invite_token = secrets.token_urlsafe(24)

    invite = WorkspaceInvite(
        workspace_id=workspace.id,
        invited_email=invited_email,
        invite_token=invite_token,
        invited_by_user_id=inviter_user.id,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()

    return CreateInviteResponse(
        invite_token=invite_token,
        workspace_id=str(workspace.id),
        invited_email=invited_email,
        expires_at=expires_at.isoformat(),
    )


@router.post("/join-invite", response_model=JoinInviteResponse)
def join_invite(payload: JoinInviteRequest, db: Session = Depends(get_db)):
    token = payload.invite_token.strip()
    full_name = payload.full_name.strip()
    email = _normalize_email(payload.email)

    if not token:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invite token is required.")
    if not full_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Full name is required.")
    if not email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Email is required.")
    if len(payload.password) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password must be at least 8 characters.")

    invite = db.query(WorkspaceInvite).filter(WorkspaceInvite.invite_token == token).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found.")

    now = datetime.now(timezone.utc)
    expires_at = invite.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if invite.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite has already been used.")
    if expires_at < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has expired.")

    if _normalize_email(invite.invited_email) != email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invite email does not match.")

    auth = _supabase_request("POST", "/auth/v1/signup", payload={"email": email, "password": payload.password})
    access_token = auth.get("access_token")
    token_type = auth.get("token_type", "bearer")
    user_payload = auth.get("user") or {}

    app_user = _get_or_create_user(db, email=email, full_name=full_name, role="user")

    existing_membership = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == invite.workspace_id, WorkspaceMember.user_id == app_user.id)
        .first()
    )
    if not existing_membership:
        db.add(
            WorkspaceMember(
                workspace_id=invite.workspace_id,
                user_id=app_user.id,
                role="user",
            )
        )

    invite.accepted_at = now
    invite.accepted_by_user_id = app_user.id
    db.add(invite)
    db.commit()

    workspace = db.query(Workspace).filter(Workspace.id == invite.workspace_id).first()

    requires_email_confirmation = not bool(access_token) and bool(user_payload)

    return JoinInviteResponse(
        access_token=access_token,
        token_type=token_type,
        role="user",
        email=email,
        workspace_id=str(invite.workspace_id),
        workspace_name=workspace.name if workspace else "",
        requires_email_confirmation=requires_email_confirmation,
    )
