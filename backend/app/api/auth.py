import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import (
    ENABLE_LOCAL_AUTH_FALLBACK,
    SECRET_KEY,
    SUPABASE_ADMIN_KEY,
    SUPABASE_KEY,
    SUPABASE_URL,
)
from app.db.base import get_db
from app.models.models import AuditLog, User, Workspace, WorkspaceInvite, WorkspaceMember

router = APIRouter(prefix="/auth", tags=["auth"])


class SignInRequest(BaseModel):
    email: str
    password: str


class SignInResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    email: str
    workspace_id: Optional[str] = None
    workspace_name: Optional[str] = None


class SessionInfoResponse(BaseModel):
    role: str
    email: str
    workspace_id: Optional[str] = None
    workspace_name: Optional[str] = None


class CompanySignUpRequest(BaseModel):
    full_name: str
    company_name: str
    email: str
    password: str


class CompanySignUpResponse(BaseModel):
    access_token: Optional[str] = None
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
    access_token: Optional[str] = None
    token_type: str = "bearer"
    role: str = "user"
    email: str
    workspace_id: str
    workspace_name: str
    requires_email_confirmation: bool


class SignOutResponse(BaseModel):
    message: str


class WorkspaceMemberSummary(BaseModel):
    id: UUID
    user_id: UUID
    email: str
    full_name: Optional[str] = None
    role: Literal["admin", "user"]
    created_at: datetime


class WorkspaceMemberUpdateRequest(BaseModel):
    role: Literal["admin", "user"]


class AuditLogEntry(BaseModel):
    id: UUID
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    user_id: Optional[UUID] = None
    actor_email: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime


def _ensure_supabase_config() -> None:
    if not SUPABASE_URL or not (SUPABASE_KEY or SUPABASE_ADMIN_KEY):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase auth is not configured on the backend.",
        )


def _supabase_request(
    method: str,
    path: str,
    payload: Optional[dict] = None,
    bearer_token: Optional[str] = None,
    api_key: Optional[str] = None,
) -> dict:
    _ensure_supabase_config()

    resolved_api_key = api_key or SUPABASE_KEY or SUPABASE_ADMIN_KEY
    url = f"{SUPABASE_URL.rstrip('/')}{path}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    authorization_value = f"Bearer {bearer_token}" if bearer_token else f"Bearer {resolved_api_key}"

    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "apikey": resolved_api_key,
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


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))


def _create_local_access_token(email: str) -> str:
    payload = {
        "email": _normalize_email(email),
        "iat": int(time.time()),
        "iss": "builderpro-local-dev",
    }
    payload_segment = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _base64url_encode(
        hmac.new(SECRET_KEY.encode("utf-8"), payload_segment.encode("utf-8"), hashlib.sha256).digest()
    )
    return f"dev.{payload_segment}.{signature}"


def _decode_local_access_token(token: str) -> Optional[str]:
    if not token.startswith("dev."):
        return None

    try:
        _, payload_segment, signature = token.split(".", 2)
    except ValueError:
        return None

    expected_signature = _base64url_encode(
        hmac.new(SECRET_KEY.encode("utf-8"), payload_segment.encode("utf-8"), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        payload = json.loads(_base64url_decode(payload_segment).decode("utf-8"))
    except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
        return None

    email = payload.get("email")
    if isinstance(email, str) and email.strip():
        return _normalize_email(email)
    return None


def _get_or_create_user(db: Session, email: str, full_name: Optional[str], role: str) -> User:
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


def _build_workspace_name_for_user(db: Session, user: User) -> str:
    base_name = (user.full_name or user.email.split("@", 1)[0]).strip()
    if not base_name:
        base_name = "BuilderPro"
    if "workspace" not in base_name.lower():
        base_name = f"{base_name} Workspace"

    candidate = base_name
    suffix = 2

    while db.query(Workspace).filter(func.lower(Workspace.name) == candidate.lower()).first():
        candidate = f"{base_name} {suffix}"
        suffix += 1

    return candidate


def _membership_role_for_session(db: Session, user: User) -> tuple[str, Optional[WorkspaceMember], bool]:
    membership = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.user_id == user.id)
        .order_by(WorkspaceMember.created_at.asc())
        .first()
    )

    if membership:
        return membership.role, membership, False

    fallback_role = user.role if user.role in {"admin", "user"} else "user"
    if fallback_role != "admin":
        return fallback_role, None, False

    workspace = (
        db.query(Workspace)
        .filter(Workspace.created_by == user.id)
        .order_by(Workspace.created_at.asc())
        .first()
    )

    if not workspace:
        workspace = Workspace(name=_build_workspace_name_for_user(db, user), created_by=user.id)
        db.add(workspace)
        db.flush()

    membership = WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="admin")
    db.add(membership)
    db.flush()

    return "admin", membership, True


