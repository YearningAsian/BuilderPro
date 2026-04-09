import csv
import io
import json
import os
from decimal import Decimal, InvalidOperation
from typing import Optional
from uuid import UUID
from uuid import uuid4
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_workspace_id
from app.core.config import SUPABASE_ADMIN_KEY, SUPABASE_STORAGE_BUCKET, SUPABASE_URL
from app.db.base import get_db
from app.models.models import AuditLog, Material, ProjectItem, User, Vendor
from app.schemas.schemas import (
    Material as MaterialSchema,
    MaterialAttachment,
    MaterialAttachmentCreate,
    MaterialCsvImportError,
    MaterialCsvImportSummary,
    MaterialCreate,
    MaterialPriceHistoryEntry,
    MaterialUpdate,
)

router = APIRouter(prefix="/materials", tags=["materials"])


def _record_material_audit_event(
    db: Session,
    *,
    workspace_id,
    user_id,
    action: str,
    material_id: UUID,
    details: dict,
) -> AuditLog:
    event = AuditLog(
        workspace_id=workspace_id,
        user_id=user_id,
        action=action,
        resource_type="material",
        resource_id=str(material_id),
        details=json.dumps(details),
    )
    db.add(event)
    db.flush()
    return event


def _parse_audit_details(event: AuditLog) -> dict:
    if not event.details:
        return {}
    try:
        parsed = json.loads(event.details)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _get_workspace_material(
    db: Session,
    material_id: UUID,
    current_workspace_id,
) -> Material:
    material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.workspace_id == current_workspace_id)
        .first()
    )
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found",
        )
    return material


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_csv_boolean(value: str | None, default: bool = True) -> bool:
    normalized = (value or "").strip().lower()
    if not normalized:
        return default
    return normalized in {"1", "true", "yes", "y", "on"}


def _ensure_supabase_storage_config() -> None:
    if not SUPABASE_URL or not SUPABASE_ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase Storage is not configured on the backend.",
        )


def _upload_file_to_supabase_storage(
    *,
    file_bytes: bytes,
    object_path: str,
    content_type: str,
) -> str:
    _ensure_supabase_storage_config()

    quoted_path = quote(object_path, safe="/")
    url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{quoted_path}"
    request = Request(
        url,
        method="POST",
        data=file_bytes,
        headers={
            "apikey": SUPABASE_ADMIN_KEY,
            "Authorization": f"Bearer {SUPABASE_ADMIN_KEY}",
            "Content-Type": content_type,
            "x-upsert": "false",
        },
    )

    try:
        with urlopen(request, timeout=30):
            return f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{quoted_path}"
    except HTTPError as exc:
        if exc.code == 409:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An attachment with this file path already exists.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to upload file to Supabase Storage.",
        ) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach Supabase Storage.",
        ) from exc


def _delete_file_from_supabase_storage(*, object_path: str) -> None:
    _ensure_supabase_storage_config()

    quoted_path = quote(object_path, safe="/")
    url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{quoted_path}"
    request = Request(
        url,
        method="DELETE",
        headers={
            "apikey": SUPABASE_ADMIN_KEY,
            "Authorization": f"Bearer {SUPABASE_ADMIN_KEY}",
        },
    )

    try:
        with urlopen(request, timeout=20):
            return
    except HTTPError as exc:
        if exc.code == 404:
            return
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to delete file from Supabase Storage.",
        ) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach Supabase Storage.",
        ) from exc


def _build_material_attachment_snapshot(
    db: Session,
    current_workspace_id,
    material_id: UUID,
) -> dict[str, MaterialAttachment]:
    events = (
        db.query(AuditLog)
        .filter(
            AuditLog.workspace_id == current_workspace_id,
            AuditLog.resource_type == "material",
            AuditLog.resource_id == str(material_id),
            AuditLog.action.in_(["materials.attachment_added", "materials.attachment_removed"]),
        )
        .order_by(AuditLog.created_at.asc())
        .all()
    )

    attachments: dict[str, MaterialAttachment] = {}
    for event in events:
        details = _parse_audit_details(event)
        attachment_id = details.get("id")
        if not isinstance(attachment_id, str) or not attachment_id:
            continue

        if event.action == "materials.attachment_added":
            name = details.get("name")
            url = details.get("url")
            if not isinstance(name, str) or not isinstance(url, str):
                continue

            attachments[attachment_id] = MaterialAttachment(
                id=attachment_id,
                material_id=material_id,
                name=name,
                url=url,
                mime_type=details.get("mime_type") if isinstance(details.get("mime_type"), str) else None,
                size_bytes=details.get("size_bytes") if isinstance(details.get("size_bytes"), int) else None,
                uploaded_at=event.created_at,
                uploaded_by_user_id=event.user_id,
            )

        if event.action == "materials.attachment_removed":
            attachments.pop(attachment_id, None)

    return attachments


@router.get("", response_model=list[MaterialSchema])
def list_materials(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get materials for the active workspace."""
    materials = (
        db.query(Material)
        .filter(Material.workspace_id == current_workspace_id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return materials


@router.get("/search")
def search_materials(
    name: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """
    Search materials by optional name and/or category (case-insensitive, partial match).
    Returns a list of material objects as JSON.
    """
    query = db.query(Material).filter(Material.workspace_id == current_workspace_id)
    if name:
        query = query.filter(Material.name.ilike(f"%{name}%"))
    if category:
        query = query.filter(Material.category.ilike(f"%{category}%"))

    materials = query.all()

    results = []
    for m in materials:
        results.append({
            "id": str(m.id),
            "name": m.name,
            "category": m.category,
            "unit_type": m.unit_type,
            "unit_cost": float(m.unit_cost) if m.unit_cost is not None else None,
            "default_vendor_id": str(m.default_vendor_id) if m.default_vendor_id else None,
            "default_waste_pct": float(m.default_waste_pct) if m.default_waste_pct is not None else None,
            "created_at": m.created_at,
        })

    return results


@router.post("/import/csv", response_model=MaterialCsvImportSummary)
def import_materials_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please upload a .csv file.",
        )

    raw_bytes = file.file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV file is empty.",
        )

    try:
        csv_text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV file must be UTF-8 encoded.",
        ) from exc

    reader = csv.DictReader(io.StringIO(csv_text))
    headers = [header.strip().lower() for header in (reader.fieldnames or []) if header and header.strip()]
    required_headers = {"name", "unit_type", "unit_cost"}
    missing_headers = sorted(required_headers - set(headers))
    if missing_headers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"CSV is missing required columns: {', '.join(missing_headers)}",
        )

    vendor_by_name = {
        vendor.name.strip().lower(): vendor.id
        for vendor in db.query(Vendor).filter(Vendor.workspace_id == current_workspace_id).all()
    }
    workspace_materials = db.query(Material).filter(Material.workspace_id == current_workspace_id).all()
    existing_by_sku = {
        material.sku.strip().lower(): material
        for material in workspace_materials
        if material.sku and material.sku.strip()
    }

    created = 0
    updated = 0
    skipped = 0
    errors: list[MaterialCsvImportError] = []

    for row_number, row in enumerate(reader, start=2):
        if row is None:
            skipped += 1
            errors.append(MaterialCsvImportError(row=row_number, message="Row is empty."))
            continue

        normalized_row = {key.strip().lower(): (value or "") for key, value in row.items() if key}
        sku = _normalize_optional_text(normalized_row.get("sku"))
        vendor_name = _normalize_optional_text(normalized_row.get("default_vendor_name") or normalized_row.get("vendor_name"))
        vendor_id = vendor_by_name.get(vendor_name.lower()) if vendor_name else None

        if vendor_name and not vendor_id:
            skipped += 1
            errors.append(
                MaterialCsvImportError(
                    row=row_number,
                    message=f"Vendor '{vendor_name}' was not found in this workspace.",
                )
            )
            continue

        try:
            default_waste_pct_raw = _normalize_optional_text(normalized_row.get("default_waste_pct"))
            unit_cost_raw = _normalize_optional_text(normalized_row.get("unit_cost"))
            if unit_cost_raw is None:
                raise ValueError("unit_cost is required")

            payload = MaterialCreate(
                name=(normalized_row.get("name") or "").strip(),
                category=_normalize_optional_text(normalized_row.get("category")),
                unit_type=(normalized_row.get("unit_type") or "").strip(),
                unit_cost=Decimal(unit_cost_raw),
                sku=sku,
                default_vendor_id=vendor_id,
                size_dims=_normalize_optional_text(normalized_row.get("size_dims")),
                notes=_normalize_optional_text(normalized_row.get("notes")),
                is_taxable=_normalize_csv_boolean(normalized_row.get("is_taxable"), default=True),
                default_waste_pct=Decimal(default_waste_pct_raw) if default_waste_pct_raw is not None else Decimal("0"),
            )
        except (ValidationError, InvalidOperation, ValueError) as exc:
            skipped += 1
            errors.append(
                MaterialCsvImportError(
                    row=row_number,
                    message=str(exc),
                )
            )
            continue

        existing = existing_by_sku.get(payload.sku.strip().lower()) if payload.sku else None

        if existing:
            previous_unit_cost = existing.unit_cost
            existing.name = payload.name
            existing.category = payload.category
            existing.unit_type = payload.unit_type
            existing.unit_cost = payload.unit_cost
            existing.default_vendor_id = payload.default_vendor_id
            existing.size_dims = payload.size_dims
            existing.notes = payload.notes
            existing.is_taxable = payload.is_taxable
            existing.default_waste_pct = payload.default_waste_pct
            db.add(existing)

            if existing.unit_cost != previous_unit_cost:
                _record_material_audit_event(
                    db,
                    workspace_id=current_workspace_id,
                    user_id=current_user.id,
                    action="materials.imported",
                    material_id=existing.id,
                    details={
                        "previous_unit_cost": float(previous_unit_cost),
                        "new_unit_cost": float(existing.unit_cost),
                        "source": "csv",
                    },
                )

            updated += 1
            continue

        created_material = Material(
            workspace_id=current_workspace_id,
            name=payload.name,
            category=payload.category,
            unit_type=payload.unit_type,
            unit_cost=payload.unit_cost,
            sku=payload.sku,
            default_vendor_id=payload.default_vendor_id,
            size_dims=payload.size_dims,
            notes=payload.notes,
            is_taxable=payload.is_taxable,
            default_waste_pct=payload.default_waste_pct,
        )
        db.add(created_material)
        db.flush()

        if payload.sku:
            existing_by_sku[payload.sku.strip().lower()] = created_material

        _record_material_audit_event(
            db,
            workspace_id=current_workspace_id,
            user_id=current_user.id,
            action="materials.imported",
            material_id=created_material.id,
            details={
                "previous_unit_cost": None,
                "new_unit_cost": float(created_material.unit_cost),
                "source": "csv",
            },
        )
        created += 1

    db.commit()
    return MaterialCsvImportSummary(created=created, updated=updated, skipped=skipped, errors=errors[:50])


@router.get("/{material_id}", response_model=MaterialSchema)
def get_material(
    material_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get a material in the active workspace."""
    return _get_workspace_material(db, material_id, current_workspace_id)


@router.get("/{material_id}/price-history", response_model=list[MaterialPriceHistoryEntry])
def list_material_price_history(
    material_id: UUID,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    _get_workspace_material(db, material_id, current_workspace_id)

    bounded_limit = max(1, min(limit, 200))
    events = (
        db.query(AuditLog)
        .filter(
            AuditLog.workspace_id == current_workspace_id,
            AuditLog.resource_type == "material",
            AuditLog.resource_id == str(material_id),
            AuditLog.action.in_(["materials.created", "materials.price_updated", "materials.imported"]),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(bounded_limit)
        .all()
    )

    history: list[MaterialPriceHistoryEntry] = []
    for event in events:
        details = _parse_audit_details(event)
        new_unit_cost = details.get("new_unit_cost")
        if new_unit_cost is None:
            continue

        history.append(
            MaterialPriceHistoryEntry(
                id=event.id,
                material_id=material_id,
                previous_unit_cost=details.get("previous_unit_cost"),
                new_unit_cost=new_unit_cost,
                source=details.get("source") if isinstance(details.get("source"), str) else None,
                changed_by_user_id=event.user_id,
                changed_at=event.created_at,
            )
        )

    return history


@router.get("/{material_id}/attachments", response_model=list[MaterialAttachment])
def list_material_attachments(
    material_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    _get_workspace_material(db, material_id, current_workspace_id)
    attachment_map = _build_material_attachment_snapshot(db, current_workspace_id, material_id)
    return sorted(attachment_map.values(), key=lambda attachment: attachment.uploaded_at, reverse=True)


@router.post("/{material_id}/attachments", response_model=MaterialAttachment, status_code=status.HTTP_201_CREATED)
def create_material_attachment(
    material_id: UUID,
    payload: MaterialAttachmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    _get_workspace_material(db, material_id, current_workspace_id)

    attachment_id = str(uuid4())
    _record_material_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="materials.attachment_added",
        material_id=material_id,
        details={
            "id": attachment_id,
            "name": payload.name,
            "url": payload.url,
            "mime_type": payload.mime_type,
            "size_bytes": payload.size_bytes,
        },
    )
    db.commit()

    attachments = _build_material_attachment_snapshot(db, current_workspace_id, material_id)
    return attachments[attachment_id]


@router.post("/{material_id}/attachments/upload", response_model=MaterialAttachment, status_code=status.HTTP_201_CREATED)
def upload_material_attachment(
    material_id: UUID,
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    _get_workspace_material(db, material_id, current_workspace_id)

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Attachment file name is required.",
        )

    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Attachment file is empty.",
        )

    max_size_bytes = 15 * 1024 * 1024
    if len(file_bytes) > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Attachment exceeds 15MB limit.",
        )

    attachment_id = str(uuid4())
    safe_filename = os.path.basename(file.filename).replace(" ", "-")
    object_path = f"materials/{current_workspace_id}/{material_id}/{attachment_id}-{safe_filename}"
    public_url = _upload_file_to_supabase_storage(
        file_bytes=file_bytes,
        object_path=object_path,
        content_type=file.content_type or "application/octet-stream",
    )

    display_name = _normalize_optional_text(name) or file.filename
    _record_material_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="materials.attachment_added",
        material_id=material_id,
        details={
            "id": attachment_id,
            "name": display_name,
            "url": public_url,
            "mime_type": file.content_type,
            "size_bytes": len(file_bytes),
            "storage_bucket": SUPABASE_STORAGE_BUCKET,
            "storage_path": object_path,
        },
    )
    db.commit()

    attachments = _build_material_attachment_snapshot(db, current_workspace_id, material_id)
    return attachments[attachment_id]


@router.delete("/{material_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material_attachment(
    material_id: UUID,
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    _get_workspace_material(db, material_id, current_workspace_id)
    attachments = _build_material_attachment_snapshot(db, current_workspace_id, material_id)
    if attachment_id not in attachments:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )

    attachment_details: dict = {}
    attachment_add_events = (
        db.query(AuditLog)
        .filter(
            AuditLog.workspace_id == current_workspace_id,
            AuditLog.resource_type == "material",
            AuditLog.resource_id == str(material_id),
            AuditLog.action == "materials.attachment_added",
        )
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    for event in attachment_add_events:
        details = _parse_audit_details(event)
        if details.get("id") == attachment_id:
            attachment_details = details
            break

    storage_path = attachment_details.get("storage_path")
    if isinstance(storage_path, str) and storage_path:
        _delete_file_from_supabase_storage(object_path=storage_path)

    _record_material_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="materials.attachment_removed",
        material_id=material_id,
        details={"id": attachment_id},
    )
    db.commit()
    return None


@router.post("", response_model=MaterialSchema, status_code=status.HTTP_201_CREATED)
def create_material(
    material: MaterialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Create a new material in the active workspace."""
    if material.default_vendor_id:
        vendor = (
            db.query(Vendor)
            .filter(Vendor.id == material.default_vendor_id, Vendor.workspace_id == current_workspace_id)
            .first()
        )
        if not vendor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor not found"
            )
    
    db_material = Material(**material.model_dump(), workspace_id=current_workspace_id)
    db.add(db_material)
    db.flush()

    _record_material_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="materials.created",
        material_id=db_material.id,
        details={
            "previous_unit_cost": None,
            "new_unit_cost": float(db_material.unit_cost),
            "source": "manual",
        },
    )

    db.commit()
    db.refresh(db_material)
    return db_material


@router.put("/{material_id}", response_model=MaterialSchema)
def update_material(
    material_id: UUID,
    material: MaterialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Update a material in the active workspace."""
    db_material = _get_workspace_material(db, material_id, current_workspace_id)
    
    update_data = material.model_dump(exclude_unset=True)
    vendor_id = update_data.get("default_vendor_id")
    if vendor_id:
        vendor = (
            db.query(Vendor)
            .filter(Vendor.id == vendor_id, Vendor.workspace_id == current_workspace_id)
            .first()
        )
        if not vendor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor not found"
            )

    previous_unit_cost = db_material.unit_cost
    for field, value in update_data.items():
        setattr(db_material, field, value)

    if "unit_cost" in update_data and db_material.unit_cost != previous_unit_cost:
        _record_material_audit_event(
            db,
            workspace_id=current_workspace_id,
            user_id=current_user.id,
            action="materials.price_updated",
            material_id=db_material.id,
            details={
                "previous_unit_cost": float(previous_unit_cost),
                "new_unit_cost": float(db_material.unit_cost),
                "source": "manual",
            },
        )
    
    db.add(db_material)
    db.commit()
    db.refresh(db_material)
    return db_material


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(
    material_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Delete a material in the active workspace unless it is already in use."""
    db_material = _get_workspace_material(db, material_id, current_workspace_id)

    in_use = (
        db.query(ProjectItem)
        .filter(ProjectItem.material_id == material_id, ProjectItem.workspace_id == current_workspace_id)
        .first()
    )
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete material: it is referenced by one or more project items"
        )

    db.delete(db_material)
    db.commit()
    return None


