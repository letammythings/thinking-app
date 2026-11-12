# Deployment

## Local (this repo)

Requires Node.js 22+. No Docker, Redis, or Postgres required.

```bash
cp .env.example .env
# set SESSION_SECRET and BOOTSTRAP_ADMIN_PASSWORD
cd backend
npm install
npm run dev
```

Open:

- Companion app: http://127.0.0.1:8787/app
- Admin: http://127.0.0.1:8787/admin
- API health: http://127.0.0.1:8787/v1/health

iOS: open `ios/Thinking.xcodeproj` in Xcode 16+, set the API base URL, run on a simulator or device.

```bash
npm test
```

## Production sketch (low ops)

1. Managed Postgres (`DATABASE_URL`)
2. Node 22 host (Fly.io, Render, or a single VM)
3. Object storage for `MEDIA_DIR` (S3/R2) — swap the media adapter
4. TLS terminator
5. Process supervisor (`node dist/index.js`)
6. Nightly backup of Postgres + media
7. Log retention ≤ 30 days unless legally required

CI (GitHub Actions template in `.github/workflows/ci.yml`):

- `npm test`
- Typecheck
- (When a Mac runner is available) `xcodebuild test`

## Environments

| Var | Dev | Prod |
| --- | --- | --- |
| `NODE_ENV` | development | production |
| `DATABASE_PATH` | ./data/thinking.sqlite | unused if `DATABASE_URL` set |
| `SESSION_SECRET` | generated | unique, rotated |
| SMTP | unused (reset token returned) | required for forgot-password |

## Monitoring

`GET /v1/health` returns process uptime, db ok, media dir writable.

Admin → System health shows report backlog, moderation queue, voice disk use.

## Logging

Structured JSON logs. Do not log access tokens, passwords, or message bodies in production (`LOG_LEVEL=info`).
