from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_workspace_id
from app.db.base import get_db
from app.models.models import Material, Project, ProjectItem, User
from app.schemas.schemas import ProjectItem as ProjectItemSchema, ProjectItemCreate, ProjectItemUpdate

router = APIRouter(prefix="/orders", tags=["orders"])


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


@router.get("/{item_id}", response_model=ProjectItemSchema)
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
        notes=item.notes,
        ordered_at=ordered_at,
        received_at=received_at,
        workspace_id=current_workspace_id,
    )
    
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/{item_id}", response_model=ProjectItemSchema)
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

    if "order_status" in update_data:
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

    for field, value in update_data.items():
        setattr(db_item, field, value)
    
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
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
