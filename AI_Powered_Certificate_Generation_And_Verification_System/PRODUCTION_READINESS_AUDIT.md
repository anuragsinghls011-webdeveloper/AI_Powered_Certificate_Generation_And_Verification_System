# CampusCert — Targeted Production-Readiness Audit

**Date:** 2026-09-12  
**Decision:** NOT READY FOR PRODUCTION LAUNCH.  
**Scope:** Phase 1 only. No application code, dependencies, configuration, credentials, or business records were changed. Recommendations below are proposals, not implemented controls. Await owner review/design approval before remediation.

## 1. Method, evidence, and boundaries

Read the supplied `CODEBASE_SUMMARY.md` attachment first, together with `/app/memory/PRD.md`. Used that map to inspect the Express entry points, security middleware/helpers, route declarations, relevant controllers, bulk worker/parser, report/email services, and React auth/verification paths. Used filename inventories and targeted searches for secrets, indexes, operational controls, and tests; did not ingest the entire repository or unrelated UI modules.

Read-only security review was supplemented with:
- An external-preview OPTIONS request using an untrusted Origin; credentialed CORS reflection was observed.
- An unauthenticated GET to a nonexistent certificate ID; it returned 401 before lookup.
- GET `/api/health` and `/api/ready`; both returned 404.
- MongoDB index inspection and aggregate ownership counts, without returning recipient records or modifying data.
- `yarn audit --groups dependencies --json` in both projects and installed-version inspection; no installs/upgrades.
- Redacted, pattern-based checks of tracked files for provider keys, credentialed MongoDB URIs, private keys, and literal credential candidates. No secret values are included here.

**Not performed:** active cross-tenant exploitation, account creation, password/reset/logout tests, destructive revocation/deletion, email sends, malformed-file attacks, concurrency/load tests, full browser regressions, complete Git-history secret scanning, or production-infrastructure inspection. Static race conditions are not claimed to have been reproduced. Multi-tenant exploit paths need isolated two-organization tests after approval. No claim is made about external QR-domain ownership or live production TLS/backups.

**Severity versus release priority:** severity reflects attack prerequisites and impact. A Medium-severity integrity/availability gap can still block launch for this certificate product. Conditional findings are explicitly labelled. Complexity: **S** localized; **M** several modules/tests; **L** cross-cutting changes or migration; **XL** operational setup plus extensive validation. These are effort categories, not delivery promises.

**Findings:** 1 Critical, 7 High, 16 Medium, 2 Low. Related effects are grouped by root cause.

## 2. Architecture actually found

- Retain React 18 + Express 4 + MongoDB Native Driver as a modular monolith. No reason to add Mongoose, microservices, Redis, or another authentication system.
- Existing organizations, memberships, roles, permissions, cookie JWTs, hashed refresh sessions, and audit collection should be reused.
- Resend **replaced SendGrid**. Current preview configuration has a Resend key and real sandbox redirection enabled. `sent` represents provider acceptance, not proven inbox delivery.
- Reports have substantially better controls than legacy APIs, but their shared organization resolver has an input-type flaw (H-01).
- Smart Bulk has MongoDB job/record persistence, but execution/cancellation is still process-local. Simple bulk remains request-bound.
- Spreadsheet uploads now use bounded memory plus short-lived temporary parsing files, **not `multer.diskStorage`**. The remaining persistent-local-storage problem is generated PDF artifacts and stored filesystem paths.
- The summary's claim of UUID public certificate IDs is inaccurate: the simple path uses only eight UUID hex characters; Smart Bulk uses a sequence.

### Existing controls worth preserving

- bcrypt cost 12, password policy, access-token expiration, HS256 algorithm allowlist, issuer/audience/type checks.
- Secure/HttpOnly cookies; inspected React auth code does not persist JWTs in localStorage/sessionStorage.
- Refresh-token hashes, expiry checks, rotation/reuse-detection intent, and user suspension checks.
- Some login/register/reset limits and persisted failed-login tracking.
- Server-assigned organization on new events; permission checks for creation and admin restrictions for completion.
- Report event ownership checks, controlled projections, identifier/format checks, safe filenames, formula escaping, no-store headers, 100,000-row cap, query timeout, and bounded worker serialization.
- Spreadsheet upload byte/row/column limits, random temporary names and finally-cleanup; PDF renderer accepts embedded images rather than fetching arbitrary remote URLs.
- Resend provider idempotency keys, explicit failure status, attachment bounds, and atomic claiming of queued event reports.

These controls are partial protections, not a security certification.

## 3. Privileged-route coverage

All prefixes below are under `/api`. Authentication is mounted centrally; that alone is insufficient.

| Surface | Current server-side boundary | Gap |
|---|---|---|
| `events` GET / DELETE | Authentication only | Global listing and ID-only deletion |
| `events` POST | Membership resolver + `events.create`; owner assigned server-side | Unsafe resolver input; open signup grants editor permissions |
| `events/:id/complete`, report retry | Resolver + permission + admin role + event organization filter | Resolver flaw remains; distinct action permissions not defined |
| `templates` CRUD / preview | Authentication only | No permission/resource organization checks |
| `certificates` list/create/bulk/detail/revoke/email/PDF | Authentication only | No permission/tenant boundary; full sensitive records returned |
| `analytics` | Authentication only | Global counts/aggregates |
| `bulk` uploads/previews/mappings/jobs/records/retry/cancel/ZIP/email/analytics | Authentication only | No owner/org binding on jobs/uploads/artifacts or actions |
| `reports` event selector/summary/export | Resolver + admin role + read permissions + scoped event lookup | H-01 resolver flaw; certificate query relies on event relationship, not certificate organization |
| `auth` members/roles | Resolver + `members.manage`; membership update scoped | Incomplete super-admin demotion safeguards |
| `auth` sessions | Current-user filter | Access JWTs do not consult revoked session |
| `auth` audit logs | Resolver + `audit.read`; organization or current-user predicate | Coverage/retention/scope policy incomplete |
| Public verification | No dedicated anonymous route | Current certificate route and SPA are authenticated |

