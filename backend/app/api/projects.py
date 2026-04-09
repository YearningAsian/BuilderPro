from datetime import datetime, timezone
from decimal import Decimal
from html import escape
import json
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, condecimal
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_workspace_id
from app.db.base import get_db
from app.models.models import AuditLog, Customer, Material, Project, ProjectItem, User
from app.schemas.schemas import Project as ProjectSchema, ProjectCreate, ProjectDetail, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


def _record_project_audit_event(
    db: Session,
    *,
    workspace_id,
    user_id,
    action: str,
    resource_id: str | None,
    details: dict | None = None,
) -> None:
    event = AuditLog(
        workspace_id=workspace_id,
        user_id=user_id,
        action=action,
        resource_type="project",
        resource_id=resource_id,
        details=json.dumps(details) if details is not None else None,
    )
    db.add(event)


class DuplicateProjectRequest(BaseModel):
    name: str | None = Field(
        default=None,
        description="Optional name override for the duplicated project.",
    )
    include_items: bool = Field(
        default=True,
        description="When false, duplicate metadata only and skip line items.",
    )


class DuplicateProjectResponse(BaseModel):
    project: ProjectSchema
    duplicated_items: int


@router.get("", response_model=list[ProjectSchema])
def list_projects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get projects for the signed-in user's active workspace."""
    projects = (
        db.query(Project)
        .filter(Project.workspace_id == current_workspace_id)
        .order_by(Project.updated_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return projects


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get a project in the signed-in user's active workspace."""
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
    return project


@router.post("", response_model=ProjectSchema, status_code=status.HTTP_201_CREATED)
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Create a new project in the signed-in user's active workspace."""
    customer = (
        db.query(Customer)
        .filter(Customer.id == project.customer_id, Customer.workspace_id == current_workspace_id)
        .first()
    )
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )

    db_project = Project(
        **project.model_dump(),
        created_by=current_user.id,
        workspace_id=current_workspace_id,
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.put("/{project_id}", response_model=ProjectSchema)
def update_project(
    project_id: UUID,
    project: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Update a project in the signed-in user's active workspace."""
    db_project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.workspace_id == current_workspace_id)
        .first()
    )
    if not db_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    update_data = project.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_project, field, value)

    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Delete a project in the signed-in user's active workspace."""
    db_project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.workspace_id == current_workspace_id)
        .first()
    )
    if not db_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    db.delete(db_project)
    db.commit()
    return None


@router.post("/{project_id}/duplicate", response_model=DuplicateProjectResponse, status_code=status.HTTP_201_CREATED)
def duplicate_project(
    project_id: UUID,
    payload: DuplicateProjectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Duplicate a project (and optionally its line items) within the active workspace."""
    source_project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.workspace_id == current_workspace_id)
        .first()
    )
    if not source_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    requested_name = (payload.name or "").strip()
    base_name = requested_name or f"{source_project.name} (Copy)"
    existing_names = {
        row[0]
        for row in (
            db.query(Project.name)
            .filter(Project.workspace_id == current_workspace_id)
            .all()
        )
    }
    duplicate_name = base_name
    suffix = 2
    while duplicate_name in existing_names:
        duplicate_name = f"{base_name} {suffix}"
        suffix += 1

    duplicated_project = Project(
        name=duplicate_name,
        customer_id=source_project.customer_id,
        status="draft",
        default_tax_pct=source_project.default_tax_pct,
        default_waste_pct=source_project.default_waste_pct,
        created_by=current_user.id,
        workspace_id=current_workspace_id,
    )
    db.add(duplicated_project)
    db.flush()

    duplicated_items = 0
    if payload.include_items:
        for source_item in source_project.items:
            cloned_item = ProjectItem(
                workspace_id=current_workspace_id,
                project_id=duplicated_project.id,
                material_id=source_item.material_id,
                quantity=source_item.quantity,
                unit_type=source_item.unit_type,
                unit_cost=source_item.unit_cost,
                waste_pct=source_item.waste_pct,
                total_qty=source_item.total_qty,
                line_subtotal=source_item.line_subtotal,
                order_status="draft",
                po_number=None,
                purchase_notes=source_item.purchase_notes,
                expected_delivery_at=None,
                carrier=None,
                tracking_number=None,
                tracking_url=None,
                notes=source_item.notes,
                ordered_at=None,
                received_at=None,
            )
            db.add(cloned_item)
            duplicated_items += 1

    _record_project_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="projects.duplicated",
        resource_id=str(duplicated_project.id),
        details={
            "source_project_id": str(source_project.id),
            "source_project_name": source_project.name,
            "duplicated_project_name": duplicated_project.name,
            "duplicated_items": duplicated_items,
            "include_items": payload.include_items,
        },
    )
    db.commit()
    db.refresh(duplicated_project)

    return DuplicateProjectResponse(project=duplicated_project, duplicated_items=duplicated_items)


@router.get("/{project_id}/estimate-document", response_class=Response)
def project_estimate_document(
    project_id: UUID,
    markup_pct: float = Query(default=0.0, ge=0.0, le=500.0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Generate a print-ready estimate document (suitable for browser Save as PDF)."""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.workspace_id == current_workspace_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    customer = (
        db.query(Customer)
        .filter(Customer.id == project.customer_id, Customer.workspace_id == current_workspace_id)
        .first()
    )

    item_rows = []
    cost_subtotal = 0.0
    for item in project.items:
        material = (
            db.query(Material)
            .filter(Material.id == item.material_id, Material.workspace_id == current_workspace_id)
            .first()
        )
        line_cost = float(item.line_subtotal)
        line_price = line_cost * (1.0 + (markup_pct / 100.0))
        cost_subtotal += line_cost
        item_rows.append(
            {
                "material_name": material.name if material else "Unknown material",
                "quantity": float(item.quantity),
                "unit_type": item.unit_type,
                "waste_pct": float(item.waste_pct),
                "unit_cost": float(item.unit_cost),
                "line_cost": line_cost,
                "line_price": line_price,
            }
        )

    markup_amount = cost_subtotal * (markup_pct / 100.0)
    subtotal_with_markup = cost_subtotal + markup_amount
    tax_rate = float(project.default_tax_pct or 0.0) / 100.0
    tax_amount = subtotal_with_markup * tax_rate
    grand_total = subtotal_with_markup + tax_amount
    generated_at = datetime.now(timezone.utc).isoformat()

    _record_project_audit_event(
        db,
        workspace_id=current_workspace_id,
        user_id=current_user.id,
        action="projects.estimate_document_generated",
        resource_id=str(project.id),
        details={
            "project_name": project.name,
            "markup_pct": markup_pct,
            "line_count": len(item_rows),
            "grand_total": round(grand_total, 2),
        },
    )
    db.commit()

    row_html = "".join(
        [
            (
                "<tr>"
                f"<td>{escape(row['material_name'])}</td>"
                f"<td>{row['quantity']:.2f} {escape(row['unit_type'])}</td>"
                f"<td>{row['waste_pct']:.2f}%</td>"
                f"<td>${row['unit_cost']:,.2f}</td>"
                f"<td>${row['line_cost']:,.2f}</td>"
                f"<td>${row['line_price']:,.2f}</td>"
                "</tr>"
            )
            for row in item_rows
        ]
    )

    html = f"""
<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\" />
  <title>Estimate - {escape(project.name)}</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 24px; color: #111827; }}
    h1 {{ margin: 0 0 6px; }}
    .muted {{ color: #4b5563; margin-bottom: 16px; }}
    .grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 16px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
    th, td {{ border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }}
    th {{ background: #f9fafb; }}
    .totals {{ margin-top: 14px; max-width: 340px; margin-left: auto; }}
    .totals-row {{ display: flex; justify-content: space-between; margin: 4px 0; }}
    .controls {{ margin-top: 16px; }}
    @media print {{ .controls {{ display: none; }} body {{ margin: 0; }} }}
  </style>
</head>
<body>
  <h1>Project Estimate</h1>
  <p class=\"muted\">Generated: {escape(generated_at)}</p>
  <div class=\"grid\">
    <div><strong>Project:</strong> {escape(project.name)}</div>
    <div><strong>Status:</strong> {escape(project.status)}</div>
    <div><strong>Customer:</strong> {escape(customer.name if customer else 'N/A')}</div>
    <div><strong>Markup:</strong> {markup_pct:.2f}%</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Material</th>
        <th>Quantity</th>
        <th>Waste</th>
        <th>Unit Cost</th>
        <th>Line Cost</th>
        <th>Line Price</th>
      </tr>
    </thead>
    <tbody>{row_html if row_html else '<tr><td colspan="6">No line items in this estimate.</td></tr>'}</tbody>
  </table>
  <div class=\"totals\">
    <div class=\"totals-row\"><span>Cost Subtotal</span><strong>${cost_subtotal:,.2f}</strong></div>
    <div class=\"totals-row\"><span>Markup ({markup_pct:.2f}%)</span><strong>${markup_amount:,.2f}</strong></div>
    <div class=\"totals-row\"><span>Subtotal with Markup</span><strong>${subtotal_with_markup:,.2f}</strong></div>
    <div class=\"totals-row\"><span>Tax ({float(project.default_tax_pct or 0.0):.2f}%)</span><strong>${tax_amount:,.2f}</strong></div>
    <div class=\"totals-row\"><span>Grand Total</span><strong>${grand_total:,.2f}</strong></div>
  </div>
  <div class=\"controls\"><button onclick=\"window.print()\">Print / Save as PDF</button></div>
</body>
</html>
"""

    return Response(content=html, media_type="text/html")


class LineItemCreate(BaseModel):
    material_id: UUID
    quantity: condecimal(gt=0) = Field(..., description="Base ordered quantity (must be > 0)")
    waste_pct: Optional[condecimal(ge=0)] = Field(None, description="Waste percentage (optional). If omitted, uses material.default_waste_pct")
    order_status: Literal["draft", "ordered", "received", "cancelled"] = "draft"
    po_number: Optional[str] = None
    purchase_notes: Optional[str] = None


class LineItemResponse(BaseModel):
    id: UUID
    project_id: UUID
    material_id: UUID
    quantity: Decimal
    waste_pct: Decimal
    total_qty: Decimal
    line_subtotal: Decimal
    order_status: Literal["draft", "ordered", "received", "cancelled"]
    po_number: Optional[str] = None
    purchase_notes: Optional[str] = None
    ordered_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("/{project_id}/items", response_model=LineItemResponse, status_code=status.HTTP_201_CREATED)
def add_project_line_item(
    project_id: UUID,
    payload: LineItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    # Validate project exists in the active workspace
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.workspace_id == current_workspace_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Validate material exists in the same workspace
    material = (
        db.query(Material)
        .filter(Material.id == payload.material_id, Material.workspace_id == current_workspace_id)
        .first()
    )
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")

    # Determine effective waste_pct: request value if provided, otherwise material.default_waste_pct or 0
    if payload.waste_pct is not None:
        waste_pct = float(payload.waste_pct)
    else:
        waste_pct = float(material.default_waste_pct or 0.0)

    qty = float(payload.quantity)
    total_qty = qty * (1.0 + (waste_pct / 100.0))
    unit_cost = float(material.unit_cost or 0.0)
    line_subtotal = total_qty * unit_cost

    order_status = payload.order_status
    ordered_at = datetime.utcnow() if order_status in {"ordered", "received"} else None
    received_at = datetime.utcnow() if order_status == "received" else None

    item = ProjectItem(
        project_id=project_id,
        material_id=payload.material_id,
        quantity=qty,
        unit_type=material.unit_type,
        unit_cost=unit_cost,
        waste_pct=waste_pct,
        total_qty=total_qty,
        line_subtotal=line_subtotal,
        order_status=order_status,
        po_number=payload.po_number,
        purchase_notes=payload.purchase_notes,
        ordered_at=ordered_at,
        received_at=received_at,
        workspace_id=current_workspace_id,
    )

    db.add(item)
    db.commit()
    db.refresh(item)

    return LineItemResponse(
        id=item.id,
        project_id=item.project_id,
        material_id=item.material_id,
        quantity=Decimal(str(item.quantity)),
        waste_pct=Decimal(str(waste_pct)),
        total_qty=Decimal(str(total_qty)),
        line_subtotal=Decimal(str(line_subtotal)),
        order_status=item.order_status,
        po_number=item.po_number,
        purchase_notes=item.purchase_notes,
        ordered_at=item.ordered_at,
        received_at=item.received_at,
        created_at=item.created_at,
    )
