from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_workspace_id
from app.db.base import get_db
from app.models.models import Material, ProjectItem, User, Vendor
from app.schemas.schemas import Material as MaterialSchema, MaterialCreate, MaterialUpdate

router = APIRouter(prefix="/materials", tags=["materials"])


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


@router.get("/{material_id}", response_model=MaterialSchema)
def get_material(
    material_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get a material in the active workspace."""
    material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.workspace_id == current_workspace_id)
        .first()
    )
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    return material


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
    db_material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.workspace_id == current_workspace_id)
        .first()
    )
    if not db_material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    
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

    for field, value in update_data.items():
        setattr(db_material, field, value)
    
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
    db_material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.workspace_id == current_workspace_id)
        .first()
    )
    if not db_material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )

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
