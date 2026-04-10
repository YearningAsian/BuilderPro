import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
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
from app.core.email import build_invite_join_url, is_invite_email_configured, send_workspace_invite_email
from app.db.base import get_db
from app.models.models import AuditLog, Material, Project, User, Workspace, WorkspaceInvite, WorkspaceMember

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


class SessionWorkspaceSummary(BaseModel):
    workspace_id: str
    workspace_name: str
    role: Literal["admin", "user"]
    is_active: bool


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
    invite_url: str | None = None
    email_sent: bool = False
    delivery_message: str | None = None


class WorkspaceInviteSummary(BaseModel):
    id: UUID
    workspace_id: UUID
    invited_email: str
    invite_token: str
    invited_by_user_id: UUID
    expires_at: datetime
    created_at: datetime
    is_expired: bool


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


class ForgotPasswordRequest(BaseModel):
    email: str
    redirect_to: str | None = None


class ForgotPasswordResponse(BaseModel):
    message: str


class VerifyRecoveryRequest(BaseModel):
    token: str | None = None
    token_hash: str | None = None
    email: str | None = None


class VerifyRecoveryResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int | None = None


class ResetPasswordRequest(BaseModel):
    access_token: str
    new_password: str


class ResetPasswordResponse(BaseModel):
    message: str


class WorkspaceMemberSummary(BaseModel):
    id: UUID
    user_id: UUID
    email: str
    full_name: str | None = None
    role: Literal["admin", "user"]
    created_at: datetime


class WorkspaceMemberUpdateRequest(BaseModel):
    role: Literal["admin", "user"]


class AuditLogEntry(BaseModel):
    id: UUID
    action: str
    resource_type: str
    resource_id: str | None = None
    user_id: UUID | None = None
    actor_email: str | None = None
    details: dict | None = None
    created_at: datetime


class WorkspaceProfileUpdateRequest(BaseModel):
    name: str


class WorkspaceProfileResponse(BaseModel):
    workspace_id: UUID
    workspace_name: str


class WorkspaceBillingSummaryResponse(BaseModel):
    workspace_id: UUID
    member_count: int
    material_count: int
    active_project_count: int
    draft_project_count: int
    monthly_estimate_total: float
    plan_name: str


def _ensure_supabase_config() -> None:
    if not SUPABASE_URL or not (SUPABASE_KEY or SUPABASE_ADMIN_KEY):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase auth is not configured on the backend.",
        )


def _supabase_request(
    method: str,
    path: str,
    payload: dict | None = None,
    bearer_token: str | None = None,
    api_key: str | None = None,
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


def _decode_local_access_token(token: str) -> str | None:
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


def _get_requested_workspace_membership(
    db: Session,
    user: User,
    requested_workspace_id: str | UUID | None,
) -> WorkspaceMember | None:
    if requested_workspace_id in {None, ""}:
        return None

    try:
        workspace_id = requested_workspace_id if isinstance(requested_workspace_id, UUID) else UUID(str(requested_workspace_id))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid workspace selection.",
        ) from exc

    membership = _get_workspace_membership(db, user.id, workspace_id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of the requested workspace.",
        )

    return membership


def _membership_role_for_session(
    db: Session,
    user: User,
    requested_workspace_id: str | UUID | None = None,
) -> tuple[str, WorkspaceMember | None, bool]:
    requested_membership = _get_requested_workspace_membership(db, user, requested_workspace_id)
    if requested_membership:
        return requested_membership.role, requested_membership, False

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


