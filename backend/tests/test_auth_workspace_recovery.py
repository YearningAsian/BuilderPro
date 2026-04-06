import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.auth import (
    WorkspaceMemberUpdateRequest,
    _membership_role_for_session,
    _register_supabase_user_with_session,
    delete_workspace_member,
    list_audit_events,
    list_workspace_members,
    update_workspace_member,
)
from app.backfill_workspace_ids import backfill_workspace_ids
from app.api.customers import list_customers
from app.api.orders import list_orders, update_order
from app.api.projects import create_project, list_projects
from app.api.vendors import list_vendors
from app.db.base import Base
from app.models.models import AuditLog, Customer, Material, Project, ProjectItem, User, Vendor, Workspace, WorkspaceMember
from app.schemas.schemas import ProjectCreate, ProjectItemUpdate


class WorkspaceRecoveryTests(unittest.TestCase):
    def make_session(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        Base.metadata.create_all(bind=engine)
        return TestingSessionLocal()

    def test_legacy_admin_without_workspace_gets_default_workspace(self):
        db = self.make_session()
        try:
            user = User(email="owner@example.com", full_name="Jordan Owner", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)

            role, membership, session_repaired = _membership_role_for_session(db, user)
            db.commit()

            self.assertTrue(session_repaired)
            self.assertEqual(role, "admin")
            self.assertIsNotNone(membership)

            workspace = db.query(Workspace).filter(Workspace.id == membership.workspace_id).first()
            self.assertIsNotNone(workspace)
            self.assertEqual(workspace.created_by, user.id)
            self.assertEqual(workspace.name, "Jordan Owner Workspace")
        finally:
            db.close()

    def test_existing_admin_workspace_gets_backfilled_membership(self):
        db = self.make_session()
        try:
            user = User(email="admin@acme.com", full_name="Acme Admin", role="admin")
            db.add(user)
            db.flush()

            workspace = Workspace(name="Acme Builders", created_by=user.id)
            db.add(workspace)
            db.commit()
            db.refresh(user)
            db.refresh(workspace)

            role, membership, session_repaired = _membership_role_for_session(db, user)
            db.commit()

            self.assertTrue(session_repaired)
            self.assertEqual(role, "admin")
            self.assertIsNotNone(membership)
            self.assertEqual(membership.workspace_id, workspace.id)
            self.assertEqual(membership.role, "admin")
            self.assertEqual(db.query(WorkspaceMember).count(), 1)
        finally:
            db.close()

    @patch("app.api.auth._supabase_request")
    def test_register_supabase_user_with_session_returns_token_without_confirmation(self, mock_supabase_request):
        mock_supabase_request.side_effect = [
            {"id": "supabase-user"},
            {"access_token": "session-token", "token_type": "bearer"},
        ]

        access_token, token_type, requires_email_confirmation = _register_supabase_user_with_session(
            email="owner@example.com",
            password="StrongPass123",
            full_name="Owner Admin",
        )

        self.assertEqual(access_token, "session-token")
        self.assertEqual(token_type, "bearer")
        self.assertFalse(requires_email_confirmation)
        self.assertEqual(mock_supabase_request.call_args_list[0].args[1], "/auth/v1/admin/users")

    @patch("app.api.auth._supabase_request")
    def test_register_supabase_user_with_session_prefers_service_role_key_for_admin_create(self, mock_supabase_request):
        mock_supabase_request.side_effect = [
            {"id": "supabase-user"},
            {"access_token": "session-token", "token_type": "bearer"},
        ]

        with patch("app.api.auth.SUPABASE_ADMIN_KEY", "service-role-key", create=True):
            access_token, token_type, requires_email_confirmation = _register_supabase_user_with_session(
                email="owner@example.com",
                password="StrongPass123",
                full_name="Owner Admin",
            )

        self.assertEqual(access_token, "session-token")
        self.assertEqual(token_type, "bearer")
        self.assertFalse(requires_email_confirmation)
        self.assertEqual(mock_supabase_request.call_args_list[0].kwargs.get("api_key"), "service-role-key")

    @patch("app.api.auth._supabase_request")
    def test_register_supabase_user_with_session_falls_back_when_confirmation_is_still_required(self, mock_supabase_request):
        mock_supabase_request.side_effect = [
            HTTPException(status_code=403, detail="Admin create not available"),
            {"user": {"id": "supabase-user"}},
            HTTPException(status_code=400, detail="Email not confirmed"),
        ]

        access_token, token_type, requires_email_confirmation = _register_supabase_user_with_session(
            email="owner@example.com",
            password="StrongPass123",
            full_name="Owner Admin",
        )

        self.assertIsNone(access_token)
        self.assertEqual(token_type, "bearer")
        self.assertTrue(requires_email_confirmation)

    @patch("app.api.auth._supabase_request")
    def test_register_supabase_user_with_session_returns_local_dev_token_when_rate_limited(self, mock_supabase_request):
        mock_supabase_request.side_effect = [
            HTTPException(status_code=429, detail="Too Many Requests"),
        ]

        access_token, token_type, requires_email_confirmation = _register_supabase_user_with_session(
            email="owner@example.com",
            password="StrongPass123",
            full_name="Owner Admin",
        )

        self.assertIsNotNone(access_token)
        self.assertTrue(access_token.startswith("dev."))
        self.assertEqual(token_type, "bearer")
        self.assertFalse(requires_email_confirmation)

    def test_list_projects_only_returns_current_workspace_projects(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            teammate = User(email="teammate@example.com", full_name="Teammate", role="user")
            outsider = User(email="outside@example.com", full_name="Outside", role="admin")
            workspace_a = Workspace(name="Workspace A")
            workspace_b = Workspace(name="Workspace B")
            db.add_all([owner, teammate, outsider, workspace_a, workspace_b])
            db.flush()

            customer_a = Customer(name="Acme Customer", workspace_id=workspace_a.id)
            customer_b = Customer(name="Other Customer", workspace_id=workspace_b.id)
            db.add_all([customer_a, customer_b])
            db.flush()

            db.add_all([
                WorkspaceMember(workspace_id=workspace_a.id, user_id=owner.id, role="admin"),
                WorkspaceMember(workspace_id=workspace_a.id, user_id=teammate.id, role="user"),
                WorkspaceMember(workspace_id=workspace_b.id, user_id=outsider.id, role="admin"),
            ])
            db.flush()

            teammate_project = Project(
                name="Team Project",
                customer_id=customer_a.id,
                created_by=teammate.id,
                workspace_id=workspace_a.id,
            )
            outside_project = Project(
                name="Outside Project",
                customer_id=customer_b.id,
                created_by=outsider.id,
                workspace_id=workspace_b.id,
            )
            db.add_all([teammate_project, outside_project])
            db.commit()
            db.refresh(owner)

            projects = list_projects(
                skip=0,
                limit=100,
                db=db,
                current_user=owner,
                current_workspace_id=workspace_a.id,
            )

            self.assertEqual(len(projects), 1)
            self.assertEqual(projects[0].id, teammate_project.id)
        finally:
            db.close()

    def test_create_project_assigns_signed_in_user_as_owner_and_workspace(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            workspace = Workspace(name="Owner Workspace")
            db.add_all([owner, workspace])
            db.flush()

            customer = Customer(name="Acme Customer", workspace_id=workspace.id)
            db.add(customer)
            db.flush()
            db.add(WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin"))
            db.commit()
            db.refresh(owner)
            db.refresh(customer)

            created = create_project(
                ProjectCreate(name="New Build", customer_id=customer.id),
                db=db,
                current_user=owner,
                current_workspace_id=workspace.id,
            )

            self.assertEqual(created.created_by, owner.id)
            self.assertEqual(created.workspace_id, workspace.id)
        finally:
            db.close()

    def test_list_orders_only_returns_current_workspace_project_items(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            teammate = User(email="teammate@example.com", full_name="Teammate", role="user")
            outsider = User(email="outside@example.com", full_name="Outside", role="admin")
            workspace_a = Workspace(name="Orders Workspace A")
            workspace_b = Workspace(name="Orders Workspace B")
            db.add_all([owner, teammate, outsider, workspace_a, workspace_b])
            db.flush()

            customer_a = Customer(name="Acme Customer", workspace_id=workspace_a.id)
            customer_b = Customer(name="Other Customer", workspace_id=workspace_b.id)
            material_a = Material(name="2x4", unit_type="ea", unit_cost=5, default_waste_pct=0, workspace_id=workspace_a.id)
            material_b = Material(name="Concrete", unit_type="bag", unit_cost=7, default_waste_pct=0, workspace_id=workspace_b.id)
            db.add_all([customer_a, customer_b, material_a, material_b])
            db.flush()

            db.add_all([
                WorkspaceMember(workspace_id=workspace_a.id, user_id=owner.id, role="admin"),
                WorkspaceMember(workspace_id=workspace_a.id, user_id=teammate.id, role="user"),
                WorkspaceMember(workspace_id=workspace_b.id, user_id=outsider.id, role="admin"),
            ])
            db.flush()

            team_project = Project(name="Team Project", customer_id=customer_a.id, created_by=teammate.id, workspace_id=workspace_a.id)
            outside_project = Project(name="Outside Project", customer_id=customer_b.id, created_by=outsider.id, workspace_id=workspace_b.id)
            db.add_all([team_project, outside_project])
            db.flush()

            team_item = ProjectItem(
                project_id=team_project.id,
                material_id=material_a.id,
                quantity=1,
                unit_type="ea",
                unit_cost=5,
                waste_pct=0,
                total_qty=1,
                line_subtotal=5,
                workspace_id=workspace_a.id,
            )
            outside_item = ProjectItem(
                project_id=outside_project.id,
                material_id=material_b.id,
                quantity=2,
                unit_type="bag",
                unit_cost=7,
                waste_pct=0,
                total_qty=2,
                line_subtotal=14,
                workspace_id=workspace_b.id,
            )
            db.add_all([team_item, outside_item])
            db.commit()
            db.refresh(owner)

            items = list_orders(
                skip=0,
                limit=100,
                db=db,
                current_user=owner,
                current_workspace_id=workspace_a.id,
            )

            self.assertEqual(len(items), 1)
            self.assertEqual(items[0].id, team_item.id)
        finally:
            db.close()

    def test_customer_and_vendor_lists_only_return_current_workspace_rows(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            workspace_a = Workspace(name="Customer Workspace A")
            workspace_b = Workspace(name="Customer Workspace B")
            db.add_all([owner, workspace_a, workspace_b])
            db.flush()

            customer_a = Customer(name="Acme Customer", workspace_id=workspace_a.id)
            customer_b = Customer(name="Other Customer", workspace_id=workspace_b.id)
            vendor_a = Vendor(name="Best Supply", workspace_id=workspace_a.id)
            vendor_b = Vendor(name="Other Supply", workspace_id=workspace_b.id)
            db.add_all([customer_a, customer_b, vendor_a, vendor_b])
            db.flush()
            db.add(WorkspaceMember(workspace_id=workspace_a.id, user_id=owner.id, role="admin"))
            db.commit()
            db.refresh(owner)

            customers = list_customers(
                skip=0,
                limit=100,
                db=db,
                current_user=owner,
                current_workspace_id=workspace_a.id,
            )
            vendors = list_vendors(
                skip=0,
                limit=100,
                db=db,
                current_user=owner,
                current_workspace_id=workspace_a.id,
            )

            self.assertEqual(len(customers), 1)
            self.assertEqual(customers[0].name, "Acme Customer")
            self.assertEqual(len(vendors), 1)
            self.assertEqual(vendors[0].name, "Best Supply")
        finally:
            db.close()

    def test_update_order_can_change_order_status_in_workspace(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            workspace = Workspace(name="Orders Workspace")
            db.add_all([owner, workspace])
            db.flush()

            customer = Customer(name="Acme Customer", workspace_id=workspace.id)
            material = Material(name="2x4", unit_type="ea", unit_cost=5, default_waste_pct=0, workspace_id=workspace.id)
            db.add_all([customer, material])
            db.flush()

            db.add(WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin"))
            db.flush()

            project = Project(name="Team Project", customer_id=customer.id, created_by=owner.id, workspace_id=workspace.id)
            db.add(project)
            db.flush()

            item = ProjectItem(
                project_id=project.id,
                material_id=material.id,
                quantity=1,
                unit_type="ea",
                unit_cost=5,
                waste_pct=0,
                total_qty=1,
                line_subtotal=5,
                workspace_id=workspace.id,
            )
            db.add(item)
            db.commit()
            db.refresh(owner)

            updated = update_order(
                item_id=item.id,
                item=ProjectItemUpdate(
                    order_status="received",
                    po_number="PO-101",
                    purchase_notes="Vendor confirmed Friday delivery.",
                ),
                db=db,
                current_user=owner,
                current_workspace_id=workspace.id,
            )

            self.assertEqual(updated.order_status, "received")
            self.assertEqual(updated.po_number, "PO-101")
            self.assertEqual(updated.purchase_notes, "Vendor confirmed Friday delivery.")
            self.assertIsNotNone(updated.ordered_at)
            self.assertIsNotNone(updated.received_at)
            db.refresh(item)
            self.assertEqual(item.order_status, "received")
            self.assertEqual(item.po_number, "PO-101")
            self.assertEqual(item.purchase_notes, "Vendor confirmed Friday delivery.")
            self.assertIsNotNone(item.ordered_at)
            self.assertIsNotNone(item.received_at)
        finally:
            db.close()

    def test_core_business_models_expose_workspace_id_columns(self):
        for model in (Customer, Vendor, Material, Project, ProjectItem):
            self.assertTrue(hasattr(model, "workspace_id"), f"{model.__name__} missing workspace_id")

    def test_project_items_expose_order_status_with_default(self):
        self.assertTrue(hasattr(ProjectItem, "order_status"))
        self.assertEqual(getattr(ProjectItem.__table__.c.order_status.default, "arg", None), "draft")

    def test_core_workspace_id_columns_are_no_longer_nullable(self):
        for model in (Customer, Vendor, Material, Project, ProjectItem):
            self.assertFalse(model.__table__.c.workspace_id.nullable, f"{model.__name__}.workspace_id should be NOT NULL")

    def test_vendor_name_and_material_sku_are_workspace_scoped(self):
        vendor_unique_sets = {
            tuple(column.name for column in constraint.columns)
            for constraint in Vendor.__table__.constraints
            if constraint.__class__.__name__ == "UniqueConstraint"
        }
        material_unique_sets = {
            tuple(column.name for column in constraint.columns)
            for constraint in Material.__table__.constraints
            if constraint.__class__.__name__ == "UniqueConstraint"
        }

        self.assertFalse(bool(Vendor.__table__.c.name.unique))
        self.assertFalse(bool(Material.__table__.c.sku.unique))
        self.assertIn(("workspace_id", "name"), vendor_unique_sets)
        self.assertIn(("workspace_id", "sku"), material_unique_sets)

    def test_backfill_workspace_ids_populates_projects_and_items(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            workspace = Workspace(name="Owner Workspace")
            db.add_all([owner, workspace])
            db.flush()

            customer = Customer(name="Acme Customer", workspace_id=workspace.id)
            material = Material(name="2x4", unit_type="ea", unit_cost=5, default_waste_pct=0, workspace_id=workspace.id)
            db.add_all([customer, material])
            db.flush()

            membership = WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin")
            project = Project(
                name="Backfill Project",
                customer_id=customer.id,
                created_by=owner.id,
                workspace_id=workspace.id,
            )
            db.add_all([membership, project])
            db.flush()

            item = ProjectItem(
                project_id=project.id,
                material_id=material.id,
                quantity=1,
                unit_type="ea",
                unit_cost=5,
                waste_pct=0,
                total_qty=1,
                line_subtotal=5,
                workspace_id=workspace.id,
            )
            db.add(item)
            db.commit()

            summary = backfill_workspace_ids(db)
            db.refresh(project)
            db.refresh(item)

            self.assertEqual(project.workspace_id, workspace.id)
            self.assertEqual(item.workspace_id, workspace.id)
            self.assertEqual(summary["projects_updated"], 0)
            self.assertEqual(summary["project_items_updated"], 0)
        finally:
            db.close()

    def test_list_workspace_members_returns_current_workspace_members(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            teammate = User(email="worker@example.com", full_name="Worker", role="user")
            outsider = User(email="outsider@example.com", full_name="Outsider", role="user")
            workspace = Workspace(name="Crew Workspace", created_by=owner.id)
            other_workspace = Workspace(name="Other Workspace")
            db.add_all([owner, teammate, outsider, workspace, other_workspace])
            db.flush()

            owner_membership = WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin")
            teammate_membership = WorkspaceMember(workspace_id=workspace.id, user_id=teammate.id, role="user")
            db.add_all([
                owner_membership,
                teammate_membership,
                WorkspaceMember(workspace_id=other_workspace.id, user_id=outsider.id, role="user"),
            ])
            db.commit()

            members = list_workspace_members(db=db, current_user=owner, current_workspace_id=workspace.id)

            self.assertEqual(len(members), 2)
            self.assertEqual({member.email for member in members}, {"owner@example.com", "worker@example.com"})
            self.assertEqual({member.role for member in members}, {"admin", "user"})
        finally:
            db.close()

    def test_regular_user_cannot_list_workspace_members(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            teammate = User(email="worker@example.com", full_name="Worker", role="user")
            workspace = Workspace(name="Crew Workspace", created_by=owner.id)
            db.add_all([owner, teammate, workspace])
            db.flush()
            db.add_all([
                WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin"),
                WorkspaceMember(workspace_id=workspace.id, user_id=teammate.id, role="user"),
            ])
            db.commit()

            with self.assertRaises(HTTPException) as ctx:
                list_workspace_members(db=db, current_user=teammate, current_workspace_id=workspace.id)

            self.assertEqual(ctx.exception.status_code, 403)
        finally:
            db.close()

    def test_update_workspace_member_can_promote_user_to_admin(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            teammate = User(email="worker@example.com", full_name="Worker", role="user")
            workspace = Workspace(name="Crew Workspace", created_by=owner.id)
            db.add_all([owner, teammate, workspace])
            db.flush()

            owner_membership = WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin")
            teammate_membership = WorkspaceMember(workspace_id=workspace.id, user_id=teammate.id, role="user")
            db.add_all([owner_membership, teammate_membership])
            db.commit()

            updated = update_workspace_member(
                member_id=str(teammate_membership.id),
                payload=WorkspaceMemberUpdateRequest(role="admin"),
                db=db,
                current_user=owner,
                current_workspace_id=workspace.id,
            )

            self.assertEqual(updated.role, "admin")
            db.refresh(teammate_membership)
            self.assertEqual(teammate_membership.role, "admin")
        finally:
            db.close()

    def test_update_workspace_member_blocks_self_demotion(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            workspace = Workspace(name="Crew Workspace", created_by=owner.id)
            db.add_all([owner, workspace])
            db.flush()

            owner_membership = WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin")
            db.add(owner_membership)
            db.commit()

            with self.assertRaises(HTTPException) as ctx:
                update_workspace_member(
                    member_id=str(owner_membership.id),
                    payload=WorkspaceMemberUpdateRequest(role="user"),
                    db=db,
                    current_user=owner,
                    current_workspace_id=workspace.id,
                )

            self.assertEqual(ctx.exception.status_code, 400)
        finally:
            db.close()

    def test_delete_workspace_member_blocks_self_removal_but_removes_other_member(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            teammate = User(email="worker@example.com", full_name="Worker", role="user")
            workspace = Workspace(name="Crew Workspace", created_by=owner.id)
            db.add_all([owner, teammate, workspace])
            db.flush()

            owner_membership = WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin")
            teammate_membership = WorkspaceMember(workspace_id=workspace.id, user_id=teammate.id, role="user")
            db.add_all([owner_membership, teammate_membership])
            db.commit()

            with self.assertRaises(HTTPException) as ctx:
                delete_workspace_member(
                    member_id=str(owner_membership.id),
                    db=db,
                    current_user=owner,
                    current_workspace_id=workspace.id,
                )

            self.assertEqual(ctx.exception.status_code, 400)

            result = delete_workspace_member(
                member_id=str(teammate_membership.id),
                db=db,
                current_user=owner,
                current_workspace_id=workspace.id,
            )

            self.assertIsNone(result)
            self.assertIsNone(db.query(WorkspaceMember).filter(WorkspaceMember.id == teammate_membership.id).first())
        finally:
            db.close()

    def test_member_management_writes_audit_log_entries(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            teammate = User(email="worker@example.com", full_name="Worker", role="user")
            workspace = Workspace(name="Crew Workspace", created_by=owner.id)
            db.add_all([owner, teammate, workspace])
            db.flush()

            owner_membership = WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin")
            teammate_membership = WorkspaceMember(workspace_id=workspace.id, user_id=teammate.id, role="user")
            db.add_all([owner_membership, teammate_membership])
            db.commit()

            update_workspace_member(
                member_id=str(teammate_membership.id),
                payload=WorkspaceMemberUpdateRequest(role="admin"),
                db=db,
                current_user=owner,
                current_workspace_id=workspace.id,
            )
            delete_workspace_member(
                member_id=str(teammate_membership.id),
                db=db,
                current_user=owner,
                current_workspace_id=workspace.id,
            )

            events = db.query(AuditLog).filter(AuditLog.workspace_id == workspace.id).order_by(AuditLog.created_at.asc()).all()

            self.assertEqual(len(events), 2)
            self.assertEqual([event.action for event in events], ["member.role_updated", "member.removed"])
            self.assertTrue(all(event.user_id == owner.id for event in events))
        finally:
            db.close()

    def test_list_audit_events_returns_workspace_events_for_admin(self):
        db = self.make_session()
        try:
            owner = User(email="owner@example.com", full_name="Owner", role="admin")
            teammate = User(email="worker@example.com", full_name="Worker", role="user")
            workspace = Workspace(name="Crew Workspace", created_by=owner.id)
            other_workspace = Workspace(name="Other Workspace")
            db.add_all([owner, teammate, workspace, other_workspace])
            db.flush()

            db.add_all([
                WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin"),
                WorkspaceMember(workspace_id=workspace.id, user_id=teammate.id, role="user"),
            ])
            db.add_all([
                AuditLog(
                    workspace_id=workspace.id,
                    user_id=owner.id,
                    action="member.invited",
                    resource_type="workspace_invite",
                    resource_id=str(workspace.id),
                    details='{"email": "worker@example.com"}',
                ),
                AuditLog(
                    workspace_id=other_workspace.id,
                    user_id=owner.id,
                    action="workspace.updated",
                    resource_type="workspace",
                    resource_id=str(other_workspace.id),
                    details='{"field": "name"}',
                ),
            ])
            db.commit()

            events = list_audit_events(db=db, current_user=owner, current_workspace_id=workspace.id)

            self.assertEqual(len(events), 1)
            self.assertEqual(events[0].action, "member.invited")
            self.assertEqual(events[0].resource_type, "workspace_invite")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
