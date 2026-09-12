# Approved security-increment verification

Preserve the existing Express4/native MongoDB JWT+bcrypt cookie implementation.
Credentials: `/app/memory/test_credentials.md`. No public signup/bootstrap or recovery links.

1. Browser/cookie login: GET `/api/auth/csrf` with trusted Origin, retain cookies, POST login with Origin and returned X-CSRF-Token. Fetch a fresh CSRF token after login/refresh before writes. Cookies remain Secure/HttpOnly; bearer-only clients must provide a verified access JWT and no auth cookies for non-browser writes.
2. Verify `/auth/me`, refresh, logout, forgot-password generic responses (no token/link/provider disclosure), denied signup and preservation of existing accounts. Do not add session-invalidation/index fixes (M findings deferred).
3. Create isolated test users/memberships directly in the TEST database for admin/editor/viewer and a second organization; document temporary credentials and delete fixtures after testing. Verify permissions and foreign/unassigned resource denial for all private APIs.
4. Verify nested organization query rejection, arbitrary-Origin rejection, absent/wrong/cross-session CSRF rejection, working frontend writes and direct authorized downloads.
5. Verify bounded parsing/rendering, duplicate submission/retry/restart recovery, Mongo leases and tenant-scoped job/cancel/artifact operations. Inspect unique issuance/job indexes required by H-07 only.
6. Real provider acceptance tests must use the configured Resend sandbox and minimal sends. Clearly label any injected failure/test double. No claimed delivered inbox status without evidence.