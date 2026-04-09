import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, DateTime, Float, ForeignKey, Text, CheckConstraint, Numeric, event
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, declarative_base, Session
from sqlalchemy.ext.hybrid import hybrid_property

Base = declarative_base()


# =====================================================
# updated_at auto-update via SQLAlchemy event listener
# Any model that has an updated_at column gets it set
# automatically on every UPDATE — no manual tracking needed.
# =====================================================

def _set_updated_at(mapper, connection, target):
    if hasattr(target, "updated_at"):
        target.updated_at = datetime.utcnow()

def register_updated_at(cls):
    event.listen(cls, "before_update", _set_updated_at)
    return cls


# =====================================================
# MODELS
# =====================================================

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'user')", name="ck_users_role"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(String(20), nullable=False, default="user")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    projects = relationship("Project", back_populates="created_by_user")
    workspace_memberships = relationship("WorkspaceMember", back_populates="user", cascade="all, delete-orphan")
    created_workspaces = relationship("Workspace", back_populates="created_by_user")
    created_invites = relationship("WorkspaceInvite", foreign_keys="WorkspaceInvite.invited_by_user_id", back_populates="invited_by_user")
    accepted_invites = relationship("WorkspaceInvite", foreign_keys="WorkspaceInvite.accepted_by_user_id", back_populates="accepted_by_user")


class Customer(Base):
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    projects = relationship("Project", back_populates="customer")


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    materials = relationship("Material", back_populates="default_vendor")


@register_updated_at
class Material(Base):
    __tablename__ = "materials"
    __table_args__ = (
        CheckConstraint("unit_cost >= 0", name="ck_materials_unit_cost_non_negative"),
        CheckConstraint("default_waste_pct >= 0", name="ck_materials_waste_pct_non_negative"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    unit_type = Column(String(50), nullable=False)
    unit_cost = Column(Float, nullable=False, default=0.0)
    default_vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=True)
    default_waste_pct = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    default_vendor = relationship("Vendor", back_populates="materials")
    project_items = relationship("ProjectItem", back_populates="material")


@register_updated_at
class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'active', 'closed')", name="ck_projects_status"),
        CheckConstraint("default_tax_pct >= 0", name="ck_projects_tax_pct_non_negative"),
        CheckConstraint("default_waste_pct >= 0", name="ck_projects_waste_pct_non_negative"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String(255), nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    default_tax_pct = Column(Float, nullable=False, default=0.0)
    default_waste_pct = Column(Float, nullable=False, default=0.0)
    status = Column(String(20), nullable=False, default="draft")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="projects")
    created_by_user = relationship("User", back_populates="projects")
    items = relationship("ProjectItem", back_populates="project", cascade="all, delete-orphan")


@register_updated_at
class ProjectItem(Base):
    __tablename__ = "project_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_project_items_quantity_positive"),
        CheckConstraint("waste_pct >= 0", name="ck_project_items_waste_pct_non_negative"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    material_id = Column(UUID(as_uuid=True), ForeignKey("materials.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    waste_pct = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="items")
    material = relationship("Material", back_populates="project_items")

    @hybrid_property
    def effective_waste_pct(self):
        if self.waste_pct is not None:
            return float(self.waste_pct)
        if self.material is not None and self.material.default_waste_pct is not None:
            return float(self.material.default_waste_pct)
        return 0.0

    @hybrid_property
    def total_qty(self):
        return float(self.quantity) * (1.0 + (self.effective_waste_pct or 0.0) / 100.0)

    @total_qty.expression
    def total_qty(cls):
        from sqlalchemy import func, literal
        return cls.quantity * (1.0 + (func.coalesce(cls.waste_pct, literal(0.0)) / 100.0))

    @property
    def line_subtotal(self):
        if self.material is None:
            return 0.0
        return float(self.total_qty) * float(self.material.unit_cost)


# Register updated_at listeners for Customer and Vendor
register_updated_at(Customer)
register_updated_at(Vendor)


# =====================================================
# WORKSPACE MODELS (auth.py depends on these)
# =====================================================

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String(255), nullable=False, unique=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    created_by_user = relationship("User", back_populates="created_workspaces")
    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")
    invites = relationship("WorkspaceInvite", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'user')", name="ck_workspace_members_role"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False, default="user")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace", back_populates="members")
    user = relationship("User", back_populates="workspace_memberships")


class WorkspaceInvite(Base):
    __tablename__ = "workspace_invites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    invited_email = Column(String(255), nullable=False)
    invite_token = Column(String(255), nullable=False, unique=True)
    invited_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    accepted_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace", back_populates="invites")
    invited_by_user = relationship("User", foreign_keys=[invited_by_user_id], back_populates="created_invites")
    accepted_by_user = relationship("User", foreign_keys=[accepted_by_user_id], back_populates="accepted_invites")