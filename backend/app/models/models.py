<<<<<<< HEAD
from uuid import uuid4
from sqlalchemy import Column, String, Numeric, Boolean, Text, DateTime, ForeignKey, func, Uuid, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base
=======
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, DateTime, Float, ForeignKey, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.ext.hybrid import hybrid_property

Base = declarative_base()


def uuid4():
    return str(uuid.uuid4())
>>>>>>> 418e2b5 (testing)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'user')", name="ck_users_role"),
    )

<<<<<<< HEAD
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    role = Column(String, nullable=False, default="user")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
=======
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
>>>>>>> 418e2b5 (testing)

    # Relationships
    projects = relationship("Project", back_populates="created_by_user")
    workspace_memberships = relationship("WorkspaceMember", back_populates="user", cascade="all, delete-orphan")
    created_workspaces = relationship("Workspace", back_populates="created_by_user")
    created_invites = relationship("WorkspaceInvite", foreign_keys="WorkspaceInvite.invited_by_user_id", back_populates="invited_by_user")
    accepted_invites = relationship("WorkspaceInvite", foreign_keys="WorkspaceInvite.accepted_by_user_id", back_populates="accepted_by_user")


class Customer(Base):
    __tablename__ = "customers"

<<<<<<< HEAD
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
=======
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String(255), nullable=False)
    contact = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
>>>>>>> 418e2b5 (testing)

    # Relationships
    projects = relationship("Project", back_populates="customer")


class Vendor(Base):
    __tablename__ = "vendors"

<<<<<<< HEAD
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, unique=True, nullable=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
=======
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String(255), nullable=False)
    contact = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
>>>>>>> 418e2b5 (testing)

    # Relationships
    materials = relationship("Material", back_populates="default_vendor")


class Material(Base):
    __tablename__ = "materials"
    __table_args__ = (
        CheckConstraint("unit_cost >= 0", name="ck_materials_unit_cost_non_negative"),
        CheckConstraint("default_waste_pct >= 0", name="ck_materials_waste_pct_non_negative"),
    )

<<<<<<< HEAD
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False, index=True)
    category = Column(String, nullable=True, index=True)
    unit_type = Column(String, nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    sku = Column(String, unique=True, nullable=True)
    default_vendor_id = Column(Uuid(as_uuid=True), ForeignKey("vendors.id"), nullable=True, index=True)
    size_dims = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    is_taxable = Column(Boolean, nullable=False, default=True)
    default_waste_pct = Column(Numeric(5, 2), nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
=======
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    unit_type = Column(String(50), nullable=False)  # e.g., "each", "ft", "lb"
    unit_cost = Column(Float, nullable=False, default=0.0)
    default_vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=True)
    default_waste_pct = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
>>>>>>> 418e2b5 (testing)

    # Relationships
    default_vendor = relationship("Vendor", back_populates="materials")
    project_items = relationship("ProjectItem", back_populates="material")


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'active', 'closed')", name="ck_projects_status"),
        CheckConstraint("default_tax_pct >= 0", name="ck_projects_tax_pct_non_negative"),
        CheckConstraint("default_waste_pct >= 0", name="ck_projects_waste_pct_non_negative"),
    )

<<<<<<< HEAD
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False, index=True)
    customer_id = Column(Uuid(as_uuid=True), ForeignKey("customers.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="draft", index=True)
    default_tax_pct = Column(Numeric(5, 2), nullable=False, default=0)
    default_waste_pct = Column(Numeric(5, 2), nullable=False, default=0)
    created_by = Column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
=======
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String(255), nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    default_tax_pct = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
>>>>>>> 418e2b5 (testing)

    # Relationships
    customer = relationship("Customer", back_populates="projects")
    created_by_user = relationship("User", back_populates="projects")
    items = relationship("ProjectItem", back_populates="project", cascade="all, delete-orphan")


class ProjectItem(Base):
    __tablename__ = "project_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_project_items_quantity_positive"),
        CheckConstraint("unit_cost >= 0", name="ck_project_items_unit_cost_non_negative"),
        CheckConstraint("waste_pct >= 0", name="ck_project_items_waste_pct_non_negative"),
    )

<<<<<<< HEAD
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    project_id = Column(Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    material_id = Column(Uuid(as_uuid=True), ForeignKey("materials.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_type = Column(String, nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    waste_pct = Column(Numeric(5, 2), nullable=False, default=0)
    total_qty = Column(Numeric(12, 3), nullable=False)
    line_subtotal = Column(Numeric(12, 2), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
=======
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    material_id = Column(UUID(as_uuid=True), ForeignKey("materials.id"), nullable=False)

    quantity = Column(Float, nullable=False, default=0.0)      # base ordered quantity
    waste_pct = Column(Float, nullable=True)  # if null, use material.default_waste_pct
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
>>>>>>> 418e2b5 (testing)

    # Relationships
    project = relationship("Project", back_populates="items")
    material = relationship("Material", back_populates="project_items")

<<<<<<< HEAD

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False, unique=True, index=True)
    created_by = Column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    created_by_user = relationship("User", back_populates="created_workspaces")
    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")
    invites = relationship("WorkspaceInvite", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_members_workspace_user"),
        CheckConstraint("role IN ('admin', 'user')", name="ck_workspace_members_role"),
    )

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id = Column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False, default="user")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    workspace = relationship("Workspace", back_populates="members")
    user = relationship("User", back_populates="workspace_memberships")


class WorkspaceInvite(Base):
    __tablename__ = "workspace_invites"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id = Column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_email = Column(String, nullable=False, index=True)
    invite_token = Column(String, nullable=False, unique=True, index=True)
    invited_by_user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    accepted_by_user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    workspace = relationship("Workspace", back_populates="invites")
    invited_by_user = relationship("User", foreign_keys=[invited_by_user_id], back_populates="created_invites")
    accepted_by_user = relationship("User", foreign_keys=[accepted_by_user_id], back_populates="accepted_invites")
=======
    @hybrid_property
    def effective_waste_pct(self):
        # use explicit waste_pct if set, otherwise material default
        if self.waste_pct is not None:
            return float(self.waste_pct)
        if self.material is not None and self.material.default_waste_pct is not None:
            return float(self.material.default_waste_pct)
        return 0.0

    @hybrid_property
    def total_qty(self):
        # total_qty = quantity * (1 + waste_pct/100)
        return float(self.quantity) * (1.0 + (self.effective_waste_pct or 0.0) / 100.0)

    @total_qty.expression
    def total_qty(cls):
        # SQL expression for query-time calculation when waste_pct is set on the item.
        # Note: when waste_pct is NULL and you want to pick material.default_waste_pct in SQL,
        # a more complex join expression is required; this expression handles the simple item-level case.
        from sqlalchemy import func, literal
        return cls.quantity * (1.0 + (func.coalesce(cls.waste_pct, literal(0.0)) / 100.0))

    @property
    def line_subtotal(self):
        # subtotal = total_qty * unit_cost (material.unit_cost)
        if self.material is None:
            return float(self.total_qty) * 0.0
        return float(self.total_qty) * float(self.material.unit_cost)
>>>>>>> 418e2b5 (testing)
