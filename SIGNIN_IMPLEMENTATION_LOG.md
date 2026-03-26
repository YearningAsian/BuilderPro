# Builder Pro Sign-In Implementation Log

Date: 2026-03-26

## Scope Completed
Implemented a full Builder Pro sign-in UX with responsive two-panel layout, validation, submit states, auth-route shell behavior, and supporting account links.

## Files Changed
- frontend/src/components/AppShell.tsx
- frontend/app/layout.tsx
- frontend/app/signin/page.tsx
- frontend/app/signup/page.tsx
- frontend/app/forgot-password/page.tsx

## Functional Behavior Added
- Desktop two-panel sign-in layout with Builder Pro context and feature list.
- Mobile stacked layout.
- Sign-in card content order:
  1) Welcome back
  2) Subtitle
  3) Email
  4) Password
  5) Forgot password
  6) Sign In button
  7) Divider
  8) Create account prompt
- Inline validation messages:
  - Email required / invalid format.
  - Password required.
- Submit UX:
  - Disabled submit while invalid or submitting.
  - Loading state with spinner and "Signing in..." label.
- Password visibility toggle.
- Keyboard-friendly form submit with Enter.
- Accessible labels and error bindings (`aria-invalid`, `aria-describedby`).
- Clear server-style error messages:
  - Invalid email/password.
  - Account disabled.
- Remember session handling:
  - `localStorage` when "Remember me" is checked.
  - `sessionStorage` otherwise.
- Role-based redirect after successful sign-in:
  - admin -> `/`
  - user -> `/projects`

## Supporting Routes
- `/signup` route added with account-request guidance and navigation back to sign in.
- `/forgot-password` route added with support guidance and navigation back to sign in.

## App Shell Behavior
- Navigation shell is hidden for auth routes:
  - `/signin`
  - `/signup`
  - `/forgot-password`
- Navigation remains unchanged for main application routes.

## Build Verification
- Ran `npm run build` in `frontend`.
- Build completed successfully.
- Auth routes present in generated route map:
  - `/signin`
  - `/signup`
  - `/forgot-password`

## Notes
- Current sign-in request logic uses deterministic local behavior suitable for prototype UX and flow testing while backend auth endpoints are pending.
- This implementation keeps the UI simple and does not expose role selection in the sign-in form.

---

## 2026-03-26 (Update) — Real Auth Wiring + First-Load Sign-In Gate

### Additional Files Changed
- backend/app/api/auth.py
- backend/app/main.py
- frontend/app/signin/page.tsx
- frontend/middleware.ts

### Backend Auth Flow Implemented
- Added `POST /api/auth/signin` endpoint.
- Endpoint calls Supabase Auth password grant:
  - `POST {SUPABASE_URL}/auth/v1/token?grant_type=password`
  - Uses backend env values `SUPABASE_URL` + `SUPABASE_KEY`.
- On success:
  - returns `access_token`, `token_type`, `email`.
  - resolves Builder Pro role from local `users` table (`admin`/`user`) by email.
  - defaults role to `user` if no row exists.
- On invalid credentials:
  - returns HTTP 401 with clear error details.

### Frontend Sign-In Flow Updated
- Replaced mock sign-in logic with real call to `/api/auth/signin`.
- Stores authenticated session payload in:
  - `localStorage` when "Remember me" checked
  - `sessionStorage` otherwise
- Stores guard cookies used for route gating:
  - `builderpro_auth=1`
  - `builderpro_role=admin|user`
- Redirect behavior after login:
  - Uses `next` query param when present.
  - Otherwise role-based default:
    - admin -> `/`
    - user -> `/projects`

### First-Load App Entry Behavior (Requested)
- Added global route guard in `frontend/middleware.ts`:
  - If unauthenticated and trying to open any app route (including `/`), redirect to `/signin`.
  - If authenticated user opens auth pages (`/signin`, `/signup`, `/forgot-password`), redirect to role destination.
- Result: app now lands on sign-in first unless an auth cookie is present.

### Verification (Update)
- Backend syntax/import check passed:
  - `python -m compileall app`
- Frontend build passed:
  - `npm run build`
