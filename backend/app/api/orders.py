from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from decimal import Decimal
from app.db.base import get_db
from app.models.models import ProjectItem, Project, Material
from app.schemas.schemas import ProjectItem as ProjectItemSchema, ProjectItemCreate, ProjectItemUpdate

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[ProjectItemSchema])
def list_orders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all project items (orders)"""
    items = db.query(ProjectItem).offset(skip).limit(limit).all()
    return items


@router.get("/{item_id}", response_model=ProjectItemSchema)
def get_order(item_id: UUID, db: Session = Depends(get_db)):
    """Get project item (order) by ID"""
    item = db.query(ProjectItem).filter(ProjectItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    return item


@router.post("", response_model=ProjectItemSchema, status_code=status.HTTP_201_CREATED)
def create_order(item: ProjectItemCreate, project_id: UUID, db: Session = Depends(get_db)):
    """Create new project item (order)"""
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check if material exists
    material = db.query(Material).filter(Material.id == item.material_id).first()
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    
    # Calculate total_qty and line_subtotal
    total_qty = item.quantity * (1 + item.waste_pct / 100)
    line_subtotal = total_qty * item.unit_cost
    
    db_item = ProjectItem(
        project_id=project_id,
        material_id=item.material_id,
        quantity=item.quantity,
        unit_type=item.unit_type,
        unit_cost=item.unit_cost,
        waste_pct=item.waste_pct,
        total_qty=total_qty,
        line_subtotal=line_subtotal,
        notes=item.notes
    )
    
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/{item_id}", response_model=ProjectItemSchema)
def update_order(item_id: UUID, item: ProjectItemUpdate, db: Session = Depends(get_db)):
    """Update project item (order)"""
    db_item = db.query(ProjectItem).filter(ProjectItem.id == item_id).first()
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    update_data = item.dict(exclude_unset=True)
    
    # Recalculate totals if quantity or waste_pct changed
    if "quantity" in update_data or "waste_pct" in update_data:
        quantity = update_data.get("quantity", db_item.quantity)
        waste_pct = update_data.get("waste_pct", db_item.waste_pct)
        
        total_qty = quantity * (1 + waste_pct / 100)
        line_subtotal = total_qty * db_item.unit_cost
        
        update_data["total_qty"] = total_qty
        update_data["line_subtotal"] = line_subtotal
    
    for field, value in update_data.items():
        setattr(db_item, field, value)
    
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(item_id: UUID, db: Session = Depends(get_db)):
    """Delete project item (order)"""
    db_item = db.query(ProjectItem).filter(ProjectItem.id == item_id).first()
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    db.delete(db_item)
    db.commit()
    return None
