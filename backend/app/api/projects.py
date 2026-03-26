from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from decimal import Decimal
from typing import Optional
from datetime import datetime

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel, condecimal, Field

from app.db.base import get_db
from app.models.models import Project, Material, ProjectItem, Customer
from app.schemas.schemas import Project as ProjectSchema, ProjectDetail, ProjectCreate, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectSchema])
def list_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all projects"""
    projects = db.query(Project).offset(skip).limit(limit).all()
    return projects


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(project_id: UUID, db: Session = Depends(get_db)):
    """Get project by ID"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    return project


@router.post("", response_model=ProjectSchema, status_code=status.HTTP_201_CREATED)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    """Create new project"""
    # Check if customer exists
    customer = db.query(Customer).filter(Customer.id == project.customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    db_project = Project(**project.dict())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.put("/{project_id}", response_model=ProjectSchema)
def update_project(project_id: UUID, project: ProjectUpdate, db: Session = Depends(get_db)):
    """Update project"""
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    update_data = project.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_project, field, value)
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: UUID, db: Session = Depends(get_db)):
    """Delete project"""
    db_project = db.query(Project).filter(Project.id == project_id).first()
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


class LineItemResponse(BaseModel):
    id: UUID
    project_id: UUID
    material_id: UUID
    quantity: Decimal
    waste_pct: Decimal
    total_qty: Decimal
    line_subtotal: Decimal
    created_at: datetime

    class Config:
        orm_mode = True


@router.post("/{project_id}/items", response_model=LineItemResponse, status_code=status.HTTP_201_CREATED)
def add_project_line_item(project_id: UUID, payload: LineItemCreate, db: Session = Depends(get_db)):
    # Validate project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Validate material exists
    material = db.query(Material).filter(Material.id == payload.material_id).first()
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

    item = ProjectItem(
        project_id=project_id,
        material_id=payload.material_id,
        quantity=qty,
        waste_pct=waste_pct,
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
        created_at=item.created_at,
    )
