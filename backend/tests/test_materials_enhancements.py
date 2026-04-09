import unittest
from io import BytesIO
from unittest.mock import patch

from fastapi import UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.materials import (
    create_material,
    create_material_attachment,
    delete_material_attachment,
    import_materials_csv,
    list_material_attachments,
    list_material_price_history,
    upload_material_attachment,
    update_material,
)
from app.db.base import Base
from app.models.models import AuditLog, User, Workspace
from app.schemas.schemas import MaterialAttachmentCreate, MaterialCreate, MaterialUpdate


class MaterialsEnhancementsTests(unittest.TestCase):
    def make_session(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        Base.metadata.create_all(bind=engine)
        return TestingSessionLocal()

    def _seed_user_and_workspace(self, db):
        user = User(email="owner@example.com", full_name="Owner", role="admin")
        db.add(user)
        db.flush()
        workspace = Workspace(name="Materials Workspace", created_by=user.id)
        db.add(workspace)
        db.commit()
        db.refresh(user)
        db.refresh(workspace)
        return user, workspace

    def test_material_price_history_records_create_and_unit_cost_updates(self):
        db = self.make_session()
        try:
            user, workspace = self._seed_user_and_workspace(db)

            created = create_material(
                MaterialCreate(
                    name="Cedar Board",
                    category="Lumber",
                    unit_type="each",
                    unit_cost=8.75,
                    sku="CED-BOARD-01",
                    default_waste_pct=2,
                    is_taxable=True,
                ),
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )

            updated = update_material(
                material_id=created.id,
                material=MaterialUpdate(unit_cost=9.25),
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )
            self.assertEqual(float(updated.unit_cost), 9.25)

            history = list_material_price_history(
                material_id=created.id,
                limit=10,
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )

            self.assertEqual(len(history), 2)
            latest_prices = sorted(float(entry.new_unit_cost) for entry in history)
            self.assertEqual(latest_prices, [8.75, 9.25])

            update_entries = [
                entry for entry in history
                if entry.previous_unit_cost is not None and float(entry.previous_unit_cost) == 8.75
            ]
            self.assertEqual(len(update_entries), 1)
            self.assertEqual(float(update_entries[0].new_unit_cost), 9.25)
            self.assertEqual(update_entries[0].source, "manual")

            create_event = (
                db.query(AuditLog)
                .filter(AuditLog.action == "materials.created", AuditLog.resource_id == str(created.id))
                .first()
            )
            self.assertIsNotNone(create_event)
        finally:
            db.close()

    def test_material_attachments_are_added_listed_and_removed(self):
        db = self.make_session()
        try:
            user, workspace = self._seed_user_and_workspace(db)

            created = create_material(
                MaterialCreate(
                    name="Concrete Mix",
                    category="Concrete",
                    unit_type="bag",
                    unit_cost=6.5,
                    sku="CON-MIX-80",
                    default_waste_pct=0,
                    is_taxable=True,
                ),
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )

            added = create_material_attachment(
                material_id=created.id,
                payload=MaterialAttachmentCreate(
                    name="Product datasheet",
                    url="https://example.com/concrete-datasheet.pdf",
                    mime_type="application/pdf",
                    size_bytes=125000,
                ),
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )
            self.assertEqual(added.name, "Product datasheet")

            current = list_material_attachments(
                material_id=created.id,
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )
            self.assertEqual(len(current), 1)
            self.assertEqual(current[0].id, added.id)

            delete_material_attachment(
                material_id=created.id,
                attachment_id=added.id,
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )

            after_delete = list_material_attachments(
                material_id=created.id,
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )
            self.assertEqual(after_delete, [])
        finally:
            db.close()

    def test_csv_import_creates_and_updates_materials(self):
        db = self.make_session()
        try:
            user, workspace = self._seed_user_and_workspace(db)

            create_material(
                MaterialCreate(
                    name="Base Stud",
                    category="Lumber",
                    unit_type="each",
                    unit_cost=4.25,
                    sku="SKU-100",
                    default_waste_pct=3,
                    is_taxable=True,
                ),
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )

            csv_data = (
                "name,category,unit_type,unit_cost,sku,default_waste_pct,is_taxable\n"
                "Base Stud,Lumber,each,5.10,SKU-100,3,true\n"
                "Primer,Paint,gal,22.00,SKU-200,0,true\n"
            ).encode("utf-8")
            upload = UploadFile(filename="materials.csv", file=BytesIO(csv_data))

            result = import_materials_csv(
                file=upload,
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )

            self.assertEqual(result.created, 1)
            self.assertEqual(result.updated, 1)
            self.assertEqual(result.skipped, 0)

            imported = db.query(AuditLog).filter(AuditLog.action == "materials.imported").all()
            self.assertEqual(len(imported), 2)
        finally:
            db.close()

    @patch("app.api.materials._upload_file_to_supabase_storage")
    @patch("app.api.materials._delete_file_from_supabase_storage")
    def test_file_upload_attachment_uses_storage_and_cleanup_on_delete(self, mock_storage_delete, mock_storage_upload):
        mock_storage_upload.return_value = "https://storage.example/materials/file.pdf"

        db = self.make_session()
        try:
            user, workspace = self._seed_user_and_workspace(db)

            created = create_material(
                MaterialCreate(
                    name="Gypsum Board",
                    category="Drywall",
                    unit_type="sheet",
                    unit_cost=13.25,
                    sku="GYPSUM-01",
                    default_waste_pct=5,
                    is_taxable=True,
                ),
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )

            upload = UploadFile(
                filename="datasheet.pdf",
                file=BytesIO(b"%PDF-1.5 test"),
            )

            attachment = upload_material_attachment(
                material_id=created.id,
                file=upload,
                name="Gypsum datasheet",
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )

            self.assertEqual(attachment.name, "Gypsum datasheet")
            self.assertEqual(attachment.url, "https://storage.example/materials/file.pdf")
            self.assertTrue(mock_storage_upload.called)

            delete_material_attachment(
                material_id=created.id,
                attachment_id=attachment.id,
                db=db,
                current_user=user,
                current_workspace_id=workspace.id,
            )
            self.assertTrue(mock_storage_delete.called)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