- Runtime endpoint check passed:
  - `POST /api/auth/signin` with invalid credentials returns 401 with clear message (`Invalid login credentials`).

### Operational Notes
- Next.js 16 logs a deprecation warning that `middleware.ts` will transition to `proxy.ts` naming in future versions; current implementation still functions and builds successfully.

---

## 2026-03-26 (Update) — Real Account Creation + Admin Signup Path

### Why this update
- Signup previously did not create accounts and could not create admin users.

### Backend additions
- Added secure signup endpoint: `POST /api/auth/signup` in `backend/app/api/auth.py`.
- Signup endpoint now:
  - creates user in Supabase Auth using `/auth/v1/signup`
  - upserts user record into Builder Pro `users` table with role
  - defaults new users to role `user`
  - supports admin account creation only when a valid admin setup code is provided

### Admin account creation control
- Added environment variable in `backend/app/core/config.py`:
  - `ADMIN_SETUP_CODE`
- Added variable to template in `backend/.env.example`.
- Admin signup behavior:
  - if `create_as_admin` is false -> role is `user`
  - if `create_as_admin` is true and code matches `ADMIN_SETUP_CODE` -> role is `admin`
  - if admin code is missing/invalid -> request is rejected with clear error

### Frontend signup page replacement
- Replaced placeholder `/signup` page with functional form in `frontend/app/signup/page.tsx`.
- Fields implemented:
  - full name
  - email
  - password
  - confirm password
  - optional admin account toggle + admin setup code field
- UX behavior:
  - inline validation messages
  - disabled submit while invalid/submitting
  - clear server error messages
  - success states for account created / email confirmation required

### Validation and build status
- Backend compile check passed: `python -m compileall app`
- Frontend build passed: `npm run build`

---

## 2026-03-26 (Update) — Company Admin Signup + Invite-Only User Access (Real-World Flow)

### Flow implemented
- **Admin signup flow** (public):
  - user enters full name, company name, work email, password
  - system creates auth account in Supabase Auth
  - system creates Builder Pro user profile with role `admin`
  - system creates a workspace/company
  - system links admin as workspace member (`admin`)
  - system redirects to admin dashboard (`/`) when session token is returned
- **User access flow** (invite-only):
  - staff use `Have an invite?` -> `/join-invite`
  - no public role selector on signup
  - staff join existing workspace using invite token + account details
  - system creates auth account and links staff as workspace member (`user`)

### Backend updates
- Replaced old signup pattern with new endpoints in `backend/app/api/auth.py`:
  - `POST /api/auth/signup-company`
  - `POST /api/auth/invites`
  - `POST /api/auth/join-invite`
  - `POST /api/auth/signin` now returns workspace context (`workspace_id`, `workspace_name`) when available
- Added Supabase token-based inviter identity lookup for invite creation.
- Added role enforcement for invite creation (`admin` membership required).

### Data model and migration updates
- Added SQLAlchemy models in `backend/app/models/models.py`:
  - `Workspace`
  - `WorkspaceMember`
  - `WorkspaceInvite`
- Added migration file:
  - `supabase/migrations/20260326010000_add_workspaces_and_invites.sql`
- Migration creates tables + indexes for workspace membership and invite workflows.

### Frontend updates
- Updated `/signup` page (`frontend/app/signup/page.tsx`) to company-admin onboarding fields:
  - full name
  - company name
  - work email
  - password/confirm
- Added `/join-invite` page (`frontend/app/join-invite/page.tsx`) for invite-based workspace join.
- Updated `/signin` page copy/links to match flow:
  - `Create workspace`
  - `Have an invite? Join workspace`
- Updated auth route handling to include `/join-invite`:
  - `frontend/middleware.ts`
  - `frontend/src/components/AppShell.tsx`

### Validation (this update)
- Backend compile check passed: `python -m compileall app`
- Frontend build passed: `npm run build`
- Runtime endpoint smoke checks passed (422 validation responses confirmed endpoints are mounted):
  - `POST /api/auth/signup-company`
  - `POST /api/auth/join-invite`

### Notes
- This update supersedes the prior `ADMIN_SETUP_CODE`-based admin-creation approach.
- Deprecated `middleware.ts` naming warning from Next.js remains non-blocking (functionality/build are successful).
