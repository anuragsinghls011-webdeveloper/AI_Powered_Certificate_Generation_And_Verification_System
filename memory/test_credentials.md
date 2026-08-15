# CampusCert Pro — Test Credentials

## Test Admin (super_admin of default organization "CampusCert Demo")
- **Email:** `admin@campuscert.local`
- **Password:** `Admin@12345`
- **Role:** `super_admin`
- **Organization:** CampusCert Demo (default)

## Test Editor
- **Email:** `editor@campuscert.local`
- **Password:** `Editor@12345`
- **Role:** `editor`
- **Organization:** CampusCert Demo (default)

## Auth Endpoints
| Method | Path | Auth |
|-------:|:-----|:-----|
| POST | `/api/auth/register` | public |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | optional |
| POST | `/api/auth/logout-all` | required |
| POST | `/api/auth/refresh` | refresh-cookie |
| GET | `/api/auth/me` | required |
| POST | `/api/auth/switch-organization` | required |
| GET | `/api/auth/sessions` | required |
| DELETE | `/api/auth/sessions/:id` | required |
| POST | `/api/auth/verify-email` | public (token) |
| POST | `/api/auth/resend-verification` | required |
| POST | `/api/auth/forgot-password` | public |
| POST | `/api/auth/reset-password` | public (token) |
| POST | `/api/auth/change-password` | required |
| GET | `/api/auth/organizations` | required |
| GET | `/api/auth/members` | admin |
| PATCH | `/api/auth/members/:userId/role` | admin |
| GET | `/api/auth/audit-logs` | admin |

## Cookies
- `access_token` (HttpOnly, Secure, SameSite=None, 15 min)
- `refresh_token` (HttpOnly, Secure, SameSite=None, 7 days, path=/api/auth)

## Notes
- **Email delivery is in DEV MODE** (no SendGrid API key set). Verification and password-reset links are returned in the API response body under `link` for testing. To enable real emails, set `SENDGRID_API_KEY` and `SENDER_EMAIL` in `/app/backend/.env` and restart backend.
- Password policy: min 8 chars, at least one letter + one digit.
- Brute-force: 5 failed logins from same IP+email → 15-minute lockout.
- Rate limits: login 20/15min, register 20/hr, forgot-password 10/hr.