def _register_supabase_user_with_session(email: str, password: str, full_name: str) -> tuple[str | None, str, bool]:
    token_type = "bearer"

    def local_fallback_session() -> tuple[str | None, str, bool]:
        if ENABLE_LOCAL_AUTH_FALLBACK:
            return _create_local_access_token(email), token_type, False
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many signup attempts. Please try again shortly.")

    def should_use_local_fallback(exc: HTTPException) -> bool:
        if exc.status_code in {
            status.HTTP_429_TOO_MANY_REQUESTS,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            status.HTTP_502_BAD_GATEWAY,
            status.HTTP_503_SERVICE_UNAVAILABLE,
            status.HTTP_504_GATEWAY_TIMEOUT,
        }:
            return True

        detail = str(exc.detail).lower()
        return "unable to reach supabase auth service" in detail

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
        if should_use_local_fallback(exc):
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
            if should_use_local_fallback(fallback_exc):
                return local_fallback_session()
            raise

    try:
        auth = _supabase_request(
            "POST",
            "/auth/v1/token?grant_type=password",
            payload={"email": email, "password": password},
        )
    except HTTPException as exc:
        if should_use_local_fallback(exc):
            return local_fallback_session()
        if exc.status_code in {400, 401} and "confirm" in str(exc.detail).lower():
            return None, token_type, True
        raise

    access_token = auth.get("access_token")
    token_type = auth.get("token_type", "bearer")
    requires_email_confirmation = not bool(access_token)

    return access_token, token_type, requires_email_confirmation


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header.")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Authorization header.")

    return parts[1].strip()


def _current_user_email_from_token(authorization: str | None) -> str:
    access_token = _extract_bearer_token(authorization)

    local_email = _decode_local_access_token(access_token)
    if local_email:
        return local_email

    profile = _supabase_request("GET", "/auth/v1/user", bearer_token=access_token)
    email = profile.get("email")

    if not isinstance(email, str) or not email.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unable to resolve authenticated user.")

    return _normalize_email(email)


def _resolve_session_user(
    db: Session,
    authorization: str | None,
    requested_workspace_id: str | None = None,
) -> tuple[User, str, str, WorkspaceMember | None]:
    email = _current_user_email_from_token(authorization)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        user = _get_or_create_user(db, email=email, full_name=None, role="user")
        db.commit()

    role, membership, session_repaired = _membership_role_for_session(db, user, requested_workspace_id)
    if session_repaired:
        db.commit()

    return user, email, role, membership


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
) -> User:
    user, _, _, _ = _resolve_session_user(db, authorization, x_workspace_id)
    return user


def get_current_workspace_id(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
):
    _, _, _, membership = _resolve_session_user(db, authorization, x_workspace_id)
    if not membership or not membership.workspace_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active workspace is available for this session.",
        )
    return membership.workspace_id


def _get_workspace_membership(db: Session, user_id, workspace_id) -> WorkspaceMember | None:
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
    resource_id: str | None = None,
    details: dict | None = None,
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


def _serialize_workspace_invite(invite: WorkspaceInvite) -> WorkspaceInviteSummary:
    now = datetime.now(timezone.utc)
    expires_at = invite.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    return WorkspaceInviteSummary(
        id=invite.id,
        workspace_id=invite.workspace_id,
        invited_email=invite.invited_email,
        invite_token=invite.invite_token,
        invited_by_user_id=invite.invited_by_user_id,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
        is_expired=expires_at < now,
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


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest):
    email = _normalize_email(payload.email)
    if not email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Email is required.")

    request_payload: dict[str, str] = {"email": email}
    if payload.redirect_to and payload.redirect_to.strip():
        request_payload["redirect_to"] = payload.redirect_to.strip()

    _supabase_request("POST", "/auth/v1/recover", payload=request_payload)
    return ForgotPasswordResponse(
        message="If an account exists for that email, we sent password reset instructions.",
    )


