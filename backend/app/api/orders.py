# orders.py — intentionally minimal
#
# Line item management (add, update, delete, list) lives under:
#   /api/projects/{project_id}/items
#
# This file previously duplicated that logic with an inconsistent flat
# /orders endpoint. It has been removed to avoid conflicts.
# If purchase-order tracking is added in a future sprint, it belongs here.

from fastapi import APIRouter

router = APIRouter(prefix="/orders", tags=["orders"])