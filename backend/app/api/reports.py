from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_workspace_id
from app.db.base import get_db
from app.models.models import Material, Project, ProjectItem, User, Vendor

router = APIRouter(prefix="/reports", tags=["reports"])


# ── Response schemas ──────────────────────────────────────────────────────────


class MaterialUsageRow(BaseModel):
    material_id: str
    material_name: str
    category: Optional[str]
    unit_type: str
    total_quantity: float
    total_cost: float
    project_count: int

    class Config:
        from_attributes = True


class VendorSpendingRow(BaseModel):
    vendor_id: Optional[str]
    vendor_name: str
    material_count: int
    line_item_count: int
    total_cost: float

    class Config:
        from_attributes = True


class ProjectBudgetRow(BaseModel):
    project_id: str
    project_name: str
    customer_name: str
    status: str
    item_count: int
    cost_subtotal: float
    tax_pct: float
    tax_amount: float
    grand_total: float

    class Config:
        from_attributes = True


class MaterialUsageReport(BaseModel):
    rows: List[MaterialUsageRow]
    total_cost: float
    total_items_counted: int


class VendorSpendingReport(BaseModel):
    rows: List[VendorSpendingRow]
    grand_total: float


class ProjectBudgetReport(BaseModel):
    rows: List[ProjectBudgetRow]
    total_projects: int
    combined_subtotal: float
    combined_tax: float
    combined_grand_total: float


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/material-usage", response_model=MaterialUsageReport)
def material_usage_report(
    project_status: Optional[str] = Query(
        default=None,
        description="Filter by project status: draft, active, closed",
    ),
    category: Optional[str] = Query(
        default=None,
        description="Filter by material category (exact match, case-insensitive)",
    ),
    limit: int = Query(default=50, ge=1, le=500, description="Max rows returned"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    """
    Aggregate material usage across all projects in the active workspace.

    Returns total quantity consumed, total line cost, and number of distinct
    projects each material appears in — sorted by total cost descending.
    """
    query = (
        db.query(
            Material.id.label("material_id"),
            Material.name.label("material_name"),
            Material.category,
            Material.unit_type,
            func.sum(ProjectItem.total_qty).label("total_quantity"),
            func.sum(ProjectItem.line_subtotal).label("total_cost"),
            func.count(func.distinct(ProjectItem.project_id)).label("project_count"),
        )
        .join(ProjectItem, ProjectItem.material_id == Material.id)
        .join(Project, Project.id == ProjectItem.project_id)
        .filter(
            Material.workspace_id == current_workspace_id,
            ProjectItem.workspace_id == current_workspace_id,
            Project.workspace_id == current_workspace_id,
        )
    )

    if project_status:
        query = query.filter(Project.status == project_status)

    if category:
        query = query.filter(func.lower(Material.category) == category.lower())

    rows_raw = (
        query.group_by(
            Material.id,
            Material.name,
            Material.category,
            Material.unit_type,
        )
        .order_by(func.sum(ProjectItem.line_subtotal).desc())
        .limit(limit)
        .all()
    )

    rows = [
        MaterialUsageRow(
            material_id=str(r.material_id),
            material_name=r.material_name,
            category=r.category,
            unit_type=r.unit_type,
            total_quantity=float(r.total_quantity or 0),
            total_cost=float(r.total_cost or 0),
            project_count=int(r.project_count or 0),
        )
        for r in rows_raw
    ]

    total_cost = sum(r.total_cost for r in rows)
    total_items_counted = len(rows)

    return MaterialUsageReport(
        rows=rows,
        total_cost=total_cost,
        total_items_counted=total_items_counted,
    )


@router.get("/vendor-spending", response_model=VendorSpendingReport)
def vendor_spending_report(
    project_status: Optional[str] = Query(
        default=None,
        description="Filter by project status: draft, active, closed",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    """
    Total spending grouped by vendor across all projects in the active workspace.

    A line item's vendor is determined by its material's default_vendor_id.
    Line items whose material has no vendor are grouped under 'Unassigned'.
    """
    query = (
        db.query(
            Vendor.id.label("vendor_id"),
            Vendor.name.label("vendor_name"),
            func.count(func.distinct(Material.id)).label("material_count"),
            func.count(ProjectItem.id).label("line_item_count"),
            func.sum(ProjectItem.line_subtotal).label("total_cost"),
        )
        .join(Material, Material.default_vendor_id == Vendor.id)
        .join(ProjectItem, ProjectItem.material_id == Material.id)
        .join(Project, Project.id == ProjectItem.project_id)
        .filter(
            Vendor.workspace_id == current_workspace_id,
            ProjectItem.workspace_id == current_workspace_id,
            Project.workspace_id == current_workspace_id,
        )
    )

    if project_status:
        query = query.filter(Project.status == project_status)

    vendor_rows_raw = (
        query.group_by(Vendor.id, Vendor.name)
        .order_by(func.sum(ProjectItem.line_subtotal).desc())
        .all()
    )

    # Also capture unassigned items (materials with no vendor)
    unassigned_query = (
        db.query(
            func.count(func.distinct(Material.id)).label("material_count"),
            func.count(ProjectItem.id).label("line_item_count"),
            func.sum(ProjectItem.line_subtotal).label("total_cost"),
        )
        .join(ProjectItem, ProjectItem.material_id == Material.id)
        .join(Project, Project.id == ProjectItem.project_id)
        .filter(
            Material.workspace_id == current_workspace_id,
            ProjectItem.workspace_id == current_workspace_id,
            Project.workspace_id == current_workspace_id,
            Material.default_vendor_id.is_(None),
        )
    )

    if project_status:
        unassigned_query = unassigned_query.filter(Project.status == project_status)

    unassigned_raw = unassigned_query.one()

    rows: List[VendorSpendingRow] = [
        VendorSpendingRow(
            vendor_id=str(r.vendor_id),
            vendor_name=r.vendor_name,
            material_count=int(r.material_count or 0),
            line_item_count=int(r.line_item_count or 0),
            total_cost=float(r.total_cost or 0),
        )
        for r in vendor_rows_raw
    ]

    if unassigned_raw.total_cost and float(unassigned_raw.total_cost) > 0:
        rows.append(
            VendorSpendingRow(
                vendor_id=None,
                vendor_name="Unassigned",
                material_count=int(unassigned_raw.material_count or 0),
                line_item_count=int(unassigned_raw.line_item_count or 0),
                total_cost=float(unassigned_raw.total_cost or 0),
            )
        )

    grand_total = sum(r.total_cost for r in rows)

    return VendorSpendingReport(rows=rows, grand_total=grand_total)


@router.get("/project-budget", response_model=ProjectBudgetReport)
def project_budget_report(
    status: Optional[str] = Query(
        default=None,
        description="Filter by project status: draft, active, closed",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    """
    Budget summary for each project in the active workspace.

    Returns cost subtotal, applied tax, and grand total per project,
    sorted by grand total descending.
    """
    from app.models.models import Customer

    query = db.query(Project).filter(Project.workspace_id == current_workspace_id)

    if status:
        query = query.filter(Project.status == status)

    projects = query.order_by(Project.updated_at.desc()).all()

    rows: List[ProjectBudgetRow] = []
    combined_subtotal = 0.0
    combined_tax = 0.0

    for project in projects:
        customer = (
            db.query(Customer)
            .filter(Customer.id == project.customer_id)
            .first()
        )
        customer_name = customer.name if customer else "Unknown"

        cost_subtotal = sum(float(item.line_subtotal or 0) for item in project.items)
        tax_pct = float(project.default_tax_pct or 0)
        tax_amount = cost_subtotal * (tax_pct / 100.0)
        grand_total = cost_subtotal + tax_amount

        combined_subtotal += cost_subtotal
        combined_tax += tax_amount

        rows.append(
            ProjectBudgetRow(
                project_id=str(project.id),
                project_name=project.name,
                customer_name=customer_name,
                status=project.status,
                item_count=len(project.items),
                cost_subtotal=cost_subtotal,
                tax_pct=tax_pct,
                tax_amount=tax_amount,
                grand_total=grand_total,
            )
        )

    # Sort by grand total descending
    rows.sort(key=lambda r: r.grand_total, reverse=True)

    return ProjectBudgetReport(
        rows=rows,
        total_projects=len(rows),
        combined_subtotal=combined_subtotal,
        combined_tax=combined_tax,
        combined_grand_total=combined_subtotal + combined_tax,
    )