@router.post("/verify-recovery", response_model=VerifyRecoveryResponse)
def verify_recovery(payload: VerifyRecoveryRequest):
    token = payload.token.strip() if payload.token else ""
    token_hash = payload.token_hash.strip() if payload.token_hash else ""
    email = _normalize_email(payload.email) if payload.email else None

    if not token and not token_hash:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A recovery token or token hash is required.",
        )

    verify_payload: dict[str, str] = {"type": "recovery"}
    if token_hash:
        verify_payload["token_hash"] = token_hash
    else:
        verify_payload["token"] = token

    if email:
        verify_payload["email"] = email

    auth = _supabase_request("POST", "/auth/v1/verify", payload=verify_payload)
    access_token = auth.get("access_token")
    if not isinstance(access_token, str) or not access_token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recovery token could not be verified.",
        )

    expires_in_value = auth.get("expires_in")
    expires_in = expires_in_value if isinstance(expires_in_value, int) else None

    return VerifyRecoveryResponse(
        access_token=access_token,
        token_type=auth.get("token_type", "bearer"),
        expires_in=expires_in,
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(payload: ResetPasswordRequest):
    access_token = payload.access_token.strip()
    new_password = payload.new_password

    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Recovery access token is required.",
        )
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters.",
        )

    _supabase_request(
        "PUT",
        "/auth/v1/user",
        payload={"password": new_password},
        bearer_token=access_token,
    )
    return ResetPasswordResponse(message="Your password has been updated successfully.")


@router.get("/me", response_model=SessionInfoResponse)
def get_session_info(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
):
    _, email, role, membership = _resolve_session_user(db, authorization, x_workspace_id)

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


@router.get("/workspaces", response_model=list[SessionWorkspaceSummary])
def list_session_workspaces(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
):
    user, _, _, active_membership = _resolve_session_user(db, authorization, x_workspace_id)

    memberships = (
        db.query(WorkspaceMember, Workspace)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == user.id)
        .order_by(WorkspaceMember.created_at.asc(), func.lower(Workspace.name).asc())
        .all()
    )

    active_workspace_id = str(active_membership.workspace_id) if active_membership else None
    return [
        SessionWorkspaceSummary(
            workspace_id=str(membership.workspace_id),
            workspace_name=workspace.name,
            role=membership.role,
            is_active=str(membership.workspace_id) == active_workspace_id,
        )
        for membership, workspace in memberships
    ]


@router.patch("/workspace", response_model=WorkspaceProfileResponse)
def update_workspace_profile(
    payload: WorkspaceProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    _require_workspace_admin(db, current_user, current_workspace_id)

    next_name = payload.name.strip()
    if not next_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Workspace name is required.",
        )

    workspace = db.query(Workspace).filter(Workspace.id == current_workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")

    duplicate = (
        db.query(Workspace)
        .filter(func.lower(Workspace.name) == next_name.lower(), Workspace.id != workspace.id)
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A workspace with this name already exists.",
        )

    previous_name = workspace.name
    workspace.name = next_name
    db.add(workspace)
    _record_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="workspace.profile_updated",
        resource_type="workspace",
        resource_id=str(workspace.id),
        details={"previous_name": previous_name, "workspace_name": next_name},
    )
    db.commit()
    db.refresh(workspace)

    return WorkspaceProfileResponse(workspace_id=workspace.id, workspace_name=workspace.name)


