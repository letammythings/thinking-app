# Security

## Threat model (MVP)

| Threat | Approach |
| --- | --- |
| Account takeover | scrypt passwords, hashed sessions, reset tokens expire, no email enumeration in production responses |
| Session theft | HttpOnly cookies for web; iOS stores token in Keychain; tokens hashed at rest |
| Abuse of anonymity | Accountable `users` row, rate limits, trust gates, device session history |
| IDOR | Authorization checks on conversation membership, media tokens, admin role |
| Mass account creation | Rate limit register/login by IP (in-memory) + email normalization |
| Secret leakage | `.env` gitignored; `.env.example` only; no keys in the iOS binary except public API URL |
| XSS on admin/web | Escape rendered text; JSON APIs; CSP headers |
| Path traversal on media | IDs only, files stored by generated id |
| Privilege escalation | Admin routes require `role in (admin, moderator)` + audit log |
| LLM prompt injection | Assistant output is suggestion-only; never executed as a command |

## Authentication

- Email + password
- Sign in with Apple (server verifies identity token against Apple JWKS)
- Sessions: 32-byte random, SHA-256 stored, sliding expiry
- Logout revokes the current session; “log out all devices” revokes all
- Password reset: hashed single-use token. In development the token is returned once so the flow can be tested without SMTP.

## Authorization

- Users can only read conversations they belong to
- Blocked pairs cannot message, request, or see each other in discovery
- Media URLs are signed and short-lived
- Admin UI and `/v1/admin/*` require admin/moderator role
- Internal user IDs never appear in other users’ payloads

## Privacy commitments

Never expose to other users:

- email, phone, exact address, exact location
- internal user id
- IP address
- trust score
- moderation notes
- birth date (age range is optional and user-chosen)

Minimize collection. Do not store precise GPS.

## Headers and transport

Production must terminate TLS. The API sets:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY` on admin
- `Cache-Control: no-store` on authenticated JSON
- CORS allowlist via `PUBLIC_URL`

## Secrets

Required in production:

- `SESSION_SECRET` (≥ 48 random bytes)
- `BOOTSTRAP_ADMIN_PASSWORD` changed from default
- Apple and APNs keys on disk, not in git

## Account recovery

Email reset tokens. Apple users recover through Apple. Architecture allows adding a second factor later without schema rewrite (`users.totp_secret` reserved as nullable).

## App Store / legal notes

- Account deletion is required and implemented
- Sign in with Apple is required if any other third-party login is offered; email is first-party
- Age gate is 18+
- UGC requires report/block (implemented)
- Privacy nutrition labels: email (account), user content, product interaction; no tracking networks in MVP
