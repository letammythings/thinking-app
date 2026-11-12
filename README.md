# Thinking

A conversation app for strangers who meet through questions, not followers.

**Anonymous to each other. Accountable to the platform.**

This repository is a working product, not a mock: API, SQLite database, realtime messaging, voice notes, moderation, scam shield, admin, companion web client, and a native SwiftUI iOS app.

## Run locally

Requires **Node.js 22+**.

Create a file named `.env` in the project root with at least these two lines:

```
SESSION_SECRET=any-long-random-string
BOOTSTRAP_ADMIN_PASSWORD=pick-a-password
```

Then:

```bash
cd backend
npm install
npm run dev
```

Every other setting has a safe local default. The full list (port, database, voice limits, rate limits,
optional `OPENAI_API_KEY` for second-pass moderation) is in `backend/src/config.ts`.

- Companion app (full product loop): http://127.0.0.1:8787/app
- Admin: http://127.0.0.1:8787/admin  
  Log in with `admin@example.com` and the password you set
- API: http://127.0.0.1:8787/v1/health

```bash
cd backend && npm test      # 17 tests: API, auth, moderation, scam and PII detection
```

Tests and a TypeScript check run on every push (`.github/workflows/ci.yml`).

## iOS

Open `ios/Thinking.xcodeproj` in Xcode 16 or later (full Xcode, not only Command Line Tools).

1. Set your development team
2. Confirm `THINKING_API_BASE` in `Config.swift` (simulator can use `http://127.0.0.1:8787`)
3. Run on iPhone simulator or device
4. Grant microphone for voice notes

The SwiftUI source is complete and talks to the same API, but the iOS app has not been compiled and run in Xcode yet. What's done and what's left is in `docs/PROJECT_STATUS.md`.

## What is implemented

- Email auth, sessions, password reset, Sign in with Apple verification
- 18+ age gate
- Generated anonymous identities and personality cards
- Questions, answers, notes, advice, culture exchange
- Private text conversations + asynchronous voice
- Conversation assistant (heuristic; optional LLM)
- Report, block, mute, restrict, appeals
- Context-aware moderation and Scam Shield
- PII send warning
- In-app notifications and preferences
- Admin review, enforcement, audit log
- Account deletion and data export

## Docs

See `/docs` — product, architecture, database, security, trust, API, decisions, App Store.

## Why this stack

Documented in `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`. Short version: one Node process + SQLite locally so the product actually runs without Docker; Postgres schema is ready for production; SwiftUI is the App Store client.
