from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, condecimal
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_workspace_id
from app.db.base import get_db
from app.models.models import Customer, Material, Project, ProjectItem, User
from app.schemas.schemas import Project as ProjectSchema, ProjectCreate, ProjectDetail, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


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
