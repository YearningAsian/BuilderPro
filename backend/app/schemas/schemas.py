from pydantic import BaseModel, field_validator, model_validator
from uuid import UUID
from datetime import datetime
from typing import Literal, Optional
from decimal import Decimal


# =====================================================
# USER SCHEMAS
# =====================================================
class UserBase(BaseModel):
    email: str
    full_name: Optional[str] = None
    role: Literal["admin", "user"] = "user"


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
    workspace_id: UUID
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
    workspace_id: UUID
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

    @field_validator("unit_cost")
    @classmethod
    def unit_cost_non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("unit_cost must be >= 0")
        return v

    @field_validator("default_waste_pct")
    @classmethod
    def waste_pct_non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("default_waste_pct must be >= 0")
        return v


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
    workspace_id: UUID
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
    order_status: Literal["draft", "ordered", "received", "cancelled"] = "draft"
    po_number: Optional[str] = None
    purchase_notes: Optional[str] = None
    notes: Optional[str] = None
    ordered_at: Optional[datetime] = None
    received_at: Optional[datetime] = None


class ProjectItemCreate(BaseModel):
    material_id: UUID
    quantity: Decimal
    unit_type: str
    unit_cost: Decimal
    waste_pct: Decimal = Decimal("0")
    order_status: Literal["draft", "ordered", "received", "cancelled"] = "draft"
    po_number: Optional[str] = None
    purchase_notes: Optional[str] = None
    notes: Optional[str] = None


class ProjectItemUpdate(BaseModel):
    quantity: Optional[Decimal] = None
    unit_cost: Optional[Decimal] = None
    waste_pct: Optional[Decimal] = None
    order_status: Optional[Literal["draft", "ordered", "received", "cancelled"]] = None
    po_number: Optional[str] = None
    purchase_notes: Optional[str] = None
    notes: Optional[str] = None


class ProjectItem(ProjectItemBase):
    id: UUID
    project_id: UUID
    workspace_id: UUID
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
    status: Literal["draft", "active", "closed"] = "draft"
    default_tax_pct: Decimal = Decimal("0")
    default_waste_pct: Decimal = Decimal("0")

    @field_validator("default_tax_pct")
    @classmethod
    def tax_pct_non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("default_tax_pct must be >= 0")
        return v

    @field_validator("default_waste_pct")
    @classmethod
    def project_waste_pct_non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("default_waste_pct must be >= 0")
        return v


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[Literal["draft", "active", "closed"]] = None
    default_tax_pct: Optional[Decimal] = None
    default_waste_pct: Optional[Decimal] = None

    @field_validator("default_tax_pct")
    @classmethod
    def tax_pct_non_negative(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v < 0:
            raise ValueError("default_tax_pct must be >= 0")
        return v

    @field_validator("default_waste_pct")
    @classmethod
    def waste_pct_non_negative(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v < 0:
            raise ValueError("default_waste_pct must be >= 0")
        return v


class Project(ProjectBase):
    id: UUID
    workspace_id: UUID
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
