---
name: projects-estimates-production
description: 'Harden BuilderPro projects/estimates to production readiness. Use for templates, project duplication, estimate export/PDF, markup tracking, and verification with tests/lint.'
argument-hint: 'Which gap should be completed: templates, duplication, export-pdf, markup-tracking, or full-hardening?'
---

# Projects/Estimates Production Hardening

## When To Use
- Shipping work on Projects/estimates where MVP exists but production gaps remain.
- Implementing template creation and project duplication behavior.
- Adding estimate export flows (print-ready HTML/PDF).
- Adding markup visibility and pricing projections.
- Requiring workspace-safe behavior plus verification evidence.

## Workflow
1. Define feature slice:
- Confirm exact target from: templates, duplication, export/PDF, markup tracking.
- Keep scope to one feature area or one cohesive slice.

2. Audit current implementation:
- Inspect projects pages and project detail components.
- Inspect store/client API methods.
- Inspect backend project routes and schemas.
- Identify what exists, what is partial, and the smallest safe extension.

3. Design production-safe behavior:
- All reads/writes must be workspace-scoped.
- Duplication should preserve estimate structure but reset purchasing state.
- Export should produce deterministic print-ready output suitable for Save as PDF.
- Markup tracking should clearly separate cost subtotal, markup amount, tax, and projected sell total.

4. Implement backend first:
- Add explicit endpoints for duplication and estimate-document generation.
- Add audit-log events for each business action.
- Keep naming deterministic (e.g., copy suffix conflict handling).

5. Implement frontend integration:
- Add typed API client methods for new endpoints.
- Expose store actions where needed.
- Add UX controls in project list/detail to trigger duplication and export.
- Show clear loading/error feedback for user-triggered actions.

6. Add verification:
- Add backend tests for new endpoints and critical behavior.
- Verify workspace isolation assumptions in tests.
- Run backend tests and frontend lint/build checks.

7. Completion checks:
- Templates: user can create a metadata-only duplicate (no line items).
- Duplication: user can duplicate with line items and open the new project.
- Export/PDF: generated document includes line items and totals with markup/tax.
- Markup tracking: UI updates projected totals from user-entered markup percent.
- Evidence: tests/lint run and pass (or documented blockers).

## Decision Points
- If schema changes are required but migration scope is constrained: prefer additive API behavior and explicit tradeoff notes.
- If duplication should include purchase metadata: default to resetting procurement state unless explicitly requested otherwise.
- If browser popup is blocked for export: display actionable guidance and preserve generated output path.

## Output Contract
- Code changes limited to relevant frontend/backend project files.
- Test coverage for duplicate/export behavior.
- Summary of implemented behavior plus any residual risk.
