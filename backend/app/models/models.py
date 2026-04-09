from uuid import uuid4
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import relationship
from app.db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'user')", name="ck_users_role"),
    )

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    role = Column(String, nullable=False, default="user")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    projects = relationship("Project", back_populates="created_by_user")
    workspace_memberships = relationship("WorkspaceMember", back_populates="user", cascade="all, delete-orphan")
    created_workspaces = relationship("Workspace", back_populates="created_by_user")
    created_invites = relationship(
        "WorkspaceInvite",
        foreign_keys="WorkspaceInvite.invited_by_user_id",
        back_populates="invited_by_user",
    )
    accepted_invites = relationship(
        "WorkspaceInvite",
        foreign_keys="WorkspaceInvite.accepted_by_user_id",
        back_populates="accepted_by_user",
    )
    audit_logs = relationship("AuditLog", back_populates="actor")


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id = Column(Uuid(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    workspace = relationship("Workspace", back_populates="customers")
    projects = relationship("Project", back_populates="customer")


class Vendor(Base):
    __tablename__ = "vendors"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_vendors_workspace_name"),
    )

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id = Column(Uuid(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    workspace = relationship("Workspace", back_populates="vendors")
    materials = relationship("Material", back_populates="default_vendor")


class Material(Base):
    __tablename__ = "materials"
    __table_args__ = (
        CheckConstraint("unit_cost >= 0", name="ck_materials_unit_cost_non_negative"),
        CheckConstraint("default_waste_pct >= 0", name="ck_materials_waste_pct_non_negative"),
        UniqueConstraint("workspace_id", "sku", name="uq_materials_workspace_sku"),
    )

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id = Column(Uuid(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    category = Column(String, nullable=True, index=True)
    unit_type = Column(String, nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    sku = Column(String, nullable=True)
    default_vendor_id = Column(Uuid(as_uuid=True), ForeignKey("vendors.id"), nullable=True, index=True)
    size_dims = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    is_taxable = Column(Boolean, nullable=False, default=True)
    default_waste_pct = Column(Numeric(5, 2), nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    workspace = relationship("Workspace", back_populates="materials")
    default_vendor = relationship("Vendor", back_populates="materials")
    project_items = relationship("ProjectItem", back_populates="material")


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'active', 'closed')", name="ck_projects_status"),
        CheckConstraint("default_tax_pct >= 0", name="ck_projects_tax_pct_non_negative"),
        CheckConstraint("default_waste_pct >= 0", name="ck_projects_waste_pct_non_negative"),
    )

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id = Column(Uuid(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    customer_id = Column(Uuid(as_uuid=True), ForeignKey("customers.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="draft", index=True)
    default_tax_pct = Column(Numeric(5, 2), nullable=False, default=0)
    default_waste_pct = Column(Numeric(5, 2), nullable=False, default=0)
    created_by = Column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    workspace = relationship("Workspace", back_populates="projects")
    customer = relationship("Customer", back_populates="projects")
    created_by_user = relationship("User", back_populates="projects")
    items = relationship("ProjectItem", back_populates="project", cascade="all, delete-orphan")


class ProjectItem(Base):
    __tablename__ = "project_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_project_items_quantity_positive"),
        CheckConstraint("unit_cost >= 0", name="ck_project_items_unit_cost_non_negative"),
        CheckConstraint("waste_pct >= 0", name="ck_project_items_waste_pct_non_negative"),
        CheckConstraint("order_status IN ('draft', 'ordered', 'received', 'cancelled')", name="ck_project_items_order_status"),
    )

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id = Column(Uuid(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    project_id = Column(Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    material_id = Column(Uuid(as_uuid=True), ForeignKey("materials.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_type = Column(String, nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    waste_pct = Column(Numeric(5, 2), nullable=False, default=0)
    total_qty = Column(Numeric(12, 3), nullable=False)
    line_subtotal = Column(Numeric(12, 2), nullable=False)
    order_status = Column(String, nullable=False, default="draft", server_default="draft", index=True)
    po_number = Column(String, nullable=True, index=True)
    purchase_notes = Column(Text, nullable=True)
    expected_delivery_at = Column(DateTime(timezone=True), nullable=True, index=True)
    carrier = Column(String, nullable=True)
    tracking_number = Column(String, nullable=True, index=True)
    tracking_url = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    ordered_at = Column(DateTime(timezone=True), nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    workspace = relationship("Workspace", back_populates="project_items")
    project = relationship("Project", back_populates="items")
    material = relationship("Material", back_populates="project_items")

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False, unique=True, index=True)
    created_by = Column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    created_by_user = relationship("User", back_populates="created_workspaces")
    customers = relationship("Customer", back_populates="workspace")
    vendors = relationship("Vendor", back_populates="workspace")
    materials = relationship("Material", back_populates="workspace")
    projects = relationship("Project", back_populates="workspace")
    project_items = relationship("ProjectItem", back_populates="workspace")
    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")
    invites = relationship("WorkspaceInvite", back_populates="workspace", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="workspace", cascade="all, delete-orphan")


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
    invited_by_user = relationship(
        "User",
        foreign_keys=[invited_by_user_id],
        back_populates="created_invites",
    )
    accepted_by_user = relationship(
        "User",
        foreign_keys=[accepted_by_user_id],
        back_populates="accepted_invites",
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id = Column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String, nullable=False, index=True)
    resource_type = Column(String, nullable=False)
    resource_id = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    workspace = relationship("Workspace", back_populates="audit_logs")
    actor = relationship("User", back_populates="audit_logs")