@router.get("/workspace/billing-summary", response_model=WorkspaceBillingSummaryResponse)
def get_workspace_billing_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    _require_workspace_admin(db, current_user, current_workspace_id)

    workspace = db.query(Workspace).filter(Workspace.id == current_workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")

    member_count = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == current_workspace_id).count()
    material_count = db.query(Material).filter(Material.workspace_id == current_workspace_id).count()
    active_project_count = (
        db.query(Project)
        .filter(Project.workspace_id == current_workspace_id, Project.status == "active")
        .count()
    )
    draft_project_count = (
        db.query(Project)
        .filter(Project.workspace_id == current_workspace_id, Project.status == "draft")
        .count()
    )

    monthly_estimate_total = 0.0
    for project in db.query(Project).filter(Project.workspace_id == current_workspace_id).all():
        monthly_estimate_total += sum(float(item.line_subtotal) for item in project.items)

    return WorkspaceBillingSummaryResponse(
        workspace_id=workspace.id,
        member_count=member_count,
        material_count=material_count,
        active_project_count=active_project_count,
        draft_project_count=draft_project_count,
        monthly_estimate_total=monthly_estimate_total,
        plan_name="BuilderPro Standard",
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
    authorization: str | None = Header(default=None),
):
    inviter_email = _current_user_email_from_token(authorization)

    inviter_user = db.query(User).filter(func.lower(User.email) == inviter_email).first()
    if not inviter_user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inviter profile is not registered.")

    try:
        workspace_id = UUID(str(payload.workspace_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid workspace id.") from exc

    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
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
    invite_url = build_invite_join_url(invite_token, invited_email)
    email_sent = False
    delivery_message = "Invite link created. Email delivery is not configured yet, copy this link for now."
    if is_invite_email_configured():
        invite_url = send_workspace_invite_email(
            invited_email=invited_email,
            workspace_name=workspace.name,
            invite_token=invite_token,
        )
        email_sent = True
        delivery_message = f"Invite email sent to {invited_email}."
    db.commit()

    return CreateInviteResponse(
        invite_token=invite_token,
        workspace_id=str(workspace.id),
        invited_email=invited_email,
        expires_at=expires_at.isoformat(),
        invite_url=invite_url,
        email_sent=email_sent,
        delivery_message=delivery_message,
    )


@router.get("/invites", response_model=list[WorkspaceInviteSummary])
def list_workspace_invites(
    include_expired: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    _require_workspace_admin(db, current_user, current_workspace_id)

    invites = (
        db.query(WorkspaceInvite)
        .filter(
            WorkspaceInvite.workspace_id == current_workspace_id,
            WorkspaceInvite.accepted_at.is_(None),
        )
        .order_by(WorkspaceInvite.created_at.desc())
        .all()
    )

    summaries = [_serialize_workspace_invite(invite) for invite in invites]
    if include_expired:
        return summaries

    return [invite for invite in summaries if not invite.is_expired]


@router.post("/invites/{invite_id}/resend", response_model=CreateInviteResponse)
def resend_workspace_invite(
    invite_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    _require_workspace_admin(db, current_user, current_workspace_id)

    try:
        invite_lookup_id = UUID(str(invite_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid invite id.") from exc

    invite = (
        db.query(WorkspaceInvite)
        .filter(
            WorkspaceInvite.id == invite_lookup_id,
            WorkspaceInvite.workspace_id == current_workspace_id,
        )
        .first()
    )
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found.")

    if invite.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite has already been accepted.")

    invite.invite_token = secrets.token_urlsafe(24)
    invite.expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    invite.invited_by_user_id = current_user.id

    _record_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="member.invite_resent",
        resource_type="workspace_invite",
        resource_id=str(invite.id),
        details={"invited_email": invite.invited_email, "expires_at": invite.expires_at.isoformat()},
    )
    workspace = db.query(Workspace).filter(Workspace.id == invite.workspace_id).first()
    invite_url = build_invite_join_url(invite.invite_token, invite.invited_email)
    email_sent = False
    delivery_message = "Invite link refreshed. Email delivery is not configured yet, copy this link for now."
    if is_invite_email_configured():
        invite_url = send_workspace_invite_email(
            invited_email=invite.invited_email,
            workspace_name=workspace.name if workspace else "your BuilderPro workspace",
            invite_token=invite.invite_token,
        )
        email_sent = True
        delivery_message = f"Invite email resent to {invite.invited_email}."
    db.commit()

    return CreateInviteResponse(
        invite_token=invite.invite_token,
        workspace_id=str(invite.workspace_id),
        invited_email=invite.invited_email,
        expires_at=invite.expires_at.isoformat(),
        invite_url=invite_url,
        email_sent=email_sent,
        delivery_message=delivery_message,
    )


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_workspace_invite(
    invite_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    _require_workspace_admin(db, current_user, current_workspace_id)

    try:
        invite_lookup_id = UUID(str(invite_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid invite id.") from exc

    invite = (
        db.query(WorkspaceInvite)
        .filter(
            WorkspaceInvite.id == invite_lookup_id,
            WorkspaceInvite.workspace_id == current_workspace_id,
        )
        .first()
    )
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found.")

    if invite.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite has already been accepted.")

    _record_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="member.invite_revoked",
        resource_type="workspace_invite",
        resource_id=str(invite.id),
        details={"invited_email": invite.invited_email},
    )
    db.delete(invite)
    db.commit()


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
