# CampusCert — Product Handoff and Production Audit

## Original Problem Statement

Add **Event Reports with Excel/CSV Export** to the existing **AI-Powered Certificate Generation and Verification System**. Select an event, view total/active/revoked certificate counts, and generate downloadable Excel `.xlsx` or CSV `.csv` containing only certificates related to that selected event. Reuse the existing architecture, MongoDB Native Driver, JWT authorization, Axios, XLSX and visual design. Support dynamic metadata, secure event access, correct filenames, empty/error/loading states and large events. Do not inspect the entire repository: use `CODEBASE_SUMMARY.md` first and inspect only feature-relevant files. Do not break certificate generation, bulk generation, templates, verification, revocation, PDFs, email, analytics or authentication. Provide a concise engineering report with files, API changes, functionality, security, tests, edge cases and remaining issues.

Add **Resend transactional email delivery** for two automated workflows: send generated certificate PDFs to student email addresses parsed from uploaded Excel/CSV data, and email both Excel and CSV event reports to active organization admins when an event is completed. Development uses the Resend sandbox sender with the display name **CampusCert Admin** and redirects intended recipients to the verified sandbox inbox. Production will use `admin@campuscert.com` only after its domain is verified.

User explicitly selected: **“Yes—reuse the existing admin and event-access rules (recommended).”** Additional direction: **“please follow the prompt instructions and use CODEBASE_SUMMARY.md first.”**

The supplied architectural summary was read via its attachment URL before repository investigation. Actual code is in `/app/AI_Powered_Certificate_Generation_And_Verification_System`, not `/app/backend` or `/app/frontend`.

## Architecture Decisions

- Preserve Node.js/Express, native MongoDB collections and React's existing tab architecture. Add `/#reports`, no router replacement or unrelated redesign.
- Generate files on the backend using its existing XLSX dependency; serialization runs in worker threads. Axios uses the existing global authentication/refresh interceptors.
- Actual relationship: `events.id` (UUID/seeded string) → `certificates.event_id`; also support selected event's native `_id` ObjectId/string representations. Never filter by event name.
- Reuse JWT + organization membership + read permissions, and require admin/super_admin membership. Bind new events to verified organizations. Old events lack ownership: exclude unassigned records, never guess/migrate owners automatically.
- Scoped report events endpoint is separate from the legacy globally listed events. Indexes: certificates `(event_id,cert_id)`; events `(organization_id,date)`.
- Excel: Event Summary and Certificate Details sheets. CSV: robust XLSX serialization + UTF-8 BOM, CRLF, quote escaping. Stable metadata paths,128 flattening columns and JSON remainder; formula-like values escaped.
- Limits:100,000 report records,32,767 chars/cell,2 active downloads/process,120s serialization and bounded worker heap. Explicit failures instead of silent truncation.
- Resend is centralized behind `utils/emailService.js`, with inline-CSS transactional templates, attachment size safeguards, serialized sends for provider rate limits and provider idempotency keys.
- Intended recipients remain stored on certificates/report deliveries while sandbox mode records the actual verified recipient separately. No API response exposes the Resend key.
- Event completion is an explicit admin action. A restart-safe polling scheduler claims queued report deliveries, builds both report formats and sends one transactional message per active admin/super-admin.
- Event report delivery state is persisted as `not_started`, `queued`, `processing`, `sent` or `failed`; failed deliveries can be retried without marking provider-rejected mail as sent.

## Implemented

- Admin Event Reports navigation, selector, counts, summary, Excel/CSV buttons and real automatic downloads.
- API `/api/reports/events`, `/api/reports/events/:event_id/summary`, `/api/reports/events/:event_id?format=xlsx|csv`.
- Server-filtered projected query, ownership and role checks, safe errors, filenames and MIME/attachment/no-store headers.
- Request cancellation, stale summary protection, duplicate-download guard, retry/loading/empty/success states.
- Responsive existing-style UI verified at1920×800 and390×844; no horizontal overflow.
- Environment restored for nested project; supervised Node backend8001 and React3000. Existing malformed production Browserslist query overridden by nonsecret `frontend/.env.production`.
- Full requested engineering handoff: `AI_Powered_Certificate_Generation_And_Verification_System/EVENT_REPORTS_IMPLEMENTATION.md`.

### Resend Integration — Implemented 2026-09-11

- Installed official `resend` Node.js SDK `6.27.0`; removed the unused SendGrid package.
- Added certificate and completed-event report transactional templates.
- Replaced mock email flags in the simple Bulk Generator, Smart Bulk Studio worker, manual certificate send and failed-email retry route with real provider calls.
- Certificate emails attach the generated PDF and persist provider ID, intended recipient, sandbox delivery recipient, status and safe error details.
- Smart Bulk Studio now requires an event selection so uploaded rows create event-linked certificates that appear in event reports.
- Added `POST /api/events/:id/complete` and `POST /api/events/:id/report-delivery/retry`, both behind organization membership, permission and admin-role checks.
- Added persisted event status/report delivery UI, completion control, delivery progress polling and retry control with unique test IDs.
- Added event delivery queue index and a startup scheduler that recovers stale processing work.
- Replaced persistent pod upload storage for spreadsheet parsing with bounded in-memory upload handling plus short-lived OS temp parsing; parsed rows remain in MongoDB.
- Configured one trusted ingress proxy hop so login rate limiting uses forwarded client IPs without the previous runtime warning.

## Verification

-18/18 focused API + regression smoke checks passed, including a repeated main-agent run.
-5,000-record XLSX/CSV exports verified, with unrelated records excluded and query index check.
- Real browser login/summary/both downloads; direct report entry avoids global certificate fetch; desktop/mobile and long-title layout checked.
- Injected500 summary/binary-download failures show safe UI messages and recover on retry; injected failures exist only in browser tests.
- Auth, analytics, issuance, PDF, revocation and bulk upload/mapping/validation smoke passed; dashboard/studio screens opened. Production build passed.
- The earlier legacy flag-only email limitation is resolved by the Resend work below. Exhaustive template editing regressions remain outside this feature's focused verification scope.

### Resend Verification — 2026-09-11

- Testing agent exercised nine backend/integration cases plus desktop/mobile Events UI and production build. Initial provider calls correctly failed because the sandbox recipient had a one-character mismatch.
- Corrected the recipient to the exact address returned by Resend, restarted the backend and reran the complete suite: **9/9 passed** using real Resend API acceptance and persisted provider email IDs.
- Certificate delivery passed for the simple Bulk Generator and Smart Bulk Studio; event completion reached `report_delivery.status=sent` with XLSX and CSV attachments.
- Admin RBAC, completion idempotency, retry restrictions, attachment/report regressions and API-key non-disclosure passed.
- Event Reports regression smoke: **4/4 passed** after the integration changes. Frontend production build passed; desktop/mobile checks found no overflow or duplicate event-screen test IDs.
- Final forwarded-IP login returned 200 with no new backend errors or proxy validation warning.
- **MOCKED:** None. Development delivery uses Resend's real sandbox API; messages are intentionally redirected to the verified test inbox until a production domain is verified.

## Prioritized Backlog

- **P0:** No blocking Event Reports or Resend delivery defect found in tested scope.
- **P1:** Trusted operator must backfill correct organization ownership on legacy events before those events appear in reports.
- **P1:** Separately enforce consistent tenant/organization scope on legacy events/certificates APIs; new reports routes already enforce it.
- **P1:** Verify `campuscert.com` in Resend, change `SENDER_EMAIL` to `CampusCert Admin <admin@campuscert.com>` and disable sandbox recipient redirection before production.
- **P1:** Add Resend webhooks for delivered, bounced, complained and suppressed outcomes; current `sent` means Resend accepted the message.
- **P2:** Multi-membership switch during in-flight download automated coverage; extended template/bulk regressions.
- **P2:** Move high-volume certificate/report delivery to a dedicated durable worker queue and add administrator delivery analytics.
- **P2:** Queued/streaming export for above-limit events and optional scheduled reports.

## Next Tasks

1. User verifies the delivered certificate PDF and completed-event XLSX/CSV attachments in the configured Resend sandbox inbox.
2. Verify the production domain, update sender environment settings and turn off sandbox redirection.
3. Review event ownership and assign legacy `organization_id` values using verified organization records (no automatic assignment to the current user).
4. Address legacy API tenant boundaries as a separate, scoped security hardening task.
5. Add Resend delivery webhooks before relying on delivered/bounced status operationally.

## Credentials

Current local preview admin is recorded in `/app/memory/test_credentials.md`. Temporary role-test accounts are deleted by test teardown. No production credentials were changed.

## Production Readiness Request — 2026-09-12

User supplied a production-readiness master specification covering security, authorization/tenant isolation, JWT lifecycle, validation, certificate integrity/revocation/public verification, upload and spreadsheet safety, bounded durable/idempotent workloads, storage, privacy, observability, indexes, migrations, tests/load/security checks, CI/staging, backups and rollback. Preserve the Node/Express + React + native MongoDB modular monolith; use the architectural summary and targeted inspection, never read the entire repository or introduce speculative infrastructure.

**Latest explicit instruction:** “Please read CODEBASE_SUMMARY.md and PRD.md to produce the targeted Critical/High/Medium/Low security audit. List out the findings clearly. Do not implement any code changes or fixes until we have reviewed the audit and agreed on the design for the highest-priority blockers.”

### Phase 1 complete — AUDIT ONLY; remediation/design approval pending

- Read the attached CODEBASE_SUMMARY.md (not present as a repository file) and this PRD, then inspected targeted entry points/security/data-processing modules. Read-only security review and focused corroboration completed.
- Full report: `AI_Powered_Certificate_Generation_And_Verification_System/PRODUCTION_READINESS_AUDIT.md` — **1 Critical, 7 High, 16 Medium, 2 Low**. **Not ready for production launch.** This supersedes earlier feature-scoped health statements for production-readiness purposes.
- Critical: legacy privileged APIs/bulk lack server-side permission/ownership checks. High: object-valued organization selectors can decouple membership from resolved organization; credentialed CORS reflects arbitrary origins; public signup grants shared-tenant editor privileges; missing Resend key conditionally exposes reset links; vulnerable upload/parser dependencies; unbounded expensive work; non-durable/non-idempotent bulk execution.
- Other launch concerns: auth index initialization runs before DB connection and silently fails; access JWTs survive session revocation; weak/sequential certificate IDs without unique index; missing canonical integrity/revocation history; revoked certificates receive positive UI trust labels; public QR verification route is not implemented in this app; mutable/deletable historical templates/events; local PDFs/filename collisions; validation/export/observability/privacy/recovery gaps.
- Corrected handoff assumptions: spreadsheet uploads already use memory + temporary parsing cleanup, not persistent multer.diskStorage; generated PDFs still use local filesystem. Summary's public UUID-ID verification claim does not match current implementation. Resend, not SendGrid, remains current provider.

### Audit verification (non-mutating)

- External OPTIONS confirmed arbitrary-origin credentialed CORS. Unauthenticated certificate GET returned401. `/api/health` and `/api/ready` returned404.
- MongoDB index inspection confirmed missing auth uniqueness/TTL indexes and missing unique cert_id index. Aggregate ownership counts:9 events(1 unowned),2 templates(2 unowned),16 certificates(all lack direct organization_id),3 uploads(all unowned). No ownership values inferred or changed.
- Read-only dependency audits: backend11 dependency-path findings(5 high/5 moderate/1 low;9 unique advisory pairs); frontend63(39 high/21 moderate/3 low;34 unique pairs, many build/dev transitive). No packages changed. Reachability/exploit tests remain pending.
- Limited redacted tracked-file secret scan found no provider-key/private-key/credentialed-MongoURI literal matches; test password literals exist. Only tracked env file found contains nonsecret BROWSERSLIST. Git-history/external-secret checks were not performed.
- Historical test evidence discrepancy: PRD previously records corrected9/9 Resend success, but retained iteration_4 and Resend XML still show the initial3/9 failures. Do not claim current email failure or fresh success from these artifacts. No emails were sent; no active browser/destructive/load/regression tests were run in audit. Sandbox uses real Resend; no mocked integration was added.
- Application code, APIs, DB records, credentials, environment, dependencies and infrastructure were not changed. Only audit/PRD documentation was added/updated. No new auth credentials or test accounts created.

### Prioritized next work — requires user design approval

- **P0:** Review audit; approve tenant resolver + full private-route RBAC/ownership, safe onboarding/bootstrap policy, strict CORS/CSRF and recovery-link handling. Prepare reviewed legacy ownership migration without assigning unknown owners. Add isolated two-organization negative tests when implementation is approved.
- **P0 next increment:** Awaited index migrations; immediate session revocation/atomic rotation; high-entropy IDs and backward-compatible certificate integrity/public verification design; reachable dependency fixes and resource bounds. Medium-severity findings may still be launch blockers for this domain.
- **P1:** Central validation/errors/audit, secure parsers/exports, indexed pagination, durable jobs/idempotency/outbox, private artifact storage, configuration/shutdown/health/metrics, retention policy and comprehensive security/lifecycle tests.
- **P2 / launch gates:** Isolated load measurement, CI/staging, verified production sender, least-privilege/TLS/storage configuration, backup RPO/RTO and restore/rollback drills, updated architecture/API/environment/runbooks. No Redis/microservices/platform changes without demonstrated need.
- Product enhancement suggestion after hardening: a privacy-minimized verification receipt showing certificate status and the time checked, to improve employer trust without exposing recipient email.