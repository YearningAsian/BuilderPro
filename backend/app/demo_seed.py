from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from app.db.base import Base, SessionLocal, engine
from app.models import models as _models  # noqa: F401
from app.models.models import Customer, Material, Project, ProjectItem, User, Vendor, Workspace, WorkspaceMember

DEMO_USER_ID = UUID("10000000-0000-0000-0000-000000000001")
DEMO_WORKSPACE_ID = UUID("00000000-0000-0000-0000-000000000001")
DEMO_MEMBERSHIP_ID = UUID("10000000-0000-0000-0000-000000000002")
DEMO_EMAIL = "demo@builderpro.local"
DEMO_FULL_NAME = "Demo Admin"
DEMO_WORKSPACE_NAME = "Northwind Builders"


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _money(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _qty(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.001"))


def _upsert(db, model, record_id, **attrs):
    instance = db.get(model, record_id)
    if instance is None:
        instance = model(id=record_id, **attrs)
        db.add(instance)
        db.flush()
        return instance

    for key, value in attrs.items():
        setattr(instance, key, value)
    db.add(instance)
    db.flush()
    return instance


def seed_demo_data(db) -> dict[str, int]:
    user = _upsert(
        db,
        User,
        DEMO_USER_ID,
        email=DEMO_EMAIL,
        full_name=DEMO_FULL_NAME,
        role="admin",
        created_at=_dt("2026-03-01T08:00:00Z"),
    )

    workspace = _upsert(
        db,
        Workspace,
        DEMO_WORKSPACE_ID,
        name=DEMO_WORKSPACE_NAME,
        created_by=user.id,
        created_at=_dt("2026-03-01T08:00:00Z"),
    )

    _upsert(
        db,
        WorkspaceMember,
        DEMO_MEMBERSHIP_ID,
        workspace_id=workspace.id,
        user_id=user.id,
        role="admin",
        created_at=_dt("2026-03-01T08:00:00Z"),
    )

    vendor_specs = [
        {
            "id": UUID("a1000000-0000-0000-0000-000000000001"),
            "name": "ABC Lumber Supply",
            "phone": "(555) 100-2001",
            "email": "sales@abclumber.com",
            "address": "123 Timber Rd, Portland, OR 97201",
            "notes": "Primary framing supplier for residential jobs.",
            "created_at": _dt("2026-01-15T08:00:00Z"),
        },
        {
            "id": UUID("a1000000-0000-0000-0000-000000000002"),
            "name": "Pacific Concrete Co.",
            "phone": "(555) 200-3002",
            "email": "orders@pacificconcrete.com",
            "address": "456 Mixer Ave, Seattle, WA 98101",
            "notes": "Fast turnaround on slab and footing pours.",
            "created_at": _dt("2026-01-20T10:00:00Z"),
        },
        {
            "id": UUID("a1000000-0000-0000-0000-000000000003"),
            "name": "SteelMax Distributors",
            "phone": "(555) 300-4003",
            "email": "info@steelmax.com",
            "address": "789 Foundry Blvd, Denver, CO 80201",
            "notes": "Carries structural steel and Simpson hardware.",
            "created_at": _dt("2026-02-01T09:00:00Z"),
        },
        {
            "id": UUID("a1000000-0000-0000-0000-000000000004"),
            "name": "National Plumbing Wholesale",
            "phone": "(555) 400-5004",
            "email": "wholesale@natplumb.com",
            "address": "321 Pipe St, Phoenix, AZ 85001",
            "notes": "PEX and fixture source for remodel crews.",
            "created_at": _dt("2026-02-05T11:00:00Z"),
        },
        {
            "id": UUID("a1000000-0000-0000-0000-000000000005"),
            "name": "BrightWire Electrical",
            "phone": "(555) 500-6005",
            "email": "orders@brightwire.com",
            "address": "654 Circuit Ln, Austin, TX 73301",
            "notes": "Preferred electrical supply partner.",
            "created_at": _dt("2026-02-10T14:00:00Z"),
        },
    ]

    for spec in vendor_specs:
        _upsert(db, Vendor, spec["id"], workspace_id=workspace.id, **{k: v for k, v in spec.items() if k != "id"})

    customer_specs = [
        {
            "id": UUID("b2000000-0000-0000-0000-000000000001"),
            "name": "Riverside Developments LLC",
            "phone": "(555) 111-0001",
            "email": "pm@riversidedev.com",
            "address": "100 River Walk, Austin, TX 73301",
            "notes": "Preferred client with recurring buildouts and net-30 terms.",
            "created_at": _dt("2026-01-10T08:00:00Z"),
        },
        {
            "id": UUID("b2000000-0000-0000-0000-000000000002"),
            "name": "Summit Construction Group",
            "phone": "(555) 222-0002",
            "email": "info@summitcg.com",
            "address": "200 Peak Ave, Denver, CO 80201",
            "notes": "Commercial interiors partner.",
            "created_at": _dt("2026-01-18T10:00:00Z"),
        },
        {
            "id": UUID("b2000000-0000-0000-0000-000000000003"),
            "name": "Coastal Home Builders",
            "phone": "(555) 333-0003",
            "email": "hello@coastalhb.com",
            "address": "300 Beach Blvd, San Diego, CA 92101",
            "notes": "High-end custom home builder.",
            "created_at": _dt("2026-02-01T12:00:00Z"),
        },
    ]

    for spec in customer_specs:
        _upsert(db, Customer, spec["id"], workspace_id=workspace.id, **{k: v for k, v in spec.items() if k != "id"})

    material_specs = [
        ("c3000000-0000-0000-0000-000000000001", "2x4 Stud 8ft SPF", "Lumber", "piece", 5.48, "LBR-2x4-8", "a1000000-0000-0000-0000-000000000001", '1.5" x 3.5" x 96"', "Standard framing stud", True, 10, "2026-01-15T08:00:00Z"),
        ("c3000000-0000-0000-0000-000000000002", "2x6 Stud 8ft SPF", "Lumber", "piece", 8.27, "LBR-2x6-8", "a1000000-0000-0000-0000-000000000001", '1.5" x 5.5" x 96"', "Exterior wall framing", True, 10, "2026-01-15T09:00:00Z"),
        ("c3000000-0000-0000-0000-000000000003", '4x8 Plywood 1/2" CDX', "Lumber", "sheet", 42.99, "LBR-PLY-CDX-12", "a1000000-0000-0000-0000-000000000001", '48" x 96" x 0.5"', "Roof and wall sheathing", True, 8, "2026-01-16T08:00:00Z"),
        ("c3000000-0000-0000-0000-000000000005", "Ready-Mix Concrete 4000 PSI", "Concrete", "cubic yard", 145.00, "CON-RM-4000", "a1000000-0000-0000-0000-000000000002", None, "Standard structural mix", True, 5, "2026-01-20T10:00:00Z"),
        ("c3000000-0000-0000-0000-000000000006", 'Rebar #4 (1/2") 20ft', "Concrete", "piece", 12.75, "CON-RB4-20", "a1000000-0000-0000-0000-000000000003", '0.5" dia x 20ft', "Grade 60 reinforcing bar", True, 5, "2026-01-20T11:00:00Z"),
        ("c3000000-0000-0000-0000-000000000008", "Simpson Strong-Tie A34", "Hardware", "piece", 1.65, "HDW-SS-A34", "a1000000-0000-0000-0000-000000000003", None, "Framing angle bracket", True, 2, "2026-02-01T09:00:00Z"),
        ("c3000000-0000-0000-0000-000000000009", '3/4" PEX Tubing 100ft', "Plumbing", "roll", 67.00, "PLM-PEX34-100", "a1000000-0000-0000-0000-000000000004", '0.75" OD x 100ft', "Type B cross-linked polyethylene", True, 5, "2026-02-05T11:00:00Z"),
        ("c3000000-0000-0000-0000-000000000011", "Romex 12/2 NM-B 250ft", "Electrical", "roll", 89.99, "ELC-NM122-250", "a1000000-0000-0000-0000-000000000005", "12 AWG, 2-conductor + ground", "Branch circuit wiring", True, 8, "2026-02-10T14:00:00Z"),
        ("c3000000-0000-0000-0000-000000000014", '1/2" Drywall 4x8', "Drywall", "sheet", 14.48, "DRY-12-4x8", "a1000000-0000-0000-0000-000000000001", '48" x 96" x 0.5"', "Standard interior gypsum board", True, 10, "2026-02-12T08:00:00Z"),
    ]

    for raw_id, name, category, unit_type, unit_cost, sku, vendor_id, size_dims, notes, is_taxable, waste_pct, created_at in material_specs:
        material_id = UUID(raw_id)
        timestamp = _dt(created_at)
        _upsert(
            db,
            Material,
            material_id,
            workspace_id=workspace.id,
            name=name,
            category=category,
            unit_type=unit_type,
            unit_cost=_money(unit_cost),
            sku=sku,
            default_vendor_id=UUID(vendor_id) if vendor_id else None,
            size_dims=size_dims,
            notes=notes,
            is_taxable=is_taxable,
            default_waste_pct=_money(waste_pct),
            created_at=timestamp,
            updated_at=timestamp,
        )

    project_specs = [
        {
            "id": UUID("e5000000-0000-0000-0000-000000000001"),
            "name": "Riverside Residence - Phase 1",
            "customer_id": UUID("b2000000-0000-0000-0000-000000000001"),
            "status": "active",
            "default_tax_pct": 8.25,
            "default_waste_pct": 10,
            "created_at": _dt("2026-03-01T08:00:00Z"),
            "updated_at": _dt("2026-04-13T15:00:00Z"),
        },
        {
            "id": UUID("e5000000-0000-0000-0000-000000000002"),
            "name": "Summit Office Remodel",
            "customer_id": UUID("b2000000-0000-0000-0000-000000000002"),
            "status": "draft",
            "default_tax_pct": 7.50,
            "default_waste_pct": 8,
            "created_at": _dt("2026-03-05T10:00:00Z"),
            "updated_at": _dt("2026-04-11T09:30:00Z"),
        },
        {
            "id": UUID("e5000000-0000-0000-0000-000000000003"),
            "name": "Coastal Beach House",
            "customer_id": UUID("b2000000-0000-0000-0000-000000000003"),
            "status": "active",
            "default_tax_pct": 7.75,
            "default_waste_pct": 10,
            "created_at": _dt("2026-03-12T12:00:00Z"),
            "updated_at": _dt("2026-04-12T14:10:00Z"),
        },
    ]

    for spec in project_specs:
        _upsert(
            db,
            Project,
            spec["id"],
            workspace_id=workspace.id,
            name=spec["name"],
            customer_id=spec["customer_id"],
            status=spec["status"],
            default_tax_pct=_money(spec["default_tax_pct"]),
            default_waste_pct=_money(spec["default_waste_pct"]),
            created_by=user.id,
            created_at=spec["created_at"],
            updated_at=spec["updated_at"],
        )

    item_specs = [
        {
            "id": UUID("d4000000-0000-0000-0000-000000000001"),
            "project_id": UUID("e5000000-0000-0000-0000-000000000001"),
            "material_id": UUID("c3000000-0000-0000-0000-000000000001"),
            "quantity": 120,
            "unit_type": "piece",
            "unit_cost": 5.48,
            "waste_pct": 10,
            "total_qty": 132,
            "line_subtotal": 723.36,
            "order_status": "ordered",
            "po_number": "PO-24018",
            "purchase_notes": "Split delivery with roof sheathing package.",
            "expected_delivery_at": _dt("2026-04-16T15:00:00Z"),
            "carrier": "ABC Fleet",
            "tracking_number": "ABC-24018-1",
            "tracking_url": "https://tracking.example.com/ABC-24018-1",
            "ordered_at": _dt("2026-04-13T09:00:00Z"),
            "received_at": None,
            "notes": "Main floor framing package",
            "created_at": _dt("2026-03-01T08:00:00Z"),
            "updated_at": _dt("2026-04-13T09:00:00Z"),
        },
        {
            "id": UUID("d4000000-0000-0000-0000-000000000002"),
            "project_id": UUID("e5000000-0000-0000-0000-000000000001"),
            "material_id": UUID("c3000000-0000-0000-0000-000000000003"),
            "quantity": 24,
            "unit_type": "sheet",
            "unit_cost": 42.99,
            "waste_pct": 8,
            "total_qty": 25.92,
            "line_subtotal": 1114.26,
            "order_status": "received",
            "po_number": "PO-24018",
            "purchase_notes": "Roof deck package received on site.",
            "expected_delivery_at": _dt("2026-04-12T11:00:00Z"),
            "carrier": "ABC Fleet",
            "tracking_number": "ABC-24018-2",
            "tracking_url": "https://tracking.example.com/ABC-24018-2",
            "ordered_at": _dt("2026-04-10T10:00:00Z"),
            "received_at": _dt("2026-04-12T13:30:00Z"),
            "notes": "Roof sheathing",
            "created_at": _dt("2026-03-01T08:30:00Z"),
            "updated_at": _dt("2026-04-12T13:30:00Z"),
        },
        {
            "id": UUID("d4000000-0000-0000-0000-000000000003"),
            "project_id": UUID("e5000000-0000-0000-0000-000000000001"),
            "material_id": UUID("c3000000-0000-0000-0000-000000000005"),
            "quantity": 8,
            "unit_type": "cubic yard",
            "unit_cost": 145,
            "waste_pct": 5,
            "total_qty": 8.4,
            "line_subtotal": 1218.00,
            "order_status": "received",
            "po_number": "PO-23980",
            "purchase_notes": "Foundation slab pour completed.",
            "expected_delivery_at": _dt("2026-04-05T08:00:00Z"),
            "carrier": "Pacific Concrete Dispatch",
            "tracking_number": "",
            "tracking_url": "",
            "ordered_at": _dt("2026-04-03T07:15:00Z"),
            "received_at": _dt("2026-04-05T12:45:00Z"),
            "notes": "Foundation slab",
            "created_at": _dt("2026-03-01T09:00:00Z"),
            "updated_at": _dt("2026-04-05T12:45:00Z"),
        },
        {
            "id": UUID("d4000000-0000-0000-0000-000000000004"),
            "project_id": UUID("e5000000-0000-0000-0000-000000000002"),
            "material_id": UUID("c3000000-0000-0000-0000-000000000014"),
            "quantity": 140,
            "unit_type": "sheet",
            "unit_cost": 14.48,
            "waste_pct": 10,
            "total_qty": 154,
            "line_subtotal": 2229.92,
            "order_status": "draft",
            "po_number": None,
            "purchase_notes": None,
            "expected_delivery_at": None,
            "carrier": None,
            "tracking_number": None,
            "tracking_url": None,
            "ordered_at": None,
            "received_at": None,
            "notes": "Level 2 drywall package",
            "created_at": _dt("2026-04-08T09:10:00Z"),
            "updated_at": _dt("2026-04-11T09:30:00Z"),
        },
        {
            "id": UUID("d4000000-0000-0000-0000-000000000005"),
            "project_id": UUID("e5000000-0000-0000-0000-000000000002"),
            "material_id": UUID("c3000000-0000-0000-0000-000000000011"),
            "quantity": 12,
            "unit_type": "roll",
            "unit_cost": 89.99,
            "waste_pct": 8,
            "total_qty": 12.96,
            "line_subtotal": 1166.27,
            "order_status": "draft",
            "po_number": None,
            "purchase_notes": None,
            "expected_delivery_at": None,
            "carrier": None,
            "tracking_number": None,
            "tracking_url": None,
            "ordered_at": None,
            "received_at": None,
            "notes": "Open office branch circuits",
            "created_at": _dt("2026-04-09T11:00:00Z"),
            "updated_at": _dt("2026-04-11T09:30:00Z"),
        },
        {
            "id": UUID("d4000000-0000-0000-0000-000000000006"),
            "project_id": UUID("e5000000-0000-0000-0000-000000000003"),
            "material_id": UUID("c3000000-0000-0000-0000-000000000009"),
            "quantity": 9,
            "unit_type": "roll",
            "unit_cost": 67,
            "waste_pct": 5,
            "total_qty": 9.45,
            "line_subtotal": 633.15,
            "order_status": "ordered",
            "po_number": "PO-24027",
            "purchase_notes": "Plumbing rough-in package for master wing.",
            "expected_delivery_at": _dt("2026-04-18T10:00:00Z"),
            "carrier": "National Freight",
            "tracking_number": "",
            "tracking_url": "",
            "ordered_at": _dt("2026-04-14T16:20:00Z"),
            "received_at": None,
            "notes": "PEX tubing for plumbing rough-in",
            "created_at": _dt("2026-04-10T10:00:00Z"),
            "updated_at": _dt("2026-04-14T16:20:00Z"),
        },
    ]

    for spec in item_specs:
        _upsert(
            db,
            ProjectItem,
            spec["id"],
            workspace_id=workspace.id,
            project_id=spec["project_id"],
            material_id=spec["material_id"],
            quantity=_qty(spec["quantity"]),
            unit_type=spec["unit_type"],
            unit_cost=_money(spec["unit_cost"]),
            waste_pct=_money(spec["waste_pct"]),
            total_qty=_qty(spec["total_qty"]),
            line_subtotal=_money(spec["line_subtotal"]),
            order_status=spec["order_status"],
            po_number=spec["po_number"],
            purchase_notes=spec["purchase_notes"],
            expected_delivery_at=spec["expected_delivery_at"],
            carrier=spec["carrier"],
            tracking_number=spec["tracking_number"],
            tracking_url=spec["tracking_url"],
            ordered_at=spec["ordered_at"],
            received_at=spec["received_at"],
            notes=spec["notes"],
            created_at=spec["created_at"],
            updated_at=spec["updated_at"],
        )

    db.commit()

    return {
        "users": 1,
        "workspaces": 1,
        "vendors": len(vendor_specs),
        "customers": len(customer_specs),
        "materials": len(material_specs),
        "projects": len(project_specs),
        "project_items": len(item_specs),
    }


def ensure_demo_workspace(db) -> tuple[User, Workspace]:
    seed_demo_data(db)
    user = db.get(User, DEMO_USER_ID)
    workspace = db.get(Workspace, DEMO_WORKSPACE_ID)
    if user is None or workspace is None:
        raise RuntimeError("Demo workspace seed did not create the expected records.")
    return user, workspace


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        summary = seed_demo_data(db)
    finally:
        db.close()

    print(
        "Seeded BuilderPro demo workspace "
        f"({summary['vendors']} vendors, {summary['customers']} customers, "
        f"{summary['materials']} materials, {summary['projects']} projects, {summary['project_items']} line items)."
    )


if __name__ == "__main__":
    main()
