from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional

from app.db.base import get_db
from app.models.models import Material, Vendor, ProjectItem, User
from app.schemas.schemas import Material as MaterialSchema, MaterialCreate, MaterialUpdate
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("", response_model=list[MaterialSchema])
def list_materials(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Material).offset(skip).limit(limit).all()


@router.get("/search", response_model=list[MaterialSchema])
def search_materials(
    name: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Search by name and/or category (case-insensitive, partial match)."""
    query = db.query(Material)
    if name:
        query = query.filter(Material.name.ilike(f"%{name}%"))
    if category:
        query = query.filter(Material.category.ilike(f"%{category}%"))
    return query.all()


@router.get("/{material_id}", response_model=MaterialSchema)
def get_material(
    material_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    return material


@router.post("", response_model=MaterialSchema, status_code=status.HTTP_201_CREATED)
def create_material(
    material: MaterialCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if material.default_vendor_id:
        vendor = db.query(Vendor).filter(Vendor.id == material.default_vendor_id).first()
        if not vendor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    db_material = Material(**material.dict())
    db.add(db_material)
    db.commit()
    db.refresh(db_material)
    return db_material


@router.put("/{material_id}", response_model=MaterialSchema)
def update_material(
    material_id: UUID,
    material: MaterialUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    db_material = db.query(Material).filter(Material.id == material_id).first()
    if not db_material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")

    for field, value in material.dict(exclude_unset=True).items():
        setattr(db_material, field, value)

    db.add(db_material)
    db.commit()
    db.refresh(db_material)
    return db_material


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(
    material_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    db_material = db.query(Material).filter(Material.id == material_id).first()
    if not db_material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")

    in_use = db.query(ProjectItem).filter(ProjectItem.material_id == material_id).first()
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete material: it is referenced by one or more project items",
        )

    db.delete(db_material)
    db.commit()
    return None