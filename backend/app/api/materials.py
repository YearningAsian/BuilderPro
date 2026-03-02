from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from app.db.base import get_db
from app.models.models import Material, Vendor
from app.schemas.schemas import Material as MaterialSchema, MaterialCreate, MaterialUpdate

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("", response_model=list[MaterialSchema])
def list_materials(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all materials"""
    materials = db.query(Material).offset(skip).limit(limit).all()
    return materials


@router.get("/{material_id}", response_model=MaterialSchema)
def get_material(material_id: UUID, db: Session = Depends(get_db)):
    """Get material by ID"""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    return material


@router.post("", response_model=MaterialSchema, status_code=status.HTTP_201_CREATED)
def create_material(material: MaterialCreate, db: Session = Depends(get_db)):
    """Create new material"""
    # Check if vendor exists if provided
    if material.default_vendor_id:
        vendor = db.query(Vendor).filter(Vendor.id == material.default_vendor_id).first()
        if not vendor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor not found"
            )
    
    db_material = Material(**material.dict())
    db.add(db_material)
    db.commit()
    db.refresh(db_material)
    return db_material


@router.put("/{material_id}", response_model=MaterialSchema)
def update_material(material_id: UUID, material: MaterialUpdate, db: Session = Depends(get_db)):
    """Update material"""
    db_material = db.query(Material).filter(Material.id == material_id).first()
    if not db_material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    
    update_data = material.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_material, field, value)
    
    db.add(db_material)
    db.commit()
    db.refresh(db_material)
    return db_material


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(material_id: UUID, db: Session = Depends(get_db)):
    """Delete material"""
    db_material = db.query(Material).filter(Material.id == material_id).first()
    if not db_material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    
    db.delete(db_material)
    db.commit()
    return None
