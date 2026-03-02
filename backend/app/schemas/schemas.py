from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from decimal import Decimal


# =====================================================
# USER SCHEMAS
# =====================================================
class UserBase(BaseModel):
    email: str
    full_name: Optional[str] = None
    role: str = "user"


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None


class User(UserBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# =====================================================
# CUSTOMER SCHEMAS
# =====================================================
class CustomerBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class Customer(CustomerBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# =====================================================
# VENDOR SCHEMAS
# =====================================================
class VendorBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class Vendor(VendorBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# =====================================================
# MATERIAL SCHEMAS
# =====================================================
class MaterialBase(BaseModel):
    name: str
    category: Optional[str] = None
    unit_type: str
    unit_cost: Decimal
    sku: Optional[str] = None
    default_vendor_id: Optional[UUID] = None
    size_dims: Optional[str] = None
    notes: Optional[str] = None
    is_taxable: bool = True
    default_waste_pct: Decimal = Decimal("0")


class MaterialCreate(MaterialBase):
    pass


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit_type: Optional[str] = None
    unit_cost: Optional[Decimal] = None
    sku: Optional[str] = None
    default_vendor_id: Optional[UUID] = None
    size_dims: Optional[str] = None
    notes: Optional[str] = None
    is_taxable: Optional[bool] = None
    default_waste_pct: Optional[Decimal] = None


class Material(MaterialBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# =====================================================
# PROJECT ITEM SCHEMAS
# =====================================================
class ProjectItemBase(BaseModel):
    material_id: UUID
    quantity: Decimal
    unit_type: str
    unit_cost: Decimal
    waste_pct: Decimal = Decimal("0")
    total_qty: Decimal
    line_subtotal: Decimal
    notes: Optional[str] = None


class ProjectItemCreate(BaseModel):
    material_id: UUID
    quantity: Decimal
    unit_type: str
    unit_cost: Decimal
    waste_pct: Decimal = Decimal("0")
    notes: Optional[str] = None


class ProjectItemUpdate(BaseModel):
    quantity: Optional[Decimal] = None
    waste_pct: Optional[Decimal] = None
    notes: Optional[str] = None


class ProjectItem(ProjectItemBase):
    id: UUID
    project_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# =====================================================
# PROJECT SCHEMAS
# =====================================================
class ProjectBase(BaseModel):
    name: str
    customer_id: UUID
    status: str = "draft"
    default_tax_pct: Decimal = Decimal("0")
    default_waste_pct: Decimal = Decimal("0")


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    default_tax_pct: Optional[Decimal] = None
    default_waste_pct: Optional[Decimal] = None


class Project(ProjectBase):
    id: UUID
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    items: list[ProjectItem] = []

    class Config:
        from_attributes = True


class ProjectDetail(Project):
    customer: Customer
    items: list[ProjectItem] = []

    class Config:
        from_attributes = True
