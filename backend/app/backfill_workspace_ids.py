from __future__ import annotations

import argparse
import json
from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.models.models import Customer, Material, Project, ProjectItem, Vendor, WorkspaceMember


def _stringify_ids(values: set[Any]) -> list[str]:
    return sorted(str(value) for value in values if value is not None)


def backfill_workspace_ids(db: Session, commit: bool = True) -> dict[str, Any]:
    """Safely backfill nullable workspace_id columns where a single workspace can be inferred.

    Rules:
    - `projects.workspace_id` derives from the creator's earliest workspace membership.
    - `project_items.workspace_id` derives from the parent project.
    - `customers`, `materials`, and `vendors` are filled only when exactly one workspace can be inferred.
    - shared or orphaned rows are left null and reported for manual follow-up.
    """

    summary: dict[str, Any] = {
        "projects_updated": 0,
        "project_items_updated": 0,
        "customers_updated": 0,
        "materials_updated": 0,
        "vendors_updated": 0,
        "users_with_multiple_memberships": 0,
        "unresolved_projects": [],
        "unresolved_project_items": [],
        "shared_customers": [],
        "orphan_customers": [],
        "shared_materials": [],
        "orphan_materials": [],
        "shared_vendors": [],
        "orphan_vendors": [],
        "committed": False,
    }

    memberships = (
        db.query(WorkspaceMember)
        .order_by(WorkspaceMember.user_id.asc(), WorkspaceMember.created_at.asc(), WorkspaceMember.id.asc())
        .all()
    )

    primary_workspace_by_user: dict[Any, Any] = {}
    memberships_by_user: dict[Any, set[Any]] = defaultdict(set)

    for membership in memberships:
        memberships_by_user[membership.user_id].add(membership.workspace_id)
        primary_workspace_by_user.setdefault(membership.user_id, membership.workspace_id)

    summary["users_with_multiple_memberships"] = sum(
        1 for workspace_ids in memberships_by_user.values() if len(workspace_ids) > 1
    )

    projects = db.query(Project).filter(Project.workspace_id.is_(None)).all()
    for project in projects:
        workspace_id = primary_workspace_by_user.get(project.created_by)
        if workspace_id:
            project.workspace_id = workspace_id
            summary["projects_updated"] += 1
        else:
            summary["unresolved_projects"].append(str(project.id))

    db.flush()

    items = db.query(ProjectItem).filter(ProjectItem.workspace_id.is_(None)).all()
    for item in items:
        workspace_id = item.project.workspace_id if item.project else None
        if workspace_id:
            item.workspace_id = workspace_id
            summary["project_items_updated"] += 1
        else:
            summary["unresolved_project_items"].append(str(item.id))

    db.flush()

    customers = db.query(Customer).filter(Customer.workspace_id.is_(None)).all()
    for customer in customers:
        workspace_ids = {
            workspace_id
            for (workspace_id,) in db.query(Project.workspace_id)
            .filter(Project.customer_id == customer.id, Project.workspace_id.is_not(None))
            .distinct()
            .all()
            if workspace_id is not None
        }

        if len(workspace_ids) == 1:
            customer.workspace_id = next(iter(workspace_ids))
            summary["customers_updated"] += 1
        elif len(workspace_ids) > 1:
            summary["shared_customers"].append(str(customer.id))
        else:
            summary["orphan_customers"].append(str(customer.id))

    db.flush()

    materials = db.query(Material).filter(Material.workspace_id.is_(None)).all()
    for material in materials:
        workspace_ids = {
            workspace_id
            for (workspace_id,) in db.query(ProjectItem.workspace_id)
            .filter(ProjectItem.material_id == material.id, ProjectItem.workspace_id.is_not(None))
            .distinct()
            .all()
            if workspace_id is not None
        }

        if len(workspace_ids) == 1:
            material.workspace_id = next(iter(workspace_ids))
            summary["materials_updated"] += 1
        elif len(workspace_ids) > 1:
            summary["shared_materials"].append(str(material.id))
        else:
            summary["orphan_materials"].append(str(material.id))

    db.flush()

    vendors = db.query(Vendor).filter(Vendor.workspace_id.is_(None)).all()
    for vendor in vendors:
        workspace_ids = {
            workspace_id
            for (workspace_id,) in db.query(Material.workspace_id)
            .filter(Material.default_vendor_id == vendor.id, Material.workspace_id.is_not(None))
            .distinct()
            .all()
            if workspace_id is not None
        }

        if len(workspace_ids) == 1:
            vendor.workspace_id = next(iter(workspace_ids))
            summary["vendors_updated"] += 1
        elif len(workspace_ids) > 1:
            summary["shared_vendors"].append(str(vendor.id))
        else:
            summary["orphan_vendors"].append(str(vendor.id))

    if commit:
        db.commit()
        summary["committed"] = True
    else:
        db.rollback()

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill nullable workspace_id columns for BuilderPro.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview the backfill summary without committing database changes.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        summary = backfill_workspace_ids(db, commit=not args.dry_run)
    finally:
        db.close()

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
