from uuid import UUID
from sqlalchemy import Column, String, Numeric, Boolean, Text, DateTime, ForeignKey, func, Uuid
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=lambda: UUID('00000000-0000-0000-0000-000000000000'))
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    role = Column(String, default="user")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    projects = relationship("Project", back_populates="created_by_user")


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=lambda: UUID('00000000-0000-0000-0000-000000000000'))
    name = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    projects = relationship("Project", back_populates="customer")


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=lambda: UUID('00000000-0000-0000-0000-000000000000'))
    name = Column(String, unique=True, nullable=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    materials = relationship("Material", back_populates="default_vendor")


class Material(Base):
    __tablename__ = "materials"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=lambda: UUID('00000000-0000-0000-0000-000000000000'))
    name = Column(String, nullable=False, index=True)
    category = Column(String, nullable=True)
    unit_type = Column(String, nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    sku = Column(String, unique=True, nullable=True)
    default_vendor_id = Column(Uuid(as_uuid=True), ForeignKey("vendors.id"), nullable=True)
    size_dims = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    is_taxable = Column(Boolean, default=True)
    default_waste_pct = Column(Numeric(5, 2), default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    default_vendor = relationship("Vendor", back_populates="materials")
    project_items = relationship("ProjectItem", back_populates="material")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=lambda: UUID('00000000-0000-0000-0000-000000000000'))
    name = Column(String, nullable=False, index=True)
    customer_id = Column(Uuid(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    status = Column(String, default="draft")
    default_tax_pct = Column(Numeric(5, 2), default=0)
    default_waste_pct = Column(Numeric(5, 2), default=0)
    created_by = Column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    customer = relationship("Customer", back_populates="projects")
    created_by_user = relationship("User", back_populates="projects")
    items = relationship("ProjectItem", back_populates="project", cascade="all, delete-orphan")


class ProjectItem(Base):
    __tablename__ = "project_items"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=lambda: UUID('00000000-0000-0000-0000-000000000000'))
    project_id = Column(Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    material_id = Column(Uuid(as_uuid=True), ForeignKey("materials.id"), nullable=False)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_type = Column(String, nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    waste_pct = Column(Numeric(5, 2), default=0)
    total_qty = Column(Numeric(12, 3), nullable=False)
    line_subtotal = Column(Numeric(12, 2), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    project = relationship("Project", back_populates="items")
    material = relationship("Material", back_populates="project_items")
