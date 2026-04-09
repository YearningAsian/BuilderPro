from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from decimal import Decimal
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, condecimal, Field

from app.db.base import get_db
from app.models.models import Project, Material, ProjectItem, Customer, User
from app.schemas.schemas import Project as ProjectSchema, ProjectDetail, ProjectCreate, ProjectUpdate
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


# =====================================================
# PROJECT CRUD
# =====================================================

@router.get("", response_model=list[ProjectSchema])
def list_projects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Project).offset(skip).limit(limit).all()


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("", response_model=ProjectSchema, status_code=status.HTTP_201_CREATED)
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = db.query(Customer).filter(Customer.id == project.customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    data = project.dict()
    data["created_by"] = current_user.id
    db_project = Project(**data)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.put("/{project_id}", response_model=ProjectSchema)
def update_project(
    project_id: UUID,
    project: ProjectUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    for field, value in project.dict(exclude_unset=True).items():
        setattr(db_project, field, value)

    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    db.delete(db_project)
    db.commit()
    return None


# =====================================================
# LINE ITEM SCHEMAS
# =====================================================

class LineItemCreate(BaseModel):
    material_id: UUID
    quantity: condecimal(gt=0) = Field(..., description="Base quantity (must be > 0)")
    waste_pct: Optional[condecimal(ge=0)] = Field(
        None, description="Override waste %. If omitted, uses material.default_waste_pct"
    )


class LineItemUpdate(BaseModel):
    quantity: Optional[condecimal(gt=0)] = None
    waste_pct: Optional[condecimal(ge=0)] = None


class LineItemResponse(BaseModel):
    id: UUID
    project_id: UUID
    material_id: UUID
    material_name: str
    unit_type: str
    unit_cost: Decimal
    quantity: Decimal
    waste_pct: Decimal
    total_qty: Decimal
    line_subtotal: Decimal
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectSummary(BaseModel):
    project_id: UUID
    item_count: int
    subtotal: Decimal
    tax_pct: Decimal
    tax_amount: Decimal
    grand_total: Decimal


# =====================================================
# LINE ITEM HELPERS
# =====================================================

def _compute_item(qty: float, waste_pct: float, unit_cost: float) -> tuple[float, float]:
    total_qty = qty * (1.0 + waste_pct / 100.0)
    return total_qty, total_qty * unit_cost


def _item_to_response(item: ProjectItem) -> LineItemResponse:
    material = item.material
    waste_pct = float(item.waste_pct if item.waste_pct is not None else (material.default_waste_pct or 0.0))
    unit_cost = float(material.unit_cost or 0.0)
    total_qty, line_subtotal = _compute_item(float(item.quantity), waste_pct, unit_cost)

    return LineItemResponse(
        id=item.id,
        project_id=item.project_id,
        material_id=item.material_id,
        material_name=material.name,
        unit_type=material.unit_type,
        unit_cost=Decimal(str(unit_cost)),
        quantity=Decimal(str(item.quantity)),
        waste_pct=Decimal(str(waste_pct)),
        total_qty=Decimal(str(total_qty)),
        line_subtotal=Decimal(str(line_subtotal)),
        created_at=item.created_at,
    )


# =====================================================
# LINE ITEM ENDPOINTS
# =====================================================

@router.get("/{project_id}/items", response_model=list[LineItemResponse])
def list_project_items(
    project_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return [_item_to_response(i) for i in project.items]


@router.post("/{project_id}/items", response_model=LineItemResponse, status_code=status.HTTP_201_CREATED)
def add_project_line_item(
    project_id: UUID,
    payload: LineItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    material = db.query(Material).filter(Material.id == payload.material_id).first()
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")

    waste_pct = float(payload.waste_pct) if payload.waste_pct is not None else float(material.default_waste_pct or 0.0)

    item = ProjectItem(
        project_id=project_id,
        material_id=payload.material_id,
        quantity=float(payload.quantity),
        waste_pct=waste_pct,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_to_response(item)


@router.put("/{project_id}/items/{item_id}", response_model=LineItemResponse)
def update_project_line_item(
    project_id: UUID,
    item_id: UUID,
    payload: LineItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = (
        db.query(ProjectItem)
        .filter(ProjectItem.id == item_id, ProjectItem.project_id == project_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found")

    if payload.quantity is not None:
        item.quantity = float(payload.quantity)
    if payload.waste_pct is not None:
        item.waste_pct = float(payload.waste_pct)

    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_to_response(item)


@router.delete("/{project_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_line_item(
    project_id: UUID,
    item_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = (
        db.query(ProjectItem)
        .filter(ProjectItem.id == item_id, ProjectItem.project_id == project_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found")

    db.delete(item)
    db.commit()
    return None


# =====================================================
# COST SUMMARY
# =====================================================

@router.get("/{project_id}/summary", response_model=ProjectSummary)
def get_project_summary(
    project_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    subtotal = Decimal("0")
    for item in project.items:
        if not item.material:
            continue
        waste_pct = float(item.waste_pct if item.waste_pct is not None else (item.material.default_waste_pct or 0.0))
        _, line_subtotal = _compute_item(float(item.quantity), waste_pct, float(item.material.unit_cost or 0.0))
        subtotal += Decimal(str(line_subtotal))

    tax_pct = Decimal(str(project.default_tax_pct or 0.0))
    tax_amount = (subtotal * tax_pct / Decimal("100")).quantize(Decimal("0.01"))
    grand_total = subtotal + tax_amount

    return ProjectSummary(
        project_id=project.id,
        item_count=len(project.items),
        subtotal=subtotal.quantize(Decimal("0.01")),
        tax_pct=tax_pct,
        tax_amount=tax_amount,
        grand_total=grand_total.quantize(Decimal("0.01")),
    )