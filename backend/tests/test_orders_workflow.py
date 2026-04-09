import unittest
from datetime import datetime
from decimal import Decimal

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.orders import (
    BulkOrderStatusUpdateRequest,
    bulk_update_vendor_orders,
    vendor_purchase_order_document,
)
from app.db.base import Base
from app.models.models import AuditLog, Customer, Material, Project, ProjectItem, User, Vendor, Workspace, WorkspaceMember
from app.schemas.schemas import ProjectItemUpdate


class OrdersWorkflowTests(unittest.TestCase):
    def make_session(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        Base.metadata.create_all(bind=engine)
        return TestingSessionLocal()

    def _seed_order_line(self, db):
        owner = User(email="owner@example.com", full_name="Owner", role="admin")
        workspace = Workspace(name="Orders Test Workspace", created_by=None)
        db.add_all([owner, workspace])
        db.flush()

        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin"))

        customer = Customer(name="Acme Customer", workspace_id=workspace.id)
        vendor = Vendor(name="Fast Supply", email="orders@fast.example", workspace_id=workspace.id)
        db.add_all([customer, vendor])
        db.flush()

        material = Material(
            name="Lumber 2x4",
            unit_type="ea",
            unit_cost=Decimal("8.50"),
            default_waste_pct=Decimal("5.0"),
            workspace_id=workspace.id,
            default_vendor_id=vendor.id,
        )
        db.add(material)
        db.flush()

        project = Project(
            name="Kitchen Remodel",
            customer_id=customer.id,
            status="active",
            created_by=owner.id,
            workspace_id=workspace.id,
        )
        db.add(project)
        db.flush()

        item = ProjectItem(
            project_id=project.id,
            material_id=material.id,
            quantity=Decimal("10"),
            unit_type="ea",
            unit_cost=Decimal("8.50"),
            waste_pct=Decimal("5.0"),
            total_qty=Decimal("10.5"),
            line_subtotal=Decimal("89.25"),
            order_status="draft",
            workspace_id=workspace.id,
        )
        db.add(item)
        db.commit()

        db.refresh(owner)
        db.refresh(workspace)
        db.refresh(vendor)
        db.refresh(project)
        db.refresh(item)
        return owner, workspace, vendor, project, item

    def test_bulk_status_update_writes_audit_event_and_updates_lines(self):
        db = self.make_session()
        try:
            owner, workspace, vendor, _, item = self._seed_order_line(db)

            payload = BulkOrderStatusUpdateRequest(
                vendor_id=vendor.id,
                from_status="ready",
                to_status="ordered",
                po_number="PO-2026-11",
                expected_delivery_at=datetime(2026, 4, 15, 12, 0, 0),
                carrier="  UPS   Ground ",
                tracking_number="1Z999",
                tracking_url="https://carrier.example/track/1Z999",
            )

            response = bulk_update_vendor_orders(
                payload=payload,
                db=db,
                current_user=owner,
                current_workspace_id=workspace.id,
            )

            self.assertEqual(response.updated_count, 1)
            db.refresh(item)
            self.assertEqual(item.order_status, "ordered")
            self.assertEqual(item.po_number, "PO-2026-11")
            self.assertEqual(item.carrier, "UPS Ground")
            self.assertEqual(item.tracking_url, "https://carrier.example/track/1Z999")
            self.assertIsNotNone(item.ordered_at)

            event = (
                db.query(AuditLog)
                .filter(AuditLog.workspace_id == workspace.id, AuditLog.action == "orders.bulk_status_updated")
                .order_by(AuditLog.created_at.desc())
                .first()
            )
            self.assertIsNotNone(event)
            self.assertEqual(event.resource_type, "vendor")
        finally:
            db.close()

    def test_po_document_generation_writes_audit_event(self):
        db = self.make_session()
        try:
            owner, workspace, vendor, _, item = self._seed_order_line(db)
            item.order_status = "ordered"
            db.add(item)
            db.commit()

            response = vendor_purchase_order_document(
                vendor_id=vendor.id,
                include_status="ordered",
                db=db,
                current_user=owner,
                current_workspace_id=workspace.id,
            )

            html = response.body.decode("utf-8")
            self.assertIn("Purchase Order", html)
            self.assertIn("Kitchen Remodel", html)
            self.assertIn("Lumber 2x4", html)

            event = (
                db.query(AuditLog)
                .filter(AuditLog.workspace_id == workspace.id, AuditLog.action == "orders.po_document_generated")
                .order_by(AuditLog.created_at.desc())
                .first()
            )
            self.assertIsNotNone(event)
            self.assertEqual(event.resource_type, "vendor")
        finally:
            db.close()

    def test_tracking_url_validation_rejects_invalid_url(self):
        with self.assertRaises(ValidationError):
            ProjectItemUpdate(tracking_url="ftp://invalid.example/file")

        with self.assertRaises(ValidationError):
            BulkOrderStatusUpdateRequest(
                vendor_id="00000000-0000-0000-0000-000000000001",
                from_status="ready",
                to_status="ordered",
                tracking_url="not-a-url",
            )

    def test_carrier_normalization_collapses_whitespace(self):
        update_payload = ProjectItemUpdate(carrier="  FedEx   Freight   ")
        self.assertEqual(update_payload.carrier, "FedEx Freight")

        bulk_payload = BulkOrderStatusUpdateRequest(
            vendor_id="00000000-0000-0000-0000-000000000001",
            from_status="ready",
            to_status="ordered",
            carrier="  DHL   Express  ",
            tracking_url="https://track.example/123",
        )
        self.assertEqual(bulk_payload.carrier, "DHL Express")


if __name__ == "__main__":
    unittest.main()
