# CampusCert Pro — Product Requirements Document

## Original Problem Statement
> Build a Complete Website with proper industry standards.
> Tech stack: HTML/CSS/JS (EJS view engine) frontend, Node.js/Express backend, MongoDB DB.
> Feature: **Certificate Design StudioVisual** — Drag-and-Drop Editor, Custom Template Upload, Dynamic Field Types (Recipient Name, Organisation, Rank, Link, QR), Typography Controls, Live Preview Mode, Edit Existing Templates.

## Architecture
- **Frontend**: React + Tailwind CSS (kept as-is from prior session — user was informed EJS would be an option, no objection).
- **Backend**: Node.js + Express + `mongodb` native driver (migrated from FastAPI).
- **DB**: MongoDB (local; DB name `cert_management_db`).
- **PDF**: PDFKit renders certificates with support for both classic layout and custom drag-and-drop templates (background image, colors, per-field font/size/weight/color, embedded QR).
- **Supervisor**: `node server.js` for backend, `yarn start` for frontend.

## User Personas
- **Admin / Faculty Coordinator** — creates events, designs certificate templates, bulk-generates certificates.
- **Recipient** — receives certificate with unique ID and QR-verifiable URL.
- **Verifier** (employer, institution) — validates certificate via public Verify Portal.

## Core Requirements (Static)
1. Event catalog (create, list, delete).
2. Certificate template library with visual editor.
3. Bulk certificate generation from a plaintext participants list.
4. Repository with search, filter, preview, PDF download, email dispatch, revocation.
5. Public verification portal (search by cert ID).
6. Live analytics on dashboard (totals, breakdown by category).

## What's Been Implemented (Jan 2026)
### Backend (`/app/backend/server.js`)
- `GET/POST/DELETE /api/events`
- `GET/POST/PUT/DELETE /api/templates` — full CRUD backing the Design Studio
- `GET /api/certificates`, `POST /api/certificates`, `POST /api/certificates/generate-bulk`, `GET /api/certificates/:cert_id`, `DELETE` (revoke), `POST /api/certificates/:cert_id/send-email`
- `GET /api/certificates/:cert_id/download-pdf` — renders classic layout OR custom template (background, colors, positioned fields, QR embed)
- `GET /api/analytics` — totals + category breakdown
- Fixed prior bug: `templatesCol.count_documents()` → `countDocuments()`
- Auto-seeds two templates and one event on empty DB

### Frontend (`/app/frontend/src/App.js` + `DesignStudio.jsx`)
- Dashboard with animated hero, stat cards, recent certificates, active events
- Events CRUD tab
- Bulk Generator (name/email/role/grade CSV) with instant QR code + unique cert IDs
- Repository with search, event filter, preview modal, PDF download, email send, revoke
- Verification Portal (public-facing cert ID lookup)
- **Certificate Design Studio** (new):
  - Live drag-and-drop canvas (792×560 design space, responsive)
  - 9 field types: recipient name, organization, rank, event title, issue date, cert ID, verification link, QR code, custom static text
  - Typography controls: font family, size (slider 8-72), bold, italic, color picker
  - Template metadata: name, primary/accent color, border style (solid/double/dashed/ridge/none), issuer name+title
  - Background image upload (file → base64 dataURL, ≤4MB) with clear
  - Live Preview toggle (disables drag & selection outlines)
  - Load existing templates for editing, Save/Update, Save-as-Copy, Delete
  - Right-hand inspector panel with X/Y coordinates, duplicate, delete
  - Callback to parent App refreshes Bulk Generator template list on save/delete

## Testing Status
- Automated tests: `/app/backend/tests/test_backend.py` (pytest, 13/13 pass)
- Testing agent iteration 1: 100% backend, 100% frontend

## Prioritized Backlog (P0/P1/P2)
- **P1** — Real Email delivery: SendGrid/Resend integration so `email_status='sent'` actually dispatches the PDF.
- **P1** — Multi-tenant + Admin Auth: JWT admin login + organizationId scoping across bulk_jobs, templates, certificates.
- **P2** — Redis + BullMQ: replace in-process worker for multi-instance scaling.
- **P2** — Bulk import row-level inline editor: fix invalid rows without re-uploading.
- **P2** — Digital signature: signed cert hash + PKI trust chain.
- **P2** — Public verify page as its own shareable URL (`/v/:cert_id`) with LinkedIn share OG tags.
- **P2** — Signature image field in Design Studio (upload PNG signature).
- **P2** — Undo/redo stack in Design Studio.
- **P2** — Template categories/folders + tag filtering.

## Recent Milestones
- **Jan 2026 (session 4)** — Shipped **JWT Authentication + Multi-Org RBAC**. Register/login/logout/logout-all, 15-min access + 7-day refresh tokens with rotation & reuse-detection, HttpOnly+Secure+SameSite=None cookies, bcrypt 12 rounds, MongoDB sessions with TTL, email verification + password reset (DEV MODE — links surfaced in API responses; wire SendGrid via .env for production), change-password (revokes other sessions), brute-force lockout (5 fails → 15 min), rate limits on login/register/forgot, `authenticateUser → resolveOrganization → requireOrganizationMember → requirePermission` middleware chain, role-based permissions (super_admin/admin/editor/viewer), Organizations + OrganizationMemberships + Sessions + EmailVerificationTokens + PasswordResetTokens + AuditLogs models, /api/auth/members + role management, /api/auth/audit-logs. Frontend: AuthProvider with silent-refresh axios interceptor, Login/Register/Forgot/Reset/Verify pages, UserMenu dropdown, Sessions panel, org switcher. First registered user auto-becomes super_admin of default org. Testing agent: 33/33 backend + 100% frontend.
- **Jan 2026 (session 3)** — Smart Bulk Certificate Generation module (27/27 tests passed).
- **Jan 2026 (session 2)** — Certificate Design Studio.
- **Jan 2026 (session 1)** — Backend migrated FastAPI → Node.js/Express.

## Prioritized Backlog (P0/P1/P2)
