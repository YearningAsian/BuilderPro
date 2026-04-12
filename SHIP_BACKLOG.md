# BuilderPro Shipping Backlog

Date: 2026-04-12
Owner: Product + Engineering
Scope horizon: 6 to 8 weeks

## 1) Scope Lock

In scope for this shipping cycle:
- Auth and session hardening
- Invite and workspace admin UX upgrades
- Orders approval and delivery reliability
- Materials intelligence v1

Out of scope for this cycle:
- Full multi-role RBAC matrix (estimator, PM, purchasing)
- External client portal
- Advanced ML models

## 2) Release Train

- Release A (Week 1-2): Auth and workspace access hardening
- Release B (Week 3-4): Invite admin and onboarding acceleration
- Release C (Week 5-6): Orders approval and exception workflow
- Release D (Week 7-8): Materials intelligence and risk indicators

## 3) Backlog by Priority

### Epic A: Auth and Session Hardening (P0)

Goal:
- Make auth behavior production-safe with deterministic session boundaries and clear failure handling.

User stories:
- As an authenticated user, I want expired sessions handled gracefully so I can re-authenticate without data corruption.
- As an admin, I want unauthorized workspace switching blocked so tenant data remains isolated.
- As a security-conscious customer, I want reliable signout semantics across tabs/devices.

Tasks:
- Backend:
  - Add consistent token validation helper and centralized auth error mapping.
  - Add endpoint-level checks for workspace membership on sensitive workspace-scoped reads/writes.
  - Add audit events for signin/signout/workspace-switch.
- Frontend:
  - Add session refresh strategy and deterministic signout fallback behavior.
  - Add auth error boundaries and user-facing recovery prompts.
  - Tighten route guarding behavior for stale auth cookies.
- Tests:
  - Add auth regression test matrix for signin, signout, forgot/reset, workspace list, workspace switch.
  - Add negative tests for unauthorized workspace access.

Acceptance criteria:
- Invalid/expired token path returns consistent 401 contract everywhere.
- Unauthorized workspace access returns 403 and never leaks cross-workspace data.
- Signout clears local and session state deterministically.
- All auth tests pass.

Definition of done:
- Backend tests green
- Frontend lint and build green
- Manual auth smoke checks pass in staging

---

### Epic B: Invite and Workspace Admin UX (P1)

Goal:
- Reduce onboarding friction and improve team management confidence.

User stories:
- As an admin, I want to resend and revoke invites quickly so I can unblock teammates.
- As an invitee, I want clear expired-token guidance so I know what to do next.
- As a workspace owner, I want visibility into pending and accepted invites.

Tasks:
- Backend:
  - Add explicit invite status model in responses (pending, expired, revoked, accepted).
  - Ensure resend updates expiry/token and logs audit event.
- Frontend:
  - Add invite table with status badges, expiry warnings, and action confirmations.
  - Add join-invite error states for expired/invalid tokens with clear recovery actions.
- Tests:
  - Add API tests for resend/revoke/expired behavior.
  - Add E2E flow for admin invite -> user join path.

Acceptance criteria:
- Admin can create, resend, revoke invite and see accurate status transitions.
- Invitee sees meaningful error and recovery path for invalid/expired token.
- Audit trail records invite lifecycle events.

Definition of done:
- Invite API tests green
- Join-invite happy and failure paths covered

---

### Epic C: Orders Approval and Delivery Reliability (P1)

Goal:
- Increase operational trust in purchasing workflows.

User stories:
- As an admin, I want approval thresholds so large purchases require a second check.
- As a user, I want overdue and partial delivery states surfaced automatically.
- As a team, we want vendor status updates reflected consistently.

Tasks:
- Backend:
  - Introduce approval state machine for purchase orders (draft, submitted, approved, rejected, ordered, partially_delivered, delivered).
  - Enforce transition rules and actor permissions.
  - Add overdue detection and exception markers.
- Frontend:
  - Add approval UI actions, transition timeline, and exception badges.
  - Add filter chips for blocked/overdue/partial deliveries.
- Tests:
  - Add workflow tests for status transitions and permission checks.
  - Add E2E for approve -> order -> partial -> delivered.

Acceptance criteria:
- Invalid status transitions are blocked with clear errors.
- Approved orders progress through delivery states without data drift.
- Overdue/partial states visible in list and detail views.

Definition of done:
- Orders workflow tests green
- E2E scenario green on staging

---

### Epic D: Materials Intelligence v1 (P2)

Goal:
- Improve estimate quality and purchasing decisions.

User stories:
- As an estimator, I want price volatility flags so I can avoid risky quotes.
- As a buyer, I want preferred vendor suggestions for each material.
- As a manager, I want trend visibility to forecast cost changes.

Tasks:
- Backend:
  - Add computed volatility indicators from material price history.
  - Add preferred vendor recommendation heuristic (cost + recency).
- Frontend:
  - Add volatility badges and trend sparkline on materials list/detail.
  - Add recommendation panel in material detail.
- Tests:
  - Add unit tests for volatility and recommendation logic.
  - Add UI tests for indicator rendering and empty states.

Acceptance criteria:
- Materials with unstable pricing are flagged correctly.
- Recommendation appears when enough data exists and degrades safely otherwise.

Definition of done:
- Intelligence calculations tested and stable
- UI behavior validated for edge cases

## 4) Sprint Plan (Suggested)

Sprint 1:
- Epic A: all tasks complete
- Epic B: backend status model + resend/revoke stability

Sprint 2:
- Epic B: frontend completion + E2E
- Epic C: state machine + transition APIs

Sprint 3:
- Epic C: frontend workflow + E2E
- Epic D: backend calculations + initial UI indicators

Sprint 4:
- Epic D: polish + test hardening
- Stabilization and release hardening

## 5) Quality Gates per Release

Required gates before each release:
- Backend:
  - Unit/integration tests pass
  - Compile/import checks pass
- Frontend:
  - Lint passes
  - Production build passes
- End-to-end:
  - Critical path smoke tests pass
- Security:
  - Tenant isolation spot checks pass
  - Auth error behavior consistent

Hard stop gates:
- Any failing tests in touched auth/orders/materials domains
- Any production build failure
- Any P1 security or tenant isolation regression

## 6) Risk Register

Top risks:
- Session boundary ambiguity between frontend cookie presence and backend token validity
- Invite lifecycle regressions during resend/revoke updates
- Orders state transition complexity causing invalid edge transitions

Mitigations:
- Add explicit regression tests for each risk area
- Use narrow rollout and monitor auth/orders error rates
- Add rollback trigger thresholds for failed critical flows

## 7) Go/No-Go Checklist

Go only if all are true:
- All mandatory quality gates pass
- No open P1 defects
- Rollback plan and owner confirmed
- Staging signoff from product + engineering

No-Go if any are true:
- Auth or tenant isolation behavior uncertain
- Critical workflow path lacks test evidence
- Build or migration readiness incomplete

## 8) Immediate Next Actions (This Week)

1. Fix current failing quality gates:
- Backend failing auth tests
- Frontend type error blocking build

2. Start Epic A implementation branch and complete acceptance criteria.

3. Run full quality gates and issue Release A go/no-go decision.
