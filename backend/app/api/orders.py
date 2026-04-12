from datetime import datetime, timezone
from html import escape
import json
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_workspace_id
from app.db.base import get_db
from app.models.models import AuditLog, Material, Project, ProjectItem, User, Vendor
from app.schemas.schemas import (
    ProjectItem as ProjectItemSchema,
    ProjectItemCreate,
    ProjectItemUpdate,
    PurchaseOrder as PurchaseOrderSchema,
    PurchaseOrderCreate,
    PurchaseOrderLine,
    PurchaseOrderUpdate,
)

router = APIRouter(prefix="/orders", tags=["orders"])


class BulkOrderStatusUpdateRequest(BaseModel):
    vendor_id: UUID
    from_status: str = "ready"
    to_status: str
    po_number: str | None = None
    expected_delivery_at: datetime | None = None
    carrier: str | None = None
    tracking_number: str | None = None
    tracking_url: str | None = None

    @field_validator("carrier")
    @classmethod
    def normalize_carrier(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.strip().split())
        return normalized or None

    @field_validator("tracking_url")
    @classmethod
    def validate_tracking_url(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized = value.strip()
        if not normalized:
            return None

        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("tracking_url must be a valid absolute http(s) URL")

        return normalized


class BulkOrderStatusUpdateResponse(BaseModel):
    updated_count: int
    order_ids: list[UUID]


def _resolve_purchase_order_status(items: list[ProjectItem]) -> str:
    statuses = {item.order_status for item in items}
    if statuses == {"received"}:
        return "received"
    if "ordered" in statuses:
        return "ordered"
    if statuses == {"cancelled"}:
        return "cancelled"
    return "draft"


def _build_purchase_order_summary(po_number: str, vendor: Vendor, rows: list[tuple[ProjectItem, Project, Material]]) -> PurchaseOrderSchema:
    items = [item for item, _, _ in rows]
    expected_delivery_at = max(
        (item.expected_delivery_at for item in items if item.expected_delivery_at is not None),
        default=None,
    )
    ordered_at = min((item.ordered_at for item in items if item.ordered_at is not None), default=None)
    received_at = max((item.received_at for item in items if item.received_at is not None), default=None)
    updated_at = max(item.updated_at for item in items)
    total_amount = sum(item.line_subtotal for item in items)
    purchase_notes = next((item.purchase_notes for item in items if item.purchase_notes), None)
    carrier = next((item.carrier for item in items if item.carrier), None)
    tracking_number = next((item.tracking_number for item in items if item.tracking_number), None)
    tracking_url = next((item.tracking_url for item in items if item.tracking_url), None)

    lines = [
        PurchaseOrderLine(
            id=item.id,
            project_id=project.id,
            project_name=project.name,
            material_id=material.id,
            material_name=material.name,
            quantity=item.quantity,
            total_qty=item.total_qty,
            unit_type=item.unit_type,
            unit_cost=item.unit_cost,
            line_subtotal=item.line_subtotal,
            order_status=item.order_status,
            notes=item.notes,
            purchase_notes=item.purchase_notes,
        )
        for item, project, material in rows
    ]

    return PurchaseOrderSchema(
        po_number=po_number,
        vendor_id=vendor.id,
        vendor_name=vendor.name,
        vendor_email=vendor.email,
        vendor_phone=vendor.phone,
        order_status=_resolve_purchase_order_status(items),
        line_count=len(lines),
        total_amount=total_amount,
        expected_delivery_at=expected_delivery_at,
        carrier=carrier,
        tracking_number=tracking_number,
        tracking_url=tracking_url,
        ordered_at=ordered_at,
        received_at=received_at,
        updated_at=updated_at,
        lines=lines,
    )


def _purchase_order_rows_for_workspace(db: Session, current_workspace_id):
    return (
        db.query(ProjectItem, Project, Material, Vendor)
        .join(Project, Project.id == ProjectItem.project_id)
        .join(Material, Material.id == ProjectItem.material_id)
        .join(Vendor, Vendor.id == Material.default_vendor_id)
        .filter(
            Project.workspace_id == current_workspace_id,
            ProjectItem.po_number.isnot(None),
            Material.default_vendor_id.isnot(None),
        )
        .order_by(ProjectItem.updated_at.desc())
        .all()
    )


def _purchase_order_by_number(
    db: Session,
    *,
    po_number: str,
    current_workspace_id,
) -> tuple[PurchaseOrderSchema, list[tuple[ProjectItem, Project, Material, Vendor]]]:
    normalized_po = po_number.strip()
    rows = [
        row
        for row in _purchase_order_rows_for_workspace(db, current_workspace_id)
        if row[0].po_number == normalized_po
    ]
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found.")

    vendor = rows[0][3]
    summary_rows = [(item, project, material) for item, project, material, _ in rows]
    return _build_purchase_order_summary(normalized_po, vendor, summary_rows), rows


def _record_order_audit_event(
    db: Session,
    *,
    workspace_id,
    user_id,
    action: str,
    resource_type: str,
    resource_id: str | None,
    details: dict | None = None,
) -> None:
    event = AuditLog(
        workspace_id=workspace_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=json.dumps(details) if details is not None else None,
    )
    db.add(event)


def _apply_status_transition(update_data: dict, db_item: ProjectItem) -> dict:
    if "order_status" not in update_data:
        return update_data

    now = datetime.now(timezone.utc)
    next_status = update_data["order_status"]

    if next_status == "draft":
        update_data["ordered_at"] = None
        update_data["received_at"] = None
    elif next_status == "ordered":
        update_data["ordered_at"] = db_item.ordered_at or now
        update_data["received_at"] = None
    elif next_status == "received":
        update_data["ordered_at"] = db_item.ordered_at or now
        update_data["received_at"] = db_item.received_at or now
    elif next_status == "cancelled":
        update_data["received_at"] = None

    return update_data


def _status_matches_bucket(item: ProjectItem, project: Project, status_bucket: str, vendor_id: UUID, material: Material) -> bool:
    if material.default_vendor_id != vendor_id:
        return False

    status_bucket = status_bucket.lower()
    if status_bucket == "ready":
        return (
            project.status == "active"
            and item.order_status == "draft"
            and material.default_vendor_id is not None
        )
    if status_bucket == "ordered":
        return item.order_status == "ordered"
    if status_bucket == "received":
        return item.order_status == "received"
    if status_bucket == "draft":
        return item.order_status == "draft"
    if status_bucket == "cancelled":
        return item.order_status == "cancelled"
    return False


@router.get("", response_model=list[ProjectItemSchema])
def list_orders(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get project items for the active workspace."""
    items = (
        db.query(ProjectItem)
        .join(Project, Project.id == ProjectItem.project_id)
        .filter(Project.workspace_id == current_workspace_id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items


@router.get("/{item_id:uuid}", response_model=ProjectItemSchema)
def get_order(
    item_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get a project item (order) in the active workspace."""
    item = (
        db.query(ProjectItem)
        .join(Project, Project.id == ProjectItem.project_id)
        .filter(ProjectItem.id == item_id, Project.workspace_id == current_workspace_id)
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    return item


@router.post("", response_model=ProjectItemSchema, status_code=status.HTTP_201_CREATED)
def create_order(
    item: ProjectItemCreate,
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Create a new project item (order) for a project in the active workspace."""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.workspace_id == current_workspace_id)
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check if material exists in the same workspace
    material = (
        db.query(Material)
        .filter(Material.id == item.material_id, Material.workspace_id == current_workspace_id)
        .first()
    )
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    
    # Calculate total_qty and line_subtotal
    total_qty = item.quantity * (1 + item.waste_pct / 100)
    line_subtotal = total_qty * item.unit_cost
    now = datetime.now(timezone.utc)
    ordered_at = now if item.order_status in {"ordered", "received"} else None
    received_at = now if item.order_status == "received" else None

    db_item = ProjectItem(
        project_id=project_id,
        material_id=item.material_id,
        quantity=item.quantity,
        unit_type=item.unit_type,
        unit_cost=item.unit_cost,
        waste_pct=item.waste_pct,
        total_qty=total_qty,
        line_subtotal=line_subtotal,
        order_status=item.order_status,
        po_number=item.po_number,
        purchase_notes=item.purchase_notes,
        expected_delivery_at=item.expected_delivery_at,
        carrier=item.carrier,
        tracking_number=item.tracking_number,
        tracking_url=item.tracking_url,
        notes=item.notes,
        ordered_at=ordered_at,
        received_at=received_at,
        workspace_id=current_workspace_id,
    )
    
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/{item_id:uuid}", response_model=ProjectItemSchema)
def update_order(
    item_id: UUID,
    item: ProjectItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Update a project item (order) in the active workspace."""
    db_item = (
        db.query(ProjectItem)
        .join(Project, Project.id == ProjectItem.project_id)
        .filter(ProjectItem.id == item_id, Project.workspace_id == current_workspace_id)
        .first()
    )
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    update_data = item.model_dump(exclude_unset=True)

    # Recalculate totals if quantity, unit_cost, or waste_pct changed
    if "quantity" in update_data or "waste_pct" in update_data or "unit_cost" in update_data:
        quantity = update_data.get("quantity", db_item.quantity)
        waste_pct = update_data.get("waste_pct", db_item.waste_pct)
        unit_cost = update_data.get("unit_cost", db_item.unit_cost)

        total_qty = quantity * (1 + waste_pct / 100)
        line_subtotal = total_qty * unit_cost

        update_data["total_qty"] = total_qty
        update_data["line_subtotal"] = line_subtotal

    update_data = _apply_status_transition(update_data, db_item)

    for field, value in update_data.items():
        setattr(db_item, field, value)
    
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.post("/bulk-status", response_model=BulkOrderStatusUpdateResponse)
def bulk_update_vendor_orders(
    payload: BulkOrderStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    if payload.to_status not in {"draft", "ordered", "received", "cancelled"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid to_status value.")

    vendor = (
        db.query(Vendor)
        .filter(Vendor.id == payload.vendor_id, Vendor.workspace_id == current_workspace_id)
        .first()
    )
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found.")

    records = (
        db.query(ProjectItem, Project, Material)
        .join(Project, Project.id == ProjectItem.project_id)
        .join(Material, Material.id == ProjectItem.material_id)
        .filter(Project.workspace_id == current_workspace_id)
        .all()
    )

    updated_ids: list[UUID] = []
    for item, project, material in records:
        if not _status_matches_bucket(item, project, payload.from_status, payload.vendor_id, material):
            continue

        patch = {
            "order_status": payload.to_status,
        }

        if payload.po_number is not None:
            patch["po_number"] = payload.po_number.strip() or None
        if payload.expected_delivery_at is not None:
            patch["expected_delivery_at"] = payload.expected_delivery_at
        if payload.carrier is not None:
            patch["carrier"] = payload.carrier.strip() or None
        if payload.tracking_number is not None:
            patch["tracking_number"] = payload.tracking_number.strip() or None
        if payload.tracking_url is not None:
            patch["tracking_url"] = payload.tracking_url.strip() or None

        patch = _apply_status_transition(patch, item)

        for field, value in patch.items():
            setattr(item, field, value)

        db.add(item)
        updated_ids.append(item.id)

    _record_order_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="orders.bulk_status_updated",
        resource_type="vendor",
        resource_id=str(vendor.id),
        details={
            "vendor_name": vendor.name,
            "from_status": payload.from_status,
            "to_status": payload.to_status,
            "updated_count": len(updated_ids),
            "po_number": payload.po_number,
            "expected_delivery_at": payload.expected_delivery_at.isoformat() if payload.expected_delivery_at else None,
            "carrier": payload.carrier,
            "tracking_number": payload.tracking_number,
            "tracking_url": payload.tracking_url,
        },
    )
    db.commit()

    return BulkOrderStatusUpdateResponse(updated_count=len(updated_ids), order_ids=updated_ids)


@router.get("/purchase-orders", response_model=list[PurchaseOrderSchema])
def list_purchase_orders(
    vendor_id: UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    del current_user
    active_vendor_id = vendor_id if isinstance(vendor_id, UUID) else None

    grouped: dict[str, dict[str, object]] = {}
    for item, project, material, vendor in _purchase_order_rows_for_workspace(db, current_workspace_id):
        if active_vendor_id is not None and vendor.id != active_vendor_id:
            continue

        entry = grouped.setdefault(
            item.po_number,
            {
                "vendor": vendor,
                "rows": [],
            },
        )
        entry["rows"].append((item, project, material))

    orders = [
        _build_purchase_order_summary(po_number, entry["vendor"], entry["rows"])
        for po_number, entry in grouped.items()
    ]

    if isinstance(status_filter, str):
        normalized_status = status_filter.lower()
        orders = [order for order in orders if order.order_status == normalized_status]

    return sorted(orders, key=lambda order: order.updated_at, reverse=True)


@router.post("/purchase-orders", response_model=PurchaseOrderSchema, status_code=status.HTTP_201_CREATED)
def create_purchase_order(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    vendor = (
        db.query(Vendor)
        .filter(Vendor.id == payload.vendor_id, Vendor.workspace_id == current_workspace_id)
        .first()
    )
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found.")

    existing_po = (
        db.query(ProjectItem.id)
        .join(Project, Project.id == ProjectItem.project_id)
        .filter(
            Project.workspace_id == current_workspace_id,
            ProjectItem.po_number == payload.po_number,
        )
        .first()
    )
    if existing_po:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="PO number already exists in this workspace.")

    records = (
        db.query(ProjectItem, Project, Material)
        .join(Project, Project.id == ProjectItem.project_id)
        .join(Material, Material.id == ProjectItem.material_id)
        .filter(
            Project.workspace_id == current_workspace_id,
            ProjectItem.id.in_(payload.item_ids),
        )
        .all()
    )
    if len(records) != len(payload.item_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more order lines were not found.")

    updated_rows: list[tuple[ProjectItem, Project, Material]] = []
    for item, project, material in records:
        if material.default_vendor_id != vendor.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="All selected lines must belong to the same vendor.",
            )
        if project.status != "active":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Purchase orders can only be created from active project lines.",
            )
        if item.po_number:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="One or more selected lines already belong to a purchase order.",
            )

        patch = _apply_status_transition({"order_status": "ordered"}, item)
        item.po_number = payload.po_number
        item.purchase_notes = payload.purchase_notes
        item.expected_delivery_at = payload.expected_delivery_at
        item.carrier = payload.carrier
        item.tracking_number = payload.tracking_number
        item.tracking_url = payload.tracking_url
        for field, value in patch.items():
            setattr(item, field, value)
        db.add(item)
        updated_rows.append((item, project, material))

    _record_order_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="orders.purchase_order_created",
        resource_type="purchase_order",
        resource_id=payload.po_number,
        details={
            "po_number": payload.po_number,
            "vendor_id": str(vendor.id),
            "vendor_name": vendor.name,
            "line_count": len(updated_rows),
        },
    )
    db.commit()

    return _build_purchase_order_summary(payload.po_number, vendor, updated_rows)


@router.get("/purchase-orders/{po_number}", response_model=PurchaseOrderSchema)
def get_purchase_order(
    po_number: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    del current_user
    summary, _ = _purchase_order_by_number(db, po_number=po_number, current_workspace_id=current_workspace_id)
    return summary


@router.patch("/purchase-orders/{po_number}", response_model=PurchaseOrderSchema)
def update_purchase_order(
    po_number: str,
    payload: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    summary, rows = _purchase_order_by_number(db, po_number=po_number, current_workspace_id=current_workspace_id)
    update_data = payload.model_dump(exclude_unset=True)

    for item, _, _, _ in rows:
        patch = dict(update_data)
        if "order_status" in patch:
            patch = _apply_status_transition(patch, item)

        for field, value in patch.items():
            setattr(item, field, value)
        db.add(item)

    _record_order_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="orders.purchase_order_updated",
        resource_type="purchase_order",
        resource_id=summary.po_number,
        details={"po_number": summary.po_number},
    )
    db.commit()

    updated_summary, _ = _purchase_order_by_number(db, po_number=po_number, current_workspace_id=current_workspace_id)
    return updated_summary


@router.get("/vendor/{vendor_id}/po-document", response_class=Response)
def vendor_purchase_order_document(
    vendor_id: UUID,
    include_status: str = Query(default="ready", description="ready,ordered,received,draft,cancelled"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    vendor = (
        db.query(Vendor)
        .filter(Vendor.id == vendor_id, Vendor.workspace_id == current_workspace_id)
        .first()
    )
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found.")

    rows = (
        db.query(ProjectItem, Project, Material)
        .join(Project, Project.id == ProjectItem.project_id)
        .join(Material, Material.id == ProjectItem.material_id)
        .filter(
            Project.workspace_id == current_workspace_id,
            Material.default_vendor_id == vendor_id,
        )
        .order_by(Project.name.asc(), Material.name.asc())
        .all()
    )

    selected_rows = [
        (item, project, material)
        for item, project, material in rows
        if _status_matches_bucket(item, project, include_status, vendor_id, material)
    ]

    total = sum(float(item.line_subtotal) for item, _, _ in selected_rows)
    generated_at = datetime.now(timezone.utc).isoformat()

    _record_order_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="orders.po_document_generated",
        resource_type="vendor",
        resource_id=str(vendor.id),
        details={
            "vendor_name": vendor.name,
            "include_status": include_status,
            "line_count": len(selected_rows),
            "batch_total": round(total, 2),
        },
    )
    db.commit()

    table_rows = "".join(
        [
            (
                "<tr>"
                f"<td>{escape(project.name)}</td>"
                f"<td>{escape(material.name)}</td>"
                f"<td>{escape(str(item.total_qty))} {escape(item.unit_type)}</td>"
                f"<td>${float(item.unit_cost):,.2f}</td>"
                f"<td>${float(item.line_subtotal):,.2f}</td>"
                f"<td>{escape(item.po_number or '')}</td>"
                "</tr>"
            )
            for item, project, material in selected_rows
        ]
    )

    html = f"""
<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\" />
  <title>Purchase Order - {escape(vendor.name)}</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }}
    h1 {{ margin-bottom: 4px; }}
    .meta {{ margin-bottom: 16px; color: #4b5563; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
    th, td {{ border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }}
    th {{ background: #f3f4f6; }}
    .totals {{ margin-top: 12px; font-weight: bold; }}
    .controls {{ margin-top: 16px; }}
    @media print {{ .controls {{ display: none; }} body {{ margin: 0; }} }}
  </style>
</head>
<body>
  <h1>Purchase Order</h1>
  <div class=\"meta\">Vendor: {escape(vendor.name)} | Email: {escape(vendor.email or 'N/A')} | Generated: {escape(generated_at)} | Filter: {escape(include_status)}</div>
  <table>
    <thead>
      <tr>
        <th>Project</th>
        <th>Material</th>
        <th>Quantity</th>
        <th>Unit Cost</th>
        <th>Line Total</th>
        <th>PO Number</th>
      </tr>
    </thead>
    <tbody>{table_rows if table_rows else '<tr><td colspan="6">No matching line items for this filter.</td></tr>'}</tbody>
  </table>
  <div class=\"totals\">Batch Total: ${total:,.2f}</div>
  <div class=\"controls\"><button onclick=\"window.print()\">Print / Save as PDF</button></div>
</body>
</html>
"""

    return Response(content=html, media_type="text/html")


@router.get("/purchase-orders/{po_number}/document", response_class=Response)
def purchase_order_document(
    po_number: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    summary, rows = _purchase_order_by_number(db, po_number=po_number, current_workspace_id=current_workspace_id)
    generated_at = datetime.now(timezone.utc).isoformat()

    _record_order_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="orders.purchase_order_document_generated",
        resource_type="purchase_order",
        resource_id=summary.po_number,
        details={
            "po_number": summary.po_number,
            "line_count": summary.line_count,
            "batch_total": round(float(summary.total_amount), 2),
        },
    )
    db.commit()

    table_rows = "".join(
        [
            (
                "<tr>"
                f"<td>{escape(project.name)}</td>"
                f"<td>{escape(material.name)}</td>"
                f"<td>{escape(str(item.total_qty))} {escape(item.unit_type)}</td>"
                f"<td>${float(item.unit_cost):,.2f}</td>"
                f"<td>${float(item.line_subtotal):,.2f}</td>"
                f"<td>{escape(item.purchase_notes or '')}</td>"
                "</tr>"
            )
            for item, project, material, _ in rows
        ]
    )

    html = f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Purchase Order - {escape(summary.po_number)}</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }}
    h1 {{ margin-bottom: 4px; }}
    .meta {{ margin-bottom: 16px; color: #4b5563; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
    th, td {{ border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }}
    th {{ background: #f3f4f6; }}
    .totals {{ margin-top: 12px; font-weight: bold; }}
    .controls {{ margin-top: 16px; }}
    @media print {{ .controls {{ display: none; }} body {{ margin: 0; }} }}
  </style>
</head>
<body>
  <h1>Purchase Order {escape(summary.po_number)}</h1>
  <div class="meta">Vendor: {escape(summary.vendor_name)} | Email: {escape(summary.vendor_email or 'N/A')} | Generated: {escape(generated_at)}</div>
  <div class="meta">Carrier: {escape(summary.carrier or 'N/A')} | Tracking: {escape(summary.tracking_number or 'N/A')} | ETA: {escape(summary.expected_delivery_at.isoformat() if summary.expected_delivery_at else 'N/A')}</div>
  <table>
    <thead>
      <tr>
        <th>Project</th>
        <th>Material</th>
        <th>Quantity</th>
        <th>Unit Cost</th>
        <th>Line Total</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>{table_rows if table_rows else '<tr><td colspan="6">No matching line items.</td></tr>'}</tbody>
  </table>
  <div class="totals">Batch Total: ${float(summary.total_amount):,.2f}</div>
  <div class="controls"><button onclick="window.print()">Print / Save as PDF</button></div>
</body>
</html>
"""

    return Response(content=html, media_type="text/html")


@router.delete("/{item_id:uuid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(
    item_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Delete a project item (order) in the active workspace."""
    db_item = (
        db.query(ProjectItem)
        .join(Project, Project.id == ProjectItem.project_id)
        .filter(ProjectItem.id == item_id, Project.workspace_id == current_workspace_id)
        .first()
    )
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    db.delete(db_item)
    db.commit()
    return None
