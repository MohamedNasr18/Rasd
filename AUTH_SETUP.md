# Authentication setup

This document covers the environment variables and external providers required by the
Rasd authentication system (email/password + OTP, Google sign-in, guest scans and guest
scan migration).

Nothing here is required for development except `AUTH_SECRET` being left at its
development fallback: without `SMTP_HOST` verification codes are printed to the backend
console, and without `GOOGLE_CLIENT_ID` the Google button shows a clear "unavailable"
message instead of failing silently.

---

## 1. Backend (`rasd-backend/.env`)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `AUTH_SECRET` | Production: yes | dev fallback | HMAC key for OTP codes. **The backend refuses to start in production when it is missing.** Generate with `openssl rand -base64 48`. Changing it invalidates all outstanding OTP codes (sessions are unaffected). |
| `SESSION_TTL_DAYS` | No | `30` | Lifetime of an authenticated session. Sessions are opaque random tokens stored hashed in the `Session` table; expiry is enforced server-side. |
| `OTP_TTL_MINUTES` | No | `10` | Validity window of an email verification code. |
| `OTP_RESEND_COOLDOWN_SECONDS` | No | `60` | Minimum delay before "Resend code" is accepted (enforced on the backend, mirrored by the UI countdown). |
| `OTP_MAX_ATTEMPTS` | No | `5` | Wrong-code attempts before the OTP is locked; the user must request a new one. |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth **Web** client ID. Enables Google sign-in and is also served to the frontend through `GET /auth/config`. |
| `SMTP_HOST` | No | — | SMTP host. When unset, verification codes are logged to the backend console (development only — never enable this in production). |
| `SMTP_PORT` | No | `587` | SMTP port. Port 465 implies TLS automatically. |
| `SMTP_SECURE` | No | auto | Set to `true` to force implicit TLS. |
| `SMTP_USER` / `SMTP_PASS` | No | — | SMTP credentials. Omit for unauthenticated relay. |
| `SMTP_FROM` | No | `Rasd <no-reply@rasd.app>` | From header for verification emails. |
| `FRONTEND_URL` | No | `http://localhost:3001` | Allowed CORS origin with credentials. Must match the exact origin the browser uses (scheme + host + port). |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (Prisma). |
| `REDIS_HOST` / `REDIS_PORT` | Yes | — | BullMQ queues for scans and reports. |

Run `npx prisma migrate deploy` after pulling: the auth work ships migrations for
`User`, `EmailOtp`, `Session`, `GoogleAccount`, `GuestSession` and the scan ownership
columns (`userId`, `guestSessionId`).

## 2. Frontend (`rasd-frontend/.env.local`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Yes | Backend base URL, e.g. `http://localhost:3000`. All auth requests are sent with `credentials: 'include'` so the session cookie is attached. |

The Google client ID is deliberately **not** a frontend build-time variable: it is read
at runtime from `GET /auth/config`, so one build works for every environment.

## 3. Google Cloud Console

1. Create (or reuse) a project at <https://console.cloud.google.com>.
2. **APIs & Services → OAuth consent screen**: choose External (or Internal for a
   Workspace org), fill the app name and support email, and add every domain you serve
   the app from to **Authorized domains**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins** (no paths, no trailing slash):
     - `http://localhost:3001`
     - production origin, e.g. `https://rasd.app`
   - Authorized redirect URIs are not needed — the app uses Google Identity Services
     (`accounts.google.com/gsi/client`) with an ID token, which is posted to
     `POST /auth/google` and verified server-side with `google-auth-library`
     against `GOOGLE_CLIENT_ID`.
4. Copy the client ID into `GOOGLE_CLIENT_ID` in the backend `.env` and restart the
   backend. The frontend picks it up automatically on the next dialog open.

Google accounts whose email is not verified by Google are rejected. The first Google
sign-in creates the account; a later Google sign-in links to the existing account by
email. If an email already belongs to a password account, the accounts are linked only
after the ID token proves Google owns that email; a Google account that was already
linked to a different user is rejected instead of being silently reassigned.

## 4. Email delivery (SMTP)

Any transactional provider works (Postmark, SES, Resend SMTP, Mailgun, Gmail app
password for testing). Example:

```dotenv
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=<server token>
SMTP_PASS=<server token>
SMTP_FROM="Rasd <no-reply@yourdomain.com>"
```

Verify the sending domain with the provider (SPF/DKIM) so codes reach the inbox.
If `SMTP_HOST` is unset the backend logs:

```
[dev] Verification code for user@example.com: 123456 (valid 10 minutes)
```

That fallback only makes sense locally.

If outbound connections go through a TLS-inspecting proxy or antivirus (common on
Windows dev machines), Node rejects the SMTP certificate chain with
`self-signed certificate in certificate chain`. Start the backend with the system
certificate store instead:

```bash
node --use-system-ca dist/main.js
# or: set NODE_OPTIONS=--use-system-ca
```

## 5. Cookies and origins

The app uses two httpOnly cookies set by the backend:

| Cookie | Lifetime | Purpose |
| --- | --- | --- |
| `rasd_session` | `SESSION_TTL_DAYS` | Authenticated session (random token; only its SHA-256 hash is stored). |
| `rasd_guest` | 1 year | Anonymous guest identity; only its SHA-256 hash is stored. Cleared once the guest scan is migrated to an account. |

Both are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when `NODE_ENV=production`.
Because of `SameSite=Lax`, the frontend and backend must be served from the **same
site** in production (for example `rasd.app` and `api.rasd.app`, or a reverse proxy on
one origin). Cross-site hosting requires switching to `SameSite=None; Secure` and
HTTPS on both origins. CORS must keep `credentials: true` and an exact
`FRONTEND_URL`.

## 6. Behaviour notes

- Passwords are hashed with `scrypt` (N=16384, r=8, p=1, 64-byte key) with a random
  salt per password. Plaintext passwords are never stored or logged.
- OTP codes are 6 digits from `crypto.randomInt`, stored only as an HMAC-SHA256 of
  `userId:code` keyed with `AUTH_SECRET`, single-use, and bound to one user.
- Rate limits are applied per IP and per identifier to signup, login, OTP verify,
  OTP resend and Google sign-in. They are in-memory and therefore per backend
  instance; use a shared store (e.g. Redis) before scaling horizontally.
- A guest may complete exactly one successful scan. The limit is enforced in the
  database against the hashed guest cookie, so clearing `localStorage` or the
  frontend state does not grant another scan. A crawl that produced no page results
  does not count as the guest's scan.
- Guest scans are migrated inside a transaction after email verification or a
  successful password/Google login. The guest cookie is cleared only after the server
  confirms the migration. If the migration fails the session is kept and the UI
  offers a retry (`POST /auth/migrate-guest`).
- Scan access: a signed-in user sees only their own scans; a guest sees only scans
  tied to their guest session; scans created before authentication existed (no owner)
  remain public. Everything else returns 404.
