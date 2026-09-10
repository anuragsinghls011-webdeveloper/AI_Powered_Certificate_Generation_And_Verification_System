# Event Reports — Engineering Report

## Files Inspected

Investigation started with the user-supplied **CODEBASE_SUMMARY.md**, retrieved from its public attachment URL. The entire repository was not read. Relevant source inspection was limited to:

- `backend/package.json`, `frontend/package.json`: existing Express, MongoDB Native Driver, Axios and XLSX dependencies.
- `backend/app.js`, `backend/server.js`, `backend/config/db.js`: route mounting, startup and collections.
- `backend/routes/eventRoutes.js`, `backend/controllers/eventController.js`, `backend/controllers/certificateController.js`, `backend/controllers/analyticsController.js`: actual relationships, status conventions and summary logic.
- `backend/middleware/authMiddleware.js`, `backend/utils/rbac.js`, `backend/utils/tokens.js`, relevant registration sections of `backend/routes/authRoutes.js`: JWT, organization membership, admin roles and ownership.
- `backend/services/seedService.js`, targeted XLSX/event-persistence references in `backend/modules/bulkGeneration/routes.js` and `jobQueue.js`.
- `frontend/src/App.js`, `frontend/src/components/layout/Header.jsx`, `frontend/src/pages/EventsPage.jsx`, `frontend/src/index.css`: existing tab navigation and styles.
- `frontend/src/services/api.js`, `frontend/src/auth/AuthContext.jsx`, login selectors in `AuthPages.jsx`, `frontend/src/hooks/useNotification.js`.
- Existing `memory/PRD.md`, `.gitignore`; the new tests and their output during verification.

Runtime environment/supervisor and narrow build-tool configuration checks were necessary because the supplied code was nested inside the workspace, with no environment files and no running application services.

## Files Created

### Backend
- `backend/routes/reportRoutes.js` — protected routes, admin gate, concurrency admission and safe errors.
- `backend/controllers/reportController.js` — organization-scoped event lookup, counts, filtered certificate retrieval and binary responses.
- `backend/services/eventReportService.js` — XLSX/CSV creation, metadata, counts, filenames and spreadsheet-safe values.
- `backend/services/eventReportWorker.js` — off-main-thread serialization, worker limits, timeout and cancellation.

### Frontend
- `frontend/src/pages/EventReportsPage.jsx` — reports page, selector, export actions, loading/retry/success/access states.
- `frontend/src/components/reports/ReportSummary.jsx` — event information and certificate totals.
- `frontend/src/hooks/useEventReports.js` — request lifecycle, stale-response prevention and duplicate-click guard.
- `frontend/src/services/eventReports.js` — existing Axios integration, binary errors and browser download cleanup.
- `frontend/.env.production` — valid `BROWSERSLIST` production target override for the pre-existing invalid `last-ready` package setting. Contains no secrets.

### Verification and handoff
- `backend/tests/test_event_reports.py` — 14 focused API tests.
- `backend/tests/test_event_reports_regression_smoke.py` — 4 existing-flow smoke tests.
- `test_reports/iteration_3.json`, `test_reports/pytest/event_reports*.xml` and browser screenshots — evidence.
- This document, `/app/memory/PRD.md`, `/app/memory/test_credentials.md`.

Local ignored configuration was restored in `backend/.env`, `frontend/.env`, and `frontend/.env.development.local`. These contain environment-specific configuration and are not source-code defaults. The development host-check override is development-only. Supervisor points to the nested existing Node/React project; its runtime override is stored at `/root/certificate-supervisor.conf`.

## Files Modified

| File | Targeted change |
| --- | --- |
| `backend/app.js` | Mount `/api/reports` behind existing JWT authentication. |
| `backend/config/db.js` | Ensure indexes on certificates `{event_id:1, cert_id:1}` and events `{organization_id:1, date:-1}`. |
| `backend/routes/eventRoutes.js` | New-event creation resolves existing organization membership and `events.create` permission. |
| `backend/controllers/eventController.js` | Store server-validated `organization_id` and `created_by` on new events. |
| `frontend/src/App.js` | Add reports tab/deep link; avoid global certificate/analytics prefetch on direct reports entry. |
| `frontend/src/components/layout/Header.jsx` | Admin-only report navigation, wrapping layout, no misleading unqueried repository count. |
| `.gitignore` | Ignore generated build/test cache files; retain the nonsecret production browser-target configuration. |
| `memory/PRD.md` | Add feature milestone, security boundary and follow-ups. |

No spreadsheet dependencies were added. Certificate rendering, issuance, revocation, mail, templates and authentication implementations were not refactored. Unrelated pre-existing working-tree differences in historical test/report URL strings were left untouched.

## API Changes

| Method and endpoint | Response |
| --- | --- |
| `GET /api/reports/events` | `{events:[{id,title,date}]}` for the active organization only. |
| `GET /api/reports/events/:event_id/summary` | `{event,total,active,revoked,other}`; zero counts for an empty event. |
| `GET /api/reports/events/:event_id?format=xlsx` | Attachment with Event Summary and Certificate Details sheets. XLSX is the default format. |
| `GET /api/reports/events/:event_id?format=csv` | UTF-8 BOM CSV attachment with the certificate detail table. |
| `POST /api/events` (existing) | Same response shape, with server-owned organization/creator fields and existing create permission enforcement. |

Errors: **400** invalid ID/format, **401** unauthenticated, **403** non-admin/nonmember, **404** nonexistent or inaccessible event, **422** empty event/oversized cell, **413** event exceeds report size limit, **429** concurrency capacity reached, **503** serialization timeout, **500** safe generic failure.

## Feature Summary

Open **Event Reports** in the existing navigation, or use `/#reports`. Select an event, inspect total/active/revoked counts, then click **Generate Excel** or **Generate CSV**. The selected event is fetched and authorized on the server; its certificate records are filtered there. Downloads use names such as `event-report-annual-tech-fest-2026.xlsx`.

**Schema correction:** source code actually writes `events.id` (UUIDs and seeded IDs) into `certificates.event_id`, and names events with `title`. The report follows this real schema and also recognizes the selected event's native MongoDB `_id`, both ObjectId and string representations. It never filters by event name or accepts a client-provided certificate dataset.

The Excel summary includes event name/date, total/active/revoked/other counts and UTC generation time. Detail columns include certificate ID, event, recipient name/email, issue date, status, role, grade and metadata. Up to 128 metadata paths become stable columns; remaining paths are preserved as JSON in `Metadata`. Escaped path segments prevent nested/literal-key collisions. Arrays and scalar metadata are readable, not `[object Object]`.

## Security

- All report endpoints use the existing cookie/Bearer JWT middleware, active organization membership, existing event/certificate read permissions, and an explicit `admin`/`super_admin` role gate. A super admin is still scoped to a verified organization membership.
- An event must have `organization_id` equal to the authorized organization. Changing the URL or requesting a different organization does not bypass membership verification.
- Missing and inaccessible events return the same 404 response. IDs use a bounded allowlist; object/query injection does not reach event lookup.
- **Legacy events without `organization_id` are excluded, not assigned to an arbitrary admin.** New events receive a verified organization server-side. No potentially destructive or ownership-guessing migration was performed.
- Spreadsheet formula-like strings are escaped, including whitespace-prefixed payloads. CSV uses XLSX serialization with quotes, CRLF and a Unicode BOM.
- Database `_id` values are converted deliberately for event DTOs and excluded from certificate exports. PDFs, QR image payloads, internal paths and other unused fields are not retrieved.
- Downloads are private/no-store, with attachment filenames, correct content types and `nosniff`. Backend failures are not exposed as stack traces.

## Testing

- **18/18 automated tests passed**, with a repeated main-agent run after test configuration cleanup.
- Coverage: unauthenticated/non-admin rejection; organization and legacy-event scoping; same-title event isolation; mixed-case/unknown status counts; valid workbook sheets/headers; CSV parsing/escaping; Unicode; nested/dynamic metadata; formula protection; metadata overflow; invalid ID/format; empty event; oversize cell; UUID/ObjectId relationships.
- **5,000-certificate** event exported to both XLSX and CSV with unrelated records excluded; index presence/query-plan checked.
- Browser: real admin login, selection, genuine Excel and CSV downloads with filenames, success/loading/empty state, rapid selection, direct reports entry without whole-certificate prefetch.
- Additional browser fault injection: failed summary and failed binary download displayed safe messages; retry successfully downloaded the real CSV afterward. Fault injection was confined to tests, not implementation.
- Layout checked at **1920×800** and **390×844**, including a long event title: no horizontal overflow. Keyboard-accessible native labeled selector and textual export buttons are used.
- Regression smoke: auth/me, analytics, single issuance, authenticated certificate lookup, PDF bytes, revocation, legacy mail status update, and Bulk Studio limits/sample/upload/mapping/validation. The legacy bulk issuance API generated the initial three test certificates successfully. Dashboard, Design Studio and Bulk Studio views opened afterward.
- **Production build passed** with `yarn build` after correcting the existing browser-target configuration through `.env.production`.

Re-run the focused suites from the repository root:

```sh
python -m pytest backend/tests/test_event_reports.py backend/tests/test_event_reports_regression_smoke.py -q
```

Tests require `pytest`, `requests`, `pymongo`, the running configured application, and `REPORT_TEST_ADMIN_EMAIL` / `REPORT_TEST_ADMIN_PASSWORD` in the process or backend environment. Tests read API/database configuration from existing environment files. The local account is recorded separately in `/app/memory/test_credentials.md`.

## Edge Cases

- No selected event: export disabled. Empty event: clear explanation; backend refuses a misleading blank file.
- Mixed statuses are counted explicitly; unknown/malformed statuses are not incorrectly labeled active.
- Null, object, array, zero/false and unusual metadata fields serialize safely. Dates retain ISO/date-only form where stored that way.
- Sanitized bounded filenames have a nonempty fallback for Unicode-only/punctuation-only names.
- Stale summary responses are aborted on event changes. Organization changes remount the report content and cancel pending requests. Duplicate exports are guarded both in UI and server capacity control.
- Reports cap at **100,000 certificates**, **128 flattened metadata columns** with lossless overflow JSON, and **32,767 characters per cell**. Oversized cells fail explicitly instead of truncating data silently.
- Two exports per process are admitted; worker serialization has a 120-second timeout and bounded heap. Query uses only relevant projected fields, a bounded result set and a 30-second certificate-query limit. This is not an unlimited-size streaming export.

## Remaining Issues

1. **Ownership backfill required for existing unassigned events.** A trusted data administrator must review and set each legacy event's correct `organization_id`. They will not appear in Event Reports until then. Existing event/certificate records were not bulk-reassigned.
2. **Pre-existing global APIs are not consistently organization-scoped.** For example, the legacy `/api/events` list queries all events. This is outside the new protected reporting endpoints and needs a separate application-wide authorization task; this feature is not a security audit of the entire system.
3. **Real email delivery was not verified.** The existing legacy send-email handler only updates a status flag; report work does not add email delivery. No external provider credentials were available or required for this feature.
4. Full template-edit/save regression, end-to-end asynchronous bulk job completion, live outbound email delivery and actual multi-organization switching during an in-flight request were not comprehensively automated in this pass. Relevant screens and the smoke endpoints above were verified; their untouched implementations were not exhaustively inspected.
5. Above-limit events would need a separate queued/streaming export design. The stated 100,000-row guard has not been load-tested at its upper boundary; 5,000-row exports were verified.

Potential enhancement: scheduled event reports after organization ownership is fully assigned.