## 4. CRITICAL

### C-01 — Core APIs lack authorization and resource ownership enforcement
- **Current implementation/evidence:** `backend/app.js:33-37,48` mounts authentication. `backend/routes/certificateRoutes.js:13-19`, `templateRoutes.js:12-18`, and `eventRoutes.js:6,20` lack action permission checks. `certificateController.js:9-22,97-175` lists/creates/revokes/sends without tenant filters; `eventController.js:88-91` deletes by ID. Bulk routes throughout `backend/modules/bulkGeneration/routes.js` use global or ID-only queries and store no actor/org ownership. Analytics is global.
- **Risk/prerequisite:** Any authenticated account, including an unverified self-registered account, can read recipient PII, issue/revoke certificates, delete events/templates and invoke costly jobs/emails beyond its role. Across organizations, changing resource IDs bypasses isolation. Unscoped certificate writers can also attach records to another organization's event and contaminate its reports.
- **Recommended solution:** Reuse `resolveOrganization`, `requirePermission`, and the native-driver query style. Apply deny-by-default action permissions and `organization_id + resource ID` filters to every owned resource, including jobs/uploads/mappings/artifacts. Validate event/template ownership before issuance. Derive child ownership server-side. Treat public verification separately. Backfill only operator-approved legacy ownership; quarantine unknown ownership rather than assigning it to the current user.
- **Files affected:** All route/controller pairs for events/templates/certificates/analytics/bulk; `backend/middleware/authMiddleware.js`, `backend/utils/rbac.js`, `backend/controllers/reportController.js`; ownership migration and isolation tests to be added after approval.
- **Complexity:** **L**. Confirmed source-level failure; destructive exploitation not performed.

## 5. HIGH

### H-01 — Organization selector accepts query objects and can decouple membership from tenant
- **Current implementation/evidence:** `backend/middleware/authMiddleware.js:42-63` accepts `req.query.org` without scalar validation. It independently uses this value in membership and organization queries. `backend/controllers/reportController.js:8,24,39` scopes data by the independently resolved organization, not the validated membership's organization ID.
- **Risk/prerequisite:** In a multi-organization database, an authenticated caller can supply a MongoDB operator-shaped query value that matches their own membership and a different organization. An admin's report authorization can then be evaluated against membership A while querying organization B. Exact target selection depends on matching records; this was not actively exploited.
- **Recommended solution:** Reject non-string/invalid org selectors before querying; fetch the organization using **the validated membership's scalar `organization_id`**. Require equality throughout request context. Add two-tenant tests to reports and event creation, not just legacy endpoints.
- **Files affected:** `backend/middleware/authMiddleware.js`; report/event route tests and any organization-resolving caller.
- **Complexity:** **M**. Confirmed unsafe dataflow; cross-tenant impact conditional on multiple organizations.

### H-02 — Arbitrary-origin credentialed CORS and missing CSRF protection
- **Current implementation/evidence:** `backend/app.js:24` uses `cors({ origin: true, credentials: true })`. `backend/routes/authRoutes.js:26-35` uses HttpOnly cookies with SameSite=None by default; preview config also uses None. No CSRF/origin enforcement found. External preflight reflected the audit's untrusted Origin with `Access-Control-Allow-Credentials: true` and allowed DELETE.
- **Risk/prerequisite:** A logged-in victim visiting an attacker-controlled page can expose authenticated responses and permit actions when the browser sends cross-site cookies. Browser third-party-cookie restrictions reduce some cases but are not a security boundary.
- **Recommended solution:** Exact environment-specific origin allowlist, reject disallowed origins, retain credentialed cookies only for intended clients, add CSRF protection for cookie-authenticated mutations, and choose appropriate SameSite settings for the actual SPA/API topology. Test login/refresh/downloads against the policy.
- **Files affected:** `backend/app.js`, `backend/routes/authRoutes.js`, `frontend/src/auth/AuthContext.jsx`, `frontend/src/services/api.js`; centralized config/security middleware.
- **Complexity:** **M**. Configuration and preflight behavior confirmed; no victim-session exploitation.

### H-03 — Public registration joins the shared organization with issuance permissions
- **Current implementation/evidence:** `backend/routes/authRoutes.js:72-94,135-197` creates/joins a default organization, grants first user `super_admin`, subsequent users `editor`, and auto-logs in without verified email. `backend/utils/rbac.js:13-18` grants editors event/template/certificate/bulk creation. `authRoutes.js:582-602` prevents granting super-admin by non-super-admins but does not protect existing/last super-admin from demotion.
- **Risk/prerequisite:** Even after C-01 route guards, internet signup still grants business privileges in an existing customer's shared organization. An exposed empty database has first-registrant takeover/race risk. Role changes can remove the organization's recovery authority.
- **Recommended solution:** Approve an explicit onboarding policy: invitation/approval for the existing organization, or separately provisioned customer organizations. Disable implicit shared-tenant enrollment and public first-user bootstrap. Use a controlled, atomic operator bootstrap; protect highest/last privileged membership. Preserve existing roles rather than replacing RBAC.
- **Files affected:** `backend/routes/authRoutes.js`, `backend/utils/rbac.js`, `backend/services/seedService.js`, frontend registration UX.
- **Complexity:** **M/L**. Shared enrollment confirmed; empty-database bootstrap risk conditional.

