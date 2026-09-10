# Local verification accounts

These accounts are for the isolated preview database, not production credentials.

- Admin: `reports.admin@example.com`
- Password: `Reports!2026Safe`
- Role: first registered user / `super_admin` of the default organization.
- Login uses the existing `/api/auth/login` cookie/JWT flow.

The tests create randomized editor/viewer accounts temporarily and delete them during teardown; no additional permanent login accounts are required.

Reusable test configuration comes from `REPORT_TEST_ADMIN_EMAIL` and `REPORT_TEST_ADMIN_PASSWORD` in the ignored backend `.env` or process environment. Never copy these preview credentials into production.