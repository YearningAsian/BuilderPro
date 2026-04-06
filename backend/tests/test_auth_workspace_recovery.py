import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.auth import _membership_role_for_session, _register_supabase_user_with_session
from app.db.base import Base
from app.models.models import User, Workspace, WorkspaceMember


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


if __name__ == "__main__":
    unittest.main()
