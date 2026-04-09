from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_workspace_id
from app.db.base import get_db
from app.models.models import User, Vendor
from app.schemas.schemas import Vendor as VendorSchema, VendorCreate, VendorUpdate

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("", response_model=list[VendorSchema])
def list_vendors(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get vendors for the active workspace."""
    vendors = (
        db.query(Vendor)
        .filter(Vendor.workspace_id == current_workspace_id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return vendors


@router.get("/{vendor_id}", response_model=VendorSchema)
def get_vendor(
    vendor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get a vendor in the active workspace."""
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
    return vendor


@router.post("", response_model=VendorSchema, status_code=status.HTTP_201_CREATED)
def create_vendor(
    vendor: VendorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Create a new vendor in the active workspace."""
    db_vendor = Vendor(**vendor.model_dump(), workspace_id=current_workspace_id)
    db.add(db_vendor)
    db.commit()
    db.refresh(db_vendor)
    return db_vendor


@router.put("/{vendor_id}", response_model=VendorSchema)
def update_vendor(
    vendor_id: UUID,
    vendor: VendorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Update a vendor in the active workspace."""
    db_vendor = (
        db.query(Vendor)
        .filter(Vendor.id == vendor_id, Vendor.workspace_id == current_workspace_id)
        .first()
    )
    if not db_vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    update_data = vendor.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_vendor, field, value)
    
    db.add(db_vendor)
    db.commit()
    db.refresh(db_vendor)
    return db_vendor


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vendor(
    vendor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Delete a vendor in the active workspace."""
    db_vendor = (
        db.query(Vendor)
        .filter(Vendor.id == vendor_id, Vendor.workspace_id == current_workspace_id)
        .first()
    )
    if not db_vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    db.delete(db_vendor)
    db.commit()
    return None
