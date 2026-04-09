from pydantic import BaseModel, field_validator, model_validator
from uuid import UUID
from datetime import datetime
from typing import Literal, Optional
from decimal import Decimal
from urllib.parse import urlparse


def _normalize_carrier(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = " ".join(value.strip().split())
    return normalized or None


def _normalize_tracking_url(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("tracking_url must be a valid absolute http(s) URL")

    return normalized


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


class MaterialPriceHistoryEntry(BaseModel):
    id: UUID
    material_id: UUID
    previous_unit_cost: Optional[Decimal] = None
    new_unit_cost: Decimal
    source: Optional[str] = None
    changed_by_user_id: Optional[UUID] = None
    changed_at: datetime


class MaterialAttachmentBase(BaseModel):
    name: str
    url: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None

    @field_validator("name")
    @classmethod
    def attachment_name_required(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Attachment name is required")
        return normalized

    @field_validator("url")
    @classmethod
    def attachment_url_must_be_absolute_http(cls, value: str) -> str:
        normalized = value.strip()
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Attachment URL must be a valid absolute http(s) URL")
        return normalized

    @field_validator("size_bytes")
    @classmethod
    def attachment_size_non_negative(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and value < 0:
            raise ValueError("Attachment size must be >= 0")
        return value


class MaterialAttachmentCreate(MaterialAttachmentBase):
    pass


class MaterialAttachment(MaterialAttachmentBase):
    id: str
    material_id: UUID
    uploaded_at: datetime
    uploaded_by_user_id: Optional[UUID] = None


class MaterialCsvImportError(BaseModel):
    row: int
    message: str


class MaterialCsvImportSummary(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[MaterialCsvImportError]


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
    expected_delivery_at: Optional[datetime] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
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
    expected_delivery_at: Optional[datetime] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    notes: Optional[str] = None

    _carrier_validator = field_validator("carrier", mode="before")(_normalize_carrier)
    _tracking_url_validator = field_validator("tracking_url", mode="before")(_normalize_tracking_url)


class ProjectItemUpdate(BaseModel):
    quantity: Optional[Decimal] = None
    unit_cost: Optional[Decimal] = None
    waste_pct: Optional[Decimal] = None
    order_status: Optional[Literal["draft", "ordered", "received", "cancelled"]] = None
    po_number: Optional[str] = None
    purchase_notes: Optional[str] = None
    expected_delivery_at: Optional[datetime] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    notes: Optional[str] = None

    _carrier_validator = field_validator("carrier", mode="before")(_normalize_carrier)
    _tracking_url_validator = field_validator("tracking_url", mode="before")(_normalize_tracking_url)


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
