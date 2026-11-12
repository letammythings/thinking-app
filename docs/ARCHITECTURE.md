# Architecture

## Why this stack

| Piece | Choice | Why |
| --- | --- | --- |
| iOS client | Swift / SwiftUI | Native App Store product, voice + notifications + Sign in with Apple |
| Companion web | Vanilla JS served by the API | Lets us run the real product loop without Xcode. Same API as iOS. Not a mock. |
| Admin | Same origin, session-gated HTML | Lowest operational complexity; audit logging in the API |
| API | Node.js 22+ TypeScript on Fastify | One process for HTTP, WebSocket, media, admin. Fastify is typed, fast, and small. |
| Database (dev) | SQLite via `node:sqlite` | Zero extra services on a laptop. Built into Node 22+. |
| Database (prod) | PostgreSQL | Same logical schema; see `schema.postgres.sql` |
| Realtime | WebSocket on the API process | Private 1:1 messaging without a second broker for MVP |
| Voice storage | Local disk now, S3-compatible later | `MEDIA_DIR` abstraction. Retention job deletes expired audio. |
| Auth | Email + scrypt passwords + opaque sessions | Sessions are hashed at rest. Apple Sign In is implemented and optional until keys exist. |
| Moderation | Heuristic pipeline + optional LLM | Works offline/without vendor keys. LLM upgrades context when `OPENAI_API_KEY` is set. |
| Push | In-app notifications now, APNs later | Avoids shipping a broken push integration. Tokens can be registered. |

**Rejected alternatives**

- Firebase / document DB: fights the normalized models and accountability requirements.
- Separate Go/Python services on day one: higher ops cost before the loop is proven.
- Redis required for MVP: rate limits and pub/sub live in SQLite + process memory; Redis is a later scale-out.
- Docker-only local setup: this machine has no Docker. The app must run with Node alone.

## System shape

```
iOS  ──┐
Web  ──┼── HTTPS / JSON ──► Fastify API ──► SQLite / Postgres
Admin──┘                      │
                              ├── WebSocket /ws
                              ├── /media (signed, short-lived)
                              └── moderation + trust + scam services
```

The API never returns:

- internal numeric/user UUIDs to other users (only public identity IDs)
- email, phone, IP, exact location
- trust scores or moderation notes
- other users’ session or device data

## Process model

One Node process:

1. Loads config from environment
2. Opens SQLite (or Postgres when `DATABASE_URL` is set)
3. Applies schema and seeds reference data if empty
4. Serves `/v1/*` JSON
5. Serves `/ws`
6. Serves `/app` (companion), `/admin`, `/media`
7. Runs hourly retention + trust decay jobs

Horizontal scale later: sticky WebSocket sessions or a Redis adapter; object storage for voice; Postgres primary.

## Auth model

- User row is the accountable account. Never shown to strangers.
- Identity row is the public persona. One active identity in MVP.
- Session token is a random 32-byte value. Only a SHA-256 hash is stored.
- Password: scrypt (Node crypto). No plaintext, no bcrypt native addon.
- Apple: identity token verified against Apple JWKS (`jose`).

## Realtime

After login, clients open `/ws?token=...`.

Events:

- `message.created`
- `conversation.updated`
- `scam.warning`
- `notification.created`
- `moderation.notice`

Server validates membership on every send. Blocked users cannot message.

## Voice

1. Client records locally, preview/cancel before upload
2. `POST /v1/voice` multipart
3. Server checks duration, size, MIME, account trust
4. File stored under `MEDIA_DIR/{yyyy}/{id}.m4a`
5. `expires_at = now + VOICE_RETENTION_DAYS`
6. Message references `voice_id`
7. Playback uses a short-lived media URL

Designed so a transcription/moderation worker can be attached later without changing the client contract.

## AI features

| Feature | Default | With `OPENAI_API_KEY` |
| --- | --- | --- |
| Conversation assistant | Template + heuristic follow-ups | Contextual suggestions |
| Question generation | Seeded + templated | Optional generation job |
| Moderation | Context-aware heuristics | LLM second pass on yellow+ |
| Scam detection | Pattern + velocity model | LLM assist on borderline |
| Translation | Not in MVP | Later |

AI never auto-sends a message.

## Environments

- `development` — SQLite, verbose logs, password-reset token returned once
- `test` — temp SQLite file, seeded fixtures
- `production` — Postgres recommended, secrets required, reset tokens only emailed/logged securely

## Key modules (`backend/src`)

- `config.ts` — env
- `db/` — schema, access, seed
- `http/` — Fastify app + routes
- `realtime/` — WebSocket hub
- `safety/` — moderation, scam, PII, trust, rate limits
- `ai/` — assistant
- `auth/` — sessions, apple, passwords
- `jobs/` — retention, analytics rollup