### H-04 — Missing email configuration can expose password-reset tokens
- **Current implementation/evidence:** `backend/utils/emailService.js:38` returns `dev_mode: true` whenever the Resend key is absent. `backend/routes/authRoutes.js:474-493` then returns the reset link to the caller. Registration/resend-verification also expose links in this mode (`:199-209,458-470`). No production-environment guard exists.
- **Risk/prerequisite:** If an internet-facing instance starts without its email key, a caller knowing an account email can obtain a reset token without controlling the inbox. **Current preview key is present; this condition was not triggered.**
- **Recommended solution:** Never expose recovery tokens through production API responses. Fail startup on invalid required production email/configuration; use a separate explicitly enabled development-only inspection mechanism. Make reset responses uniform and token consumption atomic.
- **Files affected:** `backend/utils/emailService.js`, `backend/routes/authRoutes.js`, production config validation and auth tests.
- **Complexity:** **M**. Confirmed conditional vulnerability, not a claim of current account compromise.

### H-05 — Vulnerable dependencies in untrusted-input paths
- **Current implementation/evidence:** Installed backend `multer 2.2.0`, `xlsx 0.18.5`, `qs 6.15.3`; frontend `xlsx 0.18.5`. Registry audit flagged high-severity multipart DoS and SheetJS prototype-pollution/ReDoS advisories. Backend: **11 dependency-path findings** (5 high, 5 moderate, 1 low), 9 unique advisory/package pairs. Frontend: **63 path findings** (39 high, 21 moderate, 3 low), 34 unique pairs; many are build/dev transitive packages, not necessarily reachable browser/runtime vulnerabilities.
- **Risk/prerequisite:** Spreadsheet/multipart parsers handle attacker-controlled uploads. Some other advisories need APIs the app does not use (e.g. UUID v3/v5/v6 buffer arguments); counts alone do not prove exploitability.
- **Recommended solution:** Triage runtime versus build-only reachability; apply compatible security updates with regression tests. Audit reports Multer fixes in 2.3.0+. SheetJS npm advisory has no patched npm range; verify a supported upstream distribution or narrowly replace parsing/export behind existing interfaces. Do not blindly major-upgrade React/Express or swap working libraries wholesale.
- **Files affected:** Backend/frontend dependency manifests and lockfiles through package manager; `spreadsheetParser.js`, bulk routes, frontend spreadsheet users, report serialization tests.
- **Complexity:** **M/L**. Advisory/version matches confirmed; no malicious-payload exploit tests.
- **Sources:** [Multer multipart DoS](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm), [Multer aborted uploads](https://github.com/advisories/GHSA-qfvm-cv95-jqjf), [SheetJS prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [SheetJS ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9), [qs DoS](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).

### H-06 — Expensive work lacks global admission and resource budgets
- **Current implementation/evidence:** `certificateController.js:29-94` processes arbitrary participant arrays and waits for PDF/email work in the request. `bulkGeneration/routes.js:81-98` checks row/column caps only after full parse; `spreadsheetParser.js:35-64` parses synchronously. `jobQueue.js:86-93` limits to three tasks **per job**, not globally. `app.js:26` permits 25 MB JSON before authentication. Creation/preview/bulk/email routes have no risk-specific rate limits.
- **Risk/prerequisite:** A logged-in caller can start many expensive operations and saturate CPU, memory, disk or provider quota. Small compressed workbooks can expand substantially before post-parse row limits apply. Public large JSON parsing is another resource-consumption surface.
- **Recommended solution:** Central configurable per-route byte/row/cell/field/pixel/job limits; stricter per-user/org admission; parser isolation/time/memory bounds; bounded global PDF concurrency and queued capacity. Move simple bulk onto the existing job abstraction instead of adding a second queue. Use shared limit state when running multiple instances.
- **Files affected:** `backend/app.js`, `certificateController.js`, bulk `routes.js`, `spreadsheetParser.js`, `jobQueue.js`, renderer/config/security middleware.
- **Complexity:** **L**. Missing bounds confirmed; capacity/DoS threshold unmeasured.

### H-07 — Persisted jobs do not provide durable, idempotent execution
- **Current implementation/evidence:** `bulkGeneration/routes.js:317-346` separately inserts job/records and launches `setImmediate`. `jobQueue.js:15-16,69-93` uses process-local running/cancel state and reads pending records without atomic claims. Certificate/file creation precedes record completion (`:110-182`); retries can issue new identities after partial failure. `routes.js:386-399` changes retry counters before a durable claim. `server.js` has no bulk recovery startup path.
- **Risk/prerequisite:** Restart loses scheduling/cancellation, concurrent replicas can process the same job, retries can duplicate certificates or skew counters, and a double submission creates a new job. Existing provider idempotency does not make certificate creation idempotent.
- **Recommended solution:** Evolve existing MongoDB jobs into a durable queue abstraction with atomic claims, leases/heartbeats, database cancellation, retry ceilings/backoff, recovery, stable row identities and unique job/row keys. Persist HTTP idempotency keys with org/action/payload digest. Use targeted transactions only for justified multi-document invariants on a compatible Mongo deployment; keep external mail/PDF work outside transactions.
- **Files affected:** Bulk `routes.js`, `jobQueue.js`, `backend/server.js`, DB indexes/migrations, certificate issuance/email services.
- **Complexity:** **L**. Static failure/retry windows confirmed; no fault-injection tests performed.

## 6. MEDIUM

### M-01 — Session invalidation and token rotation are incomplete
- **Current implementation/evidence:** `authMiddleware.js:15-28` checks signature/user but not a live session or token version; `tokens.js:12-24` access JWT has no session identifier/version. Logout/reset/session revoke only change refresh-session records (`authRoutes.js:338-369,429-435,496-545`). Refresh reads then inserts/revokes separately (`:292-324`); reset/verification token consumption is also check-then-update. Failed-login counters are read-modify-write and keyed by IP+email (`:97-113,228`). Password policy permits 128 characters although bcrypt truncates after 72 bytes (`utils/passwords.js:17-23`).
- **Risk:** A stolen access JWT survives logout/reset until expiry (default 15 minutes). Concurrent refresh can create multiple successors or trigger false replay lockouts. Distributed attempts bypass per-IP/account-pair controls. Long passwords may be silently equivalent after byte truncation.
- **Recommended solution:** Keep cookie JWT + existing durable sessions; bind access to stable session/version and check revocation, rotate refresh atomically, consume one-time tokens atomically, make lockout counters atomic with bounded account/IP policy, enforce a documented bcrypt-safe byte policy. Test replay, concurrent tabs, expired/invalid tokens and immediate revocation.
- **Files affected:** Auth middleware/routes, tokens/password helpers, AuthContext, auth tests.
- **Complexity:** **L**. Confirmed static; no stolen-token or race tests.

### M-02 — Authentication uniqueness/TTL index initialization never executes successfully
- **Current implementation/evidence:** `authRoutes.js:54-70` immediately calls `getDB()` during module import; `server.js:2,11` imports it before connecting. `config/db.js:27-29` throws; auth code swallows the error. Read-only `listIndexes` showed only MongoDB's implicit `_id` index on users/sessions/memberships/organizations; verification tokens also lack TTL. Missing reset/attempt collections cannot have the intended indexes yet.
- **Risk:** Duplicate-email/membership races, inefficient session/auth queries and unbounded expired-token retention. The presence of `createIndex` source code is not evidence those controls exist.
- **Recommended solution:** Await versioned index setup after DB connection and fail clearly if a required invariant cannot be established. Dry-run duplicate detection before unique indexes; add TTL indexes on actual Date fields. Verify deployed indexes after migration.
- **Files affected:** `backend/routes/authRoutes.js`, `backend/config/db.js`, `backend/server.js`; versioned migration/index tests.
- **Complexity:** **M**. Startup ordering and preview index absence confirmed. `_id` itself remains MongoDB-unique.

### M-03 — Weak/sequential public certificate IDs lack uniqueness enforcement
- **Current implementation/evidence:** `utils/helpers.js:6-8` retains 8 UUID hex characters (32 random bits). `bulkGeneration/jobQueue.js:32-42` exposes a yearly sequence. `config/db.js:16` creates only a nonunique `(event_id, cert_id)` index; preview has no unique `cert_id` index.
- **Risk:** Predictable IDs aid enumeration; approximately 77,000 random issuances within one year yield about a 50% chance of a collision. Duplicate IDs make ID-only lookup/revocation ambiguous. This is a launch blocker for the stated scale even though collisions were not observed here.
- **Recommended solution:** Full-entropy public identifiers separate from internal database IDs, unique index, duplicate handling, and stable backwards-compatible legacy verification. Do not silently renumber historical certificates/QRs. Define how any existing ambiguous IDs are reconciled.
- **Files affected:** Helpers, jobQueue, certificate controller, DB migration/index setup, verification compatibility tests.
- **Complexity:** **M/L**.

### M-04 — Certificate authenticity, revocation and historical rendering are not protected end-to-end
- **Current implementation/evidence:** Certificate documents have no canonical-data integrity check; Smart Bulk's `pdf_hash` is stored but not verified. `certificateController.js:150-154` only sets status. `frontend/src/pages/VerifyPage.jsx:62-100` displays “Authentic & Verified” and “Valid Digital Record” for any successful lookup, including Revoked. `eventController.js:88-91` and `templateController.js:136-140` hard-delete without historical-reference checks. PDF download retrieves the current mutable template (`certificateController.js:189-197`).
- **Risk:** Revoked credentials receive misleading positive trust signals; unexpected data edits are undetected; template edits/deletions change historical downloads, and event deletion orphans report history. Certificate rows are not physically deleted by the revoke endpoint, which is a useful existing safeguard.
- **Recommended solution:** Versioned deterministic certificate manifest and template snapshot/version; integrity verification with a clearly defined threat model; atomic revocation with actor/time/reason and audit event; explicit invalid/revoked/tampered states; archive/prevent deletion when referenced. A plain SHA-256 stored beside data only detects accidental changes if both can be rewritten: use a protected HMAC/signature when malicious DB edits are in scope, without claiming a checksum alone proves authenticity.
- **Files affected:** Certificate/event/template controllers, helpers/renderer/PDF service, jobQueue, VerifyPage, audit utility, migrations and lifecycle tests.
- **Complexity:** **L**. Domain-trust launch blocker; UI conclusion source-confirmed, not browser-tested during audit.

### M-05 — Public QR verification is not implemented as the specified public contract
- **Current implementation/evidence:** `app.js:35` authenticates the entire certificate router. `frontend/src/App.js:31,310` starts on dashboard/reports and gates the application on login, without a public `/verify/:id` route. `VerifyPage.jsx:18` uses the administrative certificate detail endpoint. Simple issuance hardcodes an external host (`certificateController.js:41,107`); Smart Bulk uses a different APP_URL-derived base (`bulkGeneration/routes.js:44`, `jobQueue.js:100`). External unauthenticated certificate GET returned 401.
- **Risk:** Recipients/employers cannot rely on the promised anonymous QR flow in this application. Removing authentication from the existing detail route would instead expose private email, metadata, PDF paths/provider state. Availability/ownership of the external QR host was not verified.
- **Recommended solution:** A dedicated public endpoint and frontend route with minimal explicit fields, high-entropy IDs, rate limits, server-authoritative status/integrity, consistent configured verification origin, and no sensitive metadata/email. Keep administrative detail/PDF separate. Initially avoid positive-result caching until revocation invalidation is defined.
- **Files affected:** App/router, VerifyPage, backend app/certificate routes/controller, helper/jobQueue URL generation, public security tests.
- **Complexity:** **M**. Functional launch blocker, not evidence of anonymous data exposure today.

### M-06 — Validation is fragmented; query operators and raw regex reach MongoDB
- **Current implementation/evidence:** `certificateController.js:11-20` directly assigns `event_id` from query and builds raw `$regex`. Issuance uses body IDs without scalar schemas (`:31-39,99-104`). `templateController.js:45-72` whitelists top-level keys but does not validate field contents/counts/ranges. Bulk settings can opt into invalid records (`routes.js:279-305`) and validateRows does not uniformly validate defaults/dates/types. H-01 covers the higher-impact org selector separately.
- **Risk:** Operator injection broadens queries; crafted patterns consume resources; invalid relationship values or template settings are persisted. Coercion is not complete validation.
- **Recommended solution:** Reusable route schemas for bodies/params/queries/headers, string IDs, strict enums/lengths/ranges/field counts and explicit allowed filters/sorts. Escape literal search regex or choose bounded indexed search. Preserve intentional compatibility with UUID/seeded IDs; validate ObjectIds before construction.
- **Files affected:** All external-input controllers/routes, authMiddleware, template/bulk validationEngine; shared validators/tests.
- **Complexity:** **L**.

### M-07 — Upload/image content checks and pre-parse safety are incomplete
- **Current implementation/evidence:** Bulk `routes.js:30-39,86-98` validates extension and file bytes, not MIME/content signature; XLS is accepted as well as CSV/XLSX. Parser reads whole files before enforcing row/column bounds. Renderer `certificateRenderer.js:148-153,222-240,306-312` decodes data:image buffers without independent decoded-byte/pixel limits. Fields/images live in JSON template documents, not a separate image-upload route.
- **Risk:** Spoofed/corrupt/decompression-heavy files and oversized decoded images reach parsers/renderers; large embedded templates can exceed MongoDB document limits. Temporary filenames are randomized and cleaned up, so direct original-filename path traversal was not found in this path.
- **Recommended solution:** Separate CSV/XLSX/image budgets, content-aware validation and format policy, parser isolation and compressed-expansion safeguards, image dimensions/decoded-size limits, private restrictive temporary directories and bounded multipart parts/fields. Reject unsupported/corrupt content safely before persistence.
- **Files affected:** Bulk routes/parser, template controller/renderer, central limits/config and malicious-file tests.
- **Complexity:** **M/L**. Dependency vulnerabilities are tracked separately in H-05.

### M-08 — Formula neutralization and CSV encoding are inconsistent outside reports
- **Current implementation/evidence:** `spreadsheetParser.js:8-17` checks dangerous prefixes before trimming; a whitespace-prefixed formula string from XLSX can become dangerous after trim. `bulkGeneration/routes.js:186-206` manually serializes error CSV, and `:434-440` ZIP summary CSV only replaces commas in names, without robust quote/newline/formula escaping. Event report `eventReportService.js:29-40,84-85` already has stronger whitespace-aware handling and CSV serialization.
- **Risk:** A crafted spreadsheet value can become a formula on export; quotes/newlines can corrupt exported rows. Plain quote-wrapping does not neutralize formulas.
- **Recommended solution:** Reuse one tested output-cell/formula guard and CSV serializer across reports/errors/ZIP summaries; preserve raw domain values separately from export escaping. Test Unicode, commas, quotes, CR/LF, leading whitespace and =/+/-/@ values.
- **Files affected:** Bulk parser/routes and eventReportService shared export utility; export tests.
- **Complexity:** **M**.

### M-09 — Persistent local PDFs and nonunique filenames threaten artifact integrity
- **Current implementation/evidence:** `jobQueue.js:13,113-120,141-142` writes files locally and persists absolute paths. User filename patterns are sanitized/truncated to 120 chars, but can produce the same filename for multiple rows. `routes.js:418-440,459-461` reads those paths for ZIP/email and silently omits missing PDFs from ZIP contents.
- **Risk:** Restart/replica/disk changes lose artifact access; collisions overwrite a previous recipient's PDF and can put the wrong content in ZIP/retry email. Sanitization prevents common traversal but does not ensure uniqueness. PDFs are not shown to be publicly mounted, which is positive.
- **Recommended solution:** FileStorageService with local development adapter and private production object storage; immutable server-generated artifact keys based on stable record IDs, not display names; authenticated access or short-lived signed URLs after authorization; explicit missing-artifact errors, expiry/encryption policy and PDF-hash checks.
- **Files affected:** Bulk routes/jobQueue, PDF/email services, storage configuration/adapter and artifact tests.
- **Complexity:** **L**. Object-storage provider/setup requires later design approval; no integration added.

### M-10 — Error/security middleware is incomplete and inconsistently ordered
- **Current implementation/evidence:** `app.js:39-48` registers errorHandler before deferred bulk routes. Express 4 async handlers in auth/bulk often have no catch/next wrapper. `middleware/errorHandler.js:6-11` and legacy controllers return raw `err.message`; no request IDs or common error codes. No global security-header middleware found; sampled API response exposed X-Powered-By and lacked application-level nosniff/frame/referrer/CSP protections (reports set nosniff locally).
- **Risk:** Internal database/filesystem/provider messages can reach clients; rejected async operations may hang requests or terminate the process depending on runtime rejection policy. Responses cannot reliably be correlated with safe logs.
- **Recommended solution:** Request IDs early, reusable async wrapper/AppError, one final error boundary after all mounts, generic production messages and redacted internal logs. Add/test security headers; enforce CSP where the actual HTML is served and validate HSTS/HTTPS with the edge rather than assuming an API-only policy protects React.
- **Files affected:** app/server, errorHandler, route wrappers/controllers, frontend HTTP error handling; security configuration.
- **Complexity:** **M/L**.

### M-11 — Collection endpoints and query patterns are not scale-bounded
- **Current implementation/evidence:** Certificate/event/template lists use unrestricted `toArray`; report event selector (`reportController.js:38-40`) and bulk analytics (`routes.js:481-486`) do likewise. Auth members fetch all memberships/users. Existing job/record lists have some caps, but numeric NaN and filter types are not uniformly rejected. Most logical `id`, job/record and audit query patterns lack corresponding indexes in preview. Reports do have `(event_id,cert_id)` and a bounded download query.
- **Risk:** High RAM/latency, full scans, and huge private responses as organizations grow. Adding indexes indiscriminately increases write cost; status-only indexes may be low-selectivity.
- **Recommended solution:** Server-capped pagination with stable sort and narrow projections; allowlisted filters/sorts; aggregate counts in MongoDB rather than loading all jobs. Explain actual queries before adding org/event/job/timestamp compound indexes. Move above-limit exports to bounded artifact jobs; do not silently truncate.
- **Files affected:** List/analytics/report controllers, bulk/auth list routes, frontend list consumers, DB migrations.
- **Complexity:** **L**.

### M-12 — Email retries/delivery semantics and report recovery need hardening
- **Current implementation/evidence:** Resend returns `delivered: true` on provider acceptance (`utils/emailService.js:50-65`); API/UI labels can imply delivery. Certificate sends have status/error/ID but no complete attempt/backoff ledger. Send serialization is process-local (`:3-5,24-32`). Report scheduler atomically claims work, but recovers stale work only once at startup (`eventReportScheduler.js:32-40`), without lease ownership/heartbeat. Report retries regenerate time-bearing attachments while reusing the same provider idempotency key (`eventReportDeliveryService.js:33-56`; `eventReportService.js:92`).
- **Risk:** Recently interrupted report work can remain stuck after a quick restart; multiple replicas can exceed provider limits; partial retries may replay already accepted deliveries or conflict with a previously used key/payload. No webhook evidence confirms delivered/bounced/complained outcomes. Generation is still delayed by in-line email work even when provider rejection is recorded rather than thrown.
- **Recommended solution:** Durable per-message outbox with bounded attempts/backoff/next_attempt, stable retry payload/artifact, per-recipient outcomes, periodic lease recovery and shared provider admission. Distinguish accepted versus delivered, and add signature-verified delivery webhooks if operationally required. Preserve Resend and sandbox safety; do not restore SendGrid.
- **Files affected:** emailService, certificateEmailService/controller/jobQueue, eventReportScheduler/DeliveryService, delivery UI/tests.
- **Complexity:** **L**.

### M-13 — Auditability, operational signals and shutdown are incomplete
- **Current implementation/evidence:** `utils/audit.js:2-8` silently discards logging failures. Auth and some bulk/report-email actions are logged, but ordinary certificate issuance/revocation, event/template mutations and manual report download lack a consistent actor/org/resource/request-ID event. `server.js:9-29` does not retain/drain the server or close Mongo/workers on SIGTERM. No liveness/readiness/request timing/metrics pipeline found; `/api/health` and `/api/ready` returned 404.
- **Risk:** Incidents and data changes cannot be reconstructed reliably; traffic may reach unhealthy instances; jobs can be interrupted without observable recovery. No established signals for auth attacks, queue lag, email failure or storage faults.
- **Recommended solution:** Central append-oriented/redacted audit event schema, protected audit reads and observable audit-write failure policy; structured request logs with IDs/latency/error codes; non-sensitive liveness/readiness; drain/stop new work and close DB/workers on shutdown. Start with simple metrics/alerts for errors, latency, queue age, DB and delivery failures, not a new monitoring platform.
- **Files affected:** server/app, config/db, audit helper and mutation/report services, worker lifecycle; operational runbooks.
- **Complexity:** **L**.

### M-14 — Production configuration and schema evolution do not fail safely
- **Current implementation/evidence:** Environment access/defaults are scattered across server, tokens, auth, bulk and email. JWT/email checks often happen during requests, not startup. Preview environment metadata has NODE_ENV unset and Resend test mode enabled. `config/db.js:12` uses MongoClient defaults; deployment TLS/least-privilege settings were not inspected. `server.js:16-17` always runs empty-collection sample seeding; seedService creates unowned templates/event. No versioned migration runner or environment examples found.
- **Risk:** Missing/incorrect configuration can start a partially functioning or unsafe instance; sandbox production use redirects real recipient information; schema/index changes are untracked and sample data can reappear. Preview-local MongoDB is not itself evidence of insecure production TLS.
- **Recommended solution:** Validated environment profiles and required origins/keys/limits/timeouts/storage settings at startup; forbid unsafe production recovery/debug modes and unintended sandbox delivery; explicit database pool/timeouts/TLS policy with least-privilege credentials; versioned, repeatable, dry-run migrations and controlled dev seeding. Keep protected environment variable names.
- **Files affected:** config/db/server/tokens/auth/email/bulk configuration, seedService, migration tooling, `.env.example`/ENVIRONMENT documentation after approval.
- **Complexity:** **M/L**. Deployment settings remain unverified.

### M-15 — Privacy minimization and retention are undefined
- **Current implementation/evidence:** Certificate lists/details return whole documents except `_id` (`certificateController.js:21,141`), including private email and, for bulk records, filesystem/provider information. Several auth/org/session responses spread database documents with internal IDs. `bulk_uploads` retain all parsed recipient rows without expiry; PDFs, token/audit data and exports have no unified retention policy. Missing TTL controls also affect M-02.
- **Risk:** Excess disclosure even to otherwise legitimate staff, duplicated recipient PII retained unnecessarily, and unclear legal deletion/anonymization handling for long-lived certificate records. Existing report projections are a useful safer pattern.
- **Recommended solution:** Explicit role-appropriate DTOs, minimal public verification fields, expiring uploads/generated artifacts, controlled exports, and an owner-approved retention/anonymization policy that preserves legitimate certificate audit history. Redact sensitive provider/log content. Do not invent a legal retention period or delete historical certificates automatically.
- **Files affected:** Certificate/bulk/auth responses, storage lifecycle, audit/email logging, database TTL/migrations and privacy documentation.
- **Complexity:** **M/L**.

### M-16 — Release, recovery and test evidence are insufficient for launch
- **Current implementation/evidence:** No tracked CI workflows, staging/production runbooks, backup/restore policy, rollback plan or load-test setup found in the targeted inventory. Tests exist for auth, reports, bulk and Resend, but `backend/tests/test_auth.py:26-52` still expects public access to now-protected admin endpoints. Its header assertions also do not establish current protections. PRD reports corrected Resend retesting, but retained `test_reports/iteration_4.json` and `test_reports/pytest/resend_integration_results.xml` still show the initial 3/9 failures. This does **not** prove email is currently failing; it means current success cannot be certified from those artifacts.
- **Risk:** Unmeasured capacity, stale tests, untested rollback/restore and no demonstrated release gate. Infrastructure may have external controls, but none were evidenced in this audit.
- **Recommended solution:** Reconcile tests with the authorized API contract and retain fresh evidence; add isolation/replay/injection/oversize/revocation/integrity/idempotency tests and complete lifecycle E2E. Add repeatable 10/100-user, 1k/10k-certificate and verification/report workloads only in isolated staging. CI should run lint/unit/integration/security/build checks. Establish separate environment secrets/data/storage, approved RPO/RTO, backups plus restore drills, compatible migration roll-forward/rollback and documented launch gates.
- **Files affected:** `backend/tests`, frontend E2E/test setup, test_reports, package scripts/CI, ARCHITECTURE/SECURITY/API/DEPLOYMENT/DATABASE/DISASTER_RECOVERY/ENVIRONMENT/README documents to be created after design approval.
- **Complexity:** **XL**. Operational evidence gap, not an assertion that external managed backups do not exist.

## 7. LOW

### L-01 — API compatibility/versioning strategy is undocumented
- **Current implementation/evidence:** Existing routes are mounted at `/api` (`app.js:32-37,48`); no versioned contract/deprecation policy found.
- **Risk:** Future pagination/schema/security changes can break current clients unnecessarily.
- **Recommended solution:** Document current contracts, add an additive `/api/v1` strategy when changing contracts, and retain compatibility or provide an explicit migration window. Do not rename all routes as an audit fix.
- **Files affected:** app/routes, frontend API client, API documentation/contract tests.
- **Complexity:** **S/M**.

### L-02 — Architecture and build/dependency reproducibility documentation have drifted
- **Current implementation/evidence:** Attached summary still describes SendGrid, public verification and UUID identifiers; actual code differs. Both projects track npm and Yarn lockfiles. Frontend `package.json:23-28` contains invalid `last-ready`, worked around by a tracked `.env.production` BROWSERSLIST override. No broader tracked architecture/environment docs were found.
- **Risk:** A different install/build path or future maintainer can reproduce different dependencies or rely on nonexistent security behavior.
- **Recommended solution:** Update the architectural map to reality, choose/document one locked package-manager workflow, make build configuration explicit, and document exceptions. Keep the existing React/Express architecture; no framework migration is implied.
- **Files affected:** CODEBASE_SUMMARY/architecture docs, frontend build configuration, both package/lockfile workflows.
- **Complexity:** **S/M**.

## 8. Read-only observations and evidence limitations

### Database snapshot (preview only)

| Collection | Observation |
|---|---|
| users, sessions, organizations, organization_memberships | Only implicit `_id` index; intended auth indexes absent |
| email_verification_tokens | Only `_id`; no expiry index |
| password_reset_tokens, login_attempts | Collections absent at inspection; no index evidence |
| certificates | `_id` plus nonunique `(event_id,cert_id)`; 16 records, all missing direct organization_id |
| events | `_id`, `(organization_id,date)`, `(status,report_delivery.status)`; 9 records, 1 missing organization_id |
| templates | Only `_id`; 2 records, both missing organization_id |
| bulk_jobs/bulk_records | Only `_id`; no jobs available for live worker-state inspection |
| bulk_uploads | Only `_id`; 3 records, all missing organization_id |
| audit_logs | Only `_id` index |

These counts do not establish ownership and must not drive automatic assignment. Certificates can currently derive a relationship from events, but existing writers do not enforce its authorization.

### Secrets/configuration findings

- Current tracked backend/frontend credential `.env` files were not found. `.gitignore` excludes `.env` and common key files; the tracked `frontend/.env.production` contains only the nonsecret BROWSERSLIST key.
- The limited tracked-file scan found no provider-key/private-key/credentialed-MongoURI literal matches; it found password literals in tests. Test fixture passwords are not automatically production secrets, but must never provision production users.
- Real provider credentials were supplied in prior conversation context; treat their handling/rotation as an operational secret-management responsibility and never copy them into docs. This audit did not change/rotate them or claim they were committed.
- Git history, external secret stores, deployed credentials and IAM/DB privileges were not audited. A clean pattern scan is not proof that no secret has ever leaked.

### Testing status

Read-only HTTP/index/config/dependency checks completed. **No new functional, destructive, email-delivery, browser or load regression suite was run.** The application was not modified or represented as fixed. Existing test artifacts have the limitations described in M-16. Real Resend sandbox mode is configured; no email calls were mocked or sent in this audit.

## 9. Proposed P0 design for owner approval — NOT IMPLEMENTED

### First increment: close the access boundary
1. Fix the shared organization resolver before relying on it anywhere.
2. Agree invite/approval versus separate-organization onboarding; stop implicit shared-tenant editor enrollment and public bootstrap.
3. Apply existing RBAC plus ownership to all private operations, including upload/job/artifact and issuance relationships. Explicitly define read-only shared seed templates versus tenant-owned templates.
4. Prepare an operator-reviewed, dry-run ownership migration. Leave unknown records inaccessible; never infer owners from email/event names or the current user.
5. Replace reflected CORS with exact origins and add CSRF defense for cookie mutations. Disable production recovery-link disclosure/fail invalid configuration.
6. Add isolated negative tests: anonymous, guest/viewer/editor, two-org admins, operator-shaped org inputs, foreign event/template/certificate/job IDs, untrusted origins and denied mutations.

### Next increment: reliable identity/session invariants
1. Move index setup into awaited post-connect migrations and verify uniqueness/TTL after duplicate review.
2. Keep existing JWT/bcrypt/cookie approach; implement immediate session invalidation and atomic token rotation/consumption with concurrent-tab tests.
3. Design full-entropy public IDs, versioned certificate snapshots/integrity, audited revocation and a truly public minimal verification contract without breaking legacy QR IDs.
4. Patch reachable dependency vulnerabilities and enforce immediate workload/file budgets before broader traffic.

### Then follow the agreed master phases
Validated APIs/files → certificate integrity/public verification → audit/observability → indexed pagination → durable/idempotent work → private storage → security/regression/load tests → release/recovery configuration. Reuse the existing modular monolith. MongoDB-backed worker claims are a viable first design; introduce additional queue infrastructure only if measured throughput/operations justify it.

## 10. Production launch gates (all require evidence, not compilation)

- [ ] Owner approves P0 design and onboarding/legacy-ownership policy.
- [ ] All privileged actions have permissions and tested tenant isolation, including report resolver and bulk artifacts.
- [ ] CORS/CSRF, recovery-token handling, session invalidation, atomic rotation and required indexes pass tests.
- [ ] Unique unpredictable public IDs, immutable certificate content, auditable revocation and minimal anonymous verification work end-to-end.
- [ ] Hardened parsers/exports, dependency triage and bounded resource admission are verified.
- [ ] Jobs/outbox recover from restart/partial failure and duplicate submission without duplicate issuance.
- [ ] Private artifact storage works across replicas; no filename overwrite or missing-file success.
- [ ] Request IDs, safe errors/logs, audit events, readiness, metrics/alerts and graceful shutdown are exercised.
- [ ] Production config, sender-domain verification, recipient routing, DB least privilege/TLS and storage access are validated.
- [ ] Privacy/retention policy, backups, approved RPO/RTO and tested restore/rollback exist.
- [ ] CI/staging, fresh lifecycle/security evidence and measured load/capacity limits exist.

**Changes made in this phase:** audit documentation and PRD audit status only. **Architecture/database/API changes, fixes, migrations, new infrastructure and tests added:** none. **Next action:** review this report and approve/refine the first-increment design before any implementation.