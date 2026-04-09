from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_workspace_id
from app.db.base import get_db
from app.models.models import Customer, User
from app.schemas.schemas import Customer as CustomerSchema, CustomerCreate, CustomerUpdate

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[CustomerSchema])
def list_customers(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get customers for the active workspace."""
    customers = (
        db.query(Customer)
        .filter(Customer.workspace_id == current_workspace_id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return customers


@router.get("/{customer_id}", response_model=CustomerSchema)
def get_customer(
    customer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Get a customer in the active workspace."""
    customer = (
        db.query(Customer)
        .filter(Customer.id == customer_id, Customer.workspace_id == current_workspace_id)
        .first()
    )
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    return customer


@router.post("", response_model=CustomerSchema, status_code=status.HTTP_201_CREATED)
def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Create a new customer in the active workspace."""
    db_customer = Customer(**customer.model_dump(), workspace_id=current_workspace_id)
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer


@router.put("/{customer_id}", response_model=CustomerSchema)
def update_customer(
    customer_id: UUID,
    customer: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Update a customer in the active workspace."""
    db_customer = (
        db.query(Customer)
        .filter(Customer.id == customer_id, Customer.workspace_id == current_workspace_id)
        .first()
    )
    if not db_customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    update_data = customer.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_customer, field, value)
    
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id = Depends(get_current_workspace_id),
):
    """Delete a customer in the active workspace."""
    db_customer = (
        db.query(Customer)
        .filter(Customer.id == customer_id, Customer.workspace_id == current_workspace_id)
        .first()
    )
    if not db_customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    db.delete(db_customer)
    db.commit()
    return None
