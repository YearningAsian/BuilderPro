from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.db.base import get_db
from app.models.models import Vendor, User
from app.schemas.schemas import Vendor as VendorSchema, VendorCreate, VendorUpdate
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("", response_model=list[VendorSchema])
def list_vendors(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Vendor).offset(skip).limit(limit).all()


@router.get("/{vendor_id}", response_model=VendorSchema)
def get_vendor(
    vendor_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


@router.post("", response_model=VendorSchema, status_code=status.HTTP_201_CREATED)
def create_vendor(
    vendor: VendorCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    db_vendor = Vendor(**vendor.dict())
    db.add(db_vendor)
    db.commit()
    db.refresh(db_vendor)
    return db_vendor


@router.put("/{vendor_id}", response_model=VendorSchema)
def update_vendor(
    vendor_id: UUID,
    vendor: VendorUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    db_vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not db_vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    for field, value in vendor.dict(exclude_unset=True).items():
        setattr(db_vendor, field, value)

    db.add(db_vendor)
    db.commit()
    db.refresh(db_vendor)
    return db_vendor


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vendor(
    vendor_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    db_vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not db_vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    db.delete(db_vendor)
    db.commit()
    return None