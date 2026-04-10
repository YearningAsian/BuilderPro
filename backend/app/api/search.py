from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_workspace_id
from app.db.base import get_db
from app.models.models import Customer, Material, Project, ProjectItem, User, Vendor

router = APIRouter(prefix="/search", tags=["search"])


def _normalized_terms(value: str) -> list[str]:
    return [term.strip() for term in value.split() if term.strip()]


def _apply_multi_term_filter(queryset, columns, terms: list[str]):
    if not terms:
        return queryset

    predicates = []
    for term in terms:
        like_pattern = f"%{term}%"
        predicates.append(or_(*[column.ilike(like_pattern) for column in columns]))

    return queryset.filter(and_(*predicates))


def _relevance_rank_expression(primary_column, query_text: str):
    lowered_column = func.lower(primary_column)
    lowered_query = query_text.lower()
    return case(
        (lowered_column == lowered_query, 0),
        (lowered_column.like(f"{lowered_query}%"), 1),
        else_=2,
    )


class SearchMaterialResult(BaseModel):
    id: UUID
    name: str
    category: str | None = None
    sku: str | None = None
    unit_type: str
    unit_cost: float
    default_vendor_id: UUID | None = None


class SearchProjectResult(BaseModel):
    id: UUID
    name: str
    status: str
    customer_id: UUID
    item_count: int
    estimate_total: float


class SearchCustomerResult(BaseModel):
    id: UUID
    name: str
    email: str | None = None
    phone: str | None = None


class SearchVendorResult(BaseModel):
    id: UUID
    name: str
    email: str | None = None
    phone: str | None = None


class SearchResponse(BaseModel):
    query: str
    total: int
    materials: list[SearchMaterialResult]
    projects: list[SearchProjectResult]
    customers: list[SearchCustomerResult]
    vendors: list[SearchVendorResult]


@router.get("", response_model=SearchResponse)
def search_workspace(
    q: str = Query(..., min_length=2, max_length=120),
    entity: str = Query(default="all", pattern="^(all|materials|projects|customers|vendors)$"),
    project_status: str | None = Query(default=None),
    material_category: str | None = Query(default=None),
    vendor_id: UUID | None = Query(default=None),
    project_id: UUID | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace_id=Depends(get_current_workspace_id),
):
    del current_user

    query = q.strip()
    if not query:
        return SearchResponse(
            query="",
            total=0,
            materials=[],
            projects=[],
            customers=[],
            vendors=[],
        )

    terms = _normalized_terms(query)

    materials: list[SearchMaterialResult] = []
    projects: list[SearchProjectResult] = []
    customers: list[SearchCustomerResult] = []
    vendors: list[SearchVendorResult] = []

    if entity in {"all", "materials"}:
        materials_query = db.query(Material).filter(Material.workspace_id == current_workspace_id)
        materials_query = _apply_multi_term_filter(
            materials_query,
            [Material.name, Material.category, Material.sku, Material.unit_type],
            terms,
        )

        if material_category:
            materials_query = materials_query.filter(Material.category == material_category)
        if vendor_id is not None:
            materials_query = materials_query.filter(Material.default_vendor_id == vendor_id)

        if project_id is not None:
            materials_query = (
                materials_query.join(ProjectItem, ProjectItem.material_id == Material.id)
                .filter(
                    ProjectItem.project_id == project_id,
                    ProjectItem.workspace_id == current_workspace_id,
                )
                .distinct(Material.id)
            )

        material_rows = (
            materials_query
            .order_by(_relevance_rank_expression(Material.name, query), Material.name.asc())
            .limit(limit)
            .all()
        )
        materials = [
            SearchMaterialResult(
                id=row.id,
                name=row.name,
                category=row.category,
                sku=row.sku,
                unit_type=row.unit_type,
                unit_cost=float(row.unit_cost),
                default_vendor_id=row.default_vendor_id,
            )
            for row in material_rows
        ]

    if entity in {"all", "projects"}:
        projects_query = db.query(Project).filter(Project.workspace_id == current_workspace_id)
        projects_query = _apply_multi_term_filter(
            projects_query,
            [Project.name, Project.status],
            terms,
        )

        if project_status:
            projects_query = projects_query.filter(Project.status == project_status)
        if project_id is not None:
            projects_query = projects_query.filter(Project.id == project_id)
        if vendor_id is not None:
            projects_query = (
                projects_query.join(ProjectItem, ProjectItem.project_id == Project.id)
                .join(Material, Material.id == ProjectItem.material_id)
                .filter(
                    Material.default_vendor_id == vendor_id,
                    ProjectItem.workspace_id == current_workspace_id,
                )
                .distinct(Project.id)
            )

        project_rows = (
            projects_query
            .order_by(_relevance_rank_expression(Project.name, query), Project.updated_at.desc())
            .limit(limit)
            .all()
        )
        projects = [
            SearchProjectResult(
                id=row.id,
                name=row.name,
                status=row.status,
                customer_id=row.customer_id,
                item_count=len(row.items),
                estimate_total=sum(float(item.line_subtotal) for item in row.items),
            )
            for row in project_rows
        ]

    if entity in {"all", "customers"}:
        customers_query = db.query(Customer).filter(Customer.workspace_id == current_workspace_id)
        customers_query = _apply_multi_term_filter(
            customers_query,
            [Customer.name, Customer.email, Customer.phone, Customer.address],
            terms,
        )

        if project_id is not None:
            customers_query = (
                customers_query.join(Project, Project.customer_id == Customer.id)
                .filter(Project.id == project_id, Project.workspace_id == current_workspace_id)
                .distinct(Customer.id)
            )

        customer_rows = (
            customers_query
            .order_by(_relevance_rank_expression(Customer.name, query), Customer.name.asc())
            .limit(limit)
            .all()
        )
        customers = [
            SearchCustomerResult(
                id=row.id,
                name=row.name,
                email=row.email,
                phone=row.phone,
            )
            for row in customer_rows
        ]

    if entity in {"all", "vendors"}:
        vendors_query = db.query(Vendor).filter(Vendor.workspace_id == current_workspace_id)
        vendors_query = _apply_multi_term_filter(
            vendors_query,
            [Vendor.name, Vendor.email, Vendor.phone, Vendor.address],
            terms,
        )

        if vendor_id is not None:
            vendors_query = vendors_query.filter(Vendor.id == vendor_id)

        if project_id is not None:
            vendors_query = (
                vendors_query.join(Material, Material.default_vendor_id == Vendor.id)
                .join(ProjectItem, ProjectItem.material_id == Material.id)
                .filter(
                    ProjectItem.project_id == project_id,
                    ProjectItem.workspace_id == current_workspace_id,
                )
                .distinct(Vendor.id)
            )

        vendor_rows = (
            vendors_query
            .order_by(_relevance_rank_expression(Vendor.name, query), Vendor.name.asc())
            .limit(limit)
            .all()
        )
        vendors = [
            SearchVendorResult(
                id=row.id,
                name=row.name,
                email=row.email,
                phone=row.phone,
            )
            for row in vendor_rows
        ]

    total = len(materials) + len(projects) + len(customers) + len(vendors)
    return SearchResponse(
        query=query,
        total=total,
        materials=materials,
        projects=projects,
        customers=customers,
        vendors=vendors,
    )