def _register_supabase_user_with_session(email: str, password: str, full_name: str) -> tuple[Optional[str], str, bool]:
    token_type = "bearer"

    def local_fallback_session() -> tuple[Optional[str], str, bool]:
        if ENABLE_LOCAL_AUTH_FALLBACK:
            return _create_local_access_token(email), token_type, False
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many signup attempts. Please try again shortly.")

    # If Supabase is not configured at all, use local fallback immediately.
    if not SUPABASE_URL or not (SUPABASE_KEY or SUPABASE_ADMIN_KEY):
        return local_fallback_session()

    try:
        _supabase_request(
            "POST",
            "/auth/v1/admin/users",
            payload={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name},
            },
            api_key=SUPABASE_ADMIN_KEY,
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            return local_fallback_session()
        if exc.status_code not in {401, 403, 404}:
            raise

        try:
            _supabase_request(
                "POST",
                "/auth/v1/signup",
                payload={
                    "email": email,
                    "password": password,
                    "options": {"data": {"full_name": full_name}},
                },
            )
        except HTTPException as fallback_exc:
            if fallback_exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                return local_fallback_session()
            raise

    try:
        auth = _supabase_request(
            "POST",
            "/auth/v1/token?grant_type=password",
            payload={"email": email, "password": password},
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            return local_fallback_session()
        if exc.status_code in {400, 401} and "confirm" in str(exc.detail).lower():
            return None, token_type, True
        raise

    access_token = auth.get("access_token")
    token_type = auth.get("token_type", "bearer")
    requires_email_confirmation = not bool(access_token)

    return access_token, token_type, requires_email_confirmation


def _extract_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header.")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Authorization header.")

    return parts[1].strip()


def _current_user_email_from_token(authorization: Optional[str]) -> str:
    access_token = _extract_bearer_token(authorization)

    local_email = _decode_local_access_token(access_token)
    if local_email:
        return local_email

    profile = _supabase_request("GET", "/auth/v1/user", bearer_token=access_token)
    email = profile.get("email")

    if not isinstance(email, str) or not email.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unable to resolve authenticated user.")

    return _normalize_email(email)


def _resolve_session_user(db: Session, authorization: Optional[str]) -> tuple[User, str, str, Optional[WorkspaceMember]]:
    email = _current_user_email_from_token(authorization)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        user = _get_or_create_user(db, email=email, full_name=None, role="user")
        db.commit()

    role, membership, session_repaired = _membership_role_for_session(db, user)
    if session_repaired:
        db.commit()

    return user, email, role, membership


def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
) -> User:
    user, _, _, _ = _resolve_session_user(db, authorization)
    return user


def get_current_workspace_id(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    _, _, _, membership = _resolve_session_user(db, authorization)
    if not membership or not membership.workspace_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active workspace is available for this session.",
        )
    return membership.workspace_id


def _get_workspace_membership(db: Session, user_id, workspace_id) -> Optional[WorkspaceMember]:
    return (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id)
        .first()
    )


def _require_workspace_admin(db: Session, current_user: User, current_workspace_id) -> WorkspaceMember:
    membership = _get_workspace_membership(db, current_user.id, current_workspace_id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of the active workspace.",
        )
    if membership.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace admins can manage members.",
        )
    return membership


def _serialize_workspace_member(member: WorkspaceMember) -> WorkspaceMemberSummary:
    if not member.user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Workspace member is missing a linked user profile.",
        )

    return WorkspaceMemberSummary(
        id=member.id,
        user_id=member.user_id,
        email=member.user.email,
        full_name=member.user.full_name,
        role=member.role,
        created_at=member.created_at,
    )


def _record_audit_event(
    db: Session,
    *,
    workspace_id,
    user_id,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
) -> AuditLog:
    event = AuditLog(
        workspace_id=workspace_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=json.dumps(details) if details is not None else None,
    )
    db.add(event)
    db.flush()
    return event


def _serialize_audit_event(event: AuditLog) -> AuditLogEntry:
    parsed_details = None
    if event.details:
        try:
            parsed_details = json.loads(event.details)
        except json.JSONDecodeError:
            parsed_details = {"raw": event.details}

    return AuditLogEntry(
        id=event.id,
        action=event.action,
        resource_type=event.resource_type,
        resource_id=event.resource_id,
        user_id=event.user_id,
        actor_email=event.actor.email if event.actor else None,
        details=parsed_details,
        created_at=event.created_at,
    )


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

    # Use local token when Supabase is not configured.
    if not SUPABASE_URL or not (SUPABASE_KEY or SUPABASE_ADMIN_KEY):
        if not ENABLE_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Supabase auth is not configured on the backend.")
        access_token = _create_local_access_token(email)
        token_type = "bearer"
    else:
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

    role, membership, session_repaired = _membership_role_for_session(db, user)
    if session_repaired:
        db.commit()

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
def sign_out(response: Response, authorization: Optional[str] = Header(default=None)):
    # Sign-out should be idempotent for frontend simplicity.
    # If the client has a bearer token, ask Supabase to invalidate that session.
    access_token: Optional[str] = None
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
    authorization: Optional[str] = Header(default=None),
):
    _, email, role, membership = _resolve_session_user(db, authorization)

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


@router.get("/audit-log", response_model=list[AuditLogEntry])
def list_audit_events(
    limit: int = 25,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    _require_workspace_admin(db, current_user, current_workspace_id)

    bounded_limit = max(1, min(limit, 100))
    events = (
        db.query(AuditLog)
        .filter(AuditLog.workspace_id == current_workspace_id)
        .order_by(AuditLog.created_at.desc())
        .limit(bounded_limit)
        .all()
    )

    return [_serialize_audit_event(event) for event in events]


@router.get("/members", response_model=list[WorkspaceMemberSummary])
def list_workspace_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    _require_workspace_admin(db, current_user, current_workspace_id)

    members = (
        db.query(WorkspaceMember)
        .join(User, WorkspaceMember.user_id == User.id)
        .filter(WorkspaceMember.workspace_id == current_workspace_id)
        .order_by(WorkspaceMember.created_at.asc(), func.lower(User.email).asc())
        .all()
    )

    return [_serialize_workspace_member(member) for member in members]


@router.patch("/members/{member_id}", response_model=WorkspaceMemberSummary)
def update_workspace_member(
    member_id: str,
    payload: WorkspaceMemberUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    _require_workspace_admin(db, current_user, current_workspace_id)

    try:
        member_lookup_id = UUID(str(member_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid workspace member id.") from exc

    member = (
        db.query(WorkspaceMember)
        .join(User, WorkspaceMember.user_id == User.id)
        .filter(WorkspaceMember.id == member_lookup_id, WorkspaceMember.workspace_id == current_workspace_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace member not found.")

    if member.user_id == current_user.id and member.role != payload.role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own role.")

    if member.role == "admin" and payload.role != "admin":
        admin_count = (
            db.query(WorkspaceMember)
            .filter(WorkspaceMember.workspace_id == current_workspace_id, WorkspaceMember.role == "admin")
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Your workspace must keep at least one admin.",
            )

    member.role = payload.role
    db.add(member)
    _record_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="member.role_updated",
        resource_type="workspace_member",
        resource_id=str(member.id),
        details={"member_email": member.user.email if member.user else None, "role": payload.role},
    )
    db.commit()
    db.refresh(member)

    return _serialize_workspace_member(member)


@router.delete("/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace_member(
    member_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    _require_workspace_admin(db, current_user, current_workspace_id)

    try:
        member_lookup_id = UUID(str(member_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid workspace member id.") from exc

    member = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.id == member_lookup_id, WorkspaceMember.workspace_id == current_workspace_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace member not found.")

    if member.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot remove yourself from the workspace.")

    if member.role == "admin":
        admin_count = (
            db.query(WorkspaceMember)
            .filter(WorkspaceMember.workspace_id == current_workspace_id, WorkspaceMember.role == "admin")
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Your workspace must keep at least one admin.",
            )

    removed_email = member.user.email if member.user else None
    _record_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="member.removed",
        resource_type="workspace_member",
        resource_id=str(member.id),
        details={"member_email": removed_email, "role": member.role},
    )
    db.delete(member)
    db.commit()


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

    access_token, token_type, requires_email_confirmation = _register_supabase_user_with_session(
        email=email,
        password=password,
        full_name=full_name,
    )

    app_user = _get_or_create_user(db, email=email, full_name=full_name, role="admin")

    workspace = Workspace(name=company_name, created_by=app_user.id)
    db.add(workspace)
    db.flush()

    membership = WorkspaceMember(workspace_id=workspace.id, user_id=app_user.id, role="admin")
    db.add(membership)
    db.commit()

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
    authorization: Optional[str] = Header(default=None),
):
    inviter_email = _current_user_email_from_token(authorization)

    inviter_user = db.query(User).filter(func.lower(User.email) == inviter_email).first()
    if not inviter_user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inviter profile is not registered.")

    try:
        workspace_lookup_id = UUID(str(payload.workspace_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid workspace_id.") from exc

    workspace = db.query(Workspace).filter(Workspace.id == workspace_lookup_id).first()
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
    db.flush()
    _record_audit_event(
        db,
        workspace_id=workspace.id,
        user_id=inviter_user.id,
        action="member.invited",
        resource_type="workspace_invite",
        resource_id=str(invite.id),
        details={"invited_email": invited_email, "expires_at": expires_at.isoformat()},
    )
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

    access_token, token_type, requires_email_confirmation = _register_supabase_user_with_session(
        email=email,
        password=payload.password,
        full_name=full_name,
    )

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
    _record_audit_event(
        db,
        workspace_id=invite.workspace_id,
        user_id=app_user.id,
        action="member.joined",
        resource_type="workspace_invite",
        resource_id=str(invite.id),
        details={"email": email},
    )
    db.commit()

    workspace = db.query(Workspace).filter(Workspace.id == invite.workspace_id).first()

    return JoinInviteResponse(
        access_token=access_token,
        token_type=token_type,
        role="user",
        email=email,
        workspace_id=str(invite.workspace_id),
        workspace_name=workspace.name if workspace else "",
        requires_email_confirmation=requires_email_confirmation,
    )
