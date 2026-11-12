# Project status

Lead: Product Architect  
Updated: 2026-09-12

## Current phase

Phase 1–16 are implemented in this repository as a single vertical slice: specification, backend, companion web, admin, iOS source, tests.

Xcode is **not** installed on the build machine (Command Line Tools only). iOS source is complete; binary compile is blocked until Xcode is installed.

## Phase board

| Phase | Name | Owner | Status | Tests | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Product specification | Architect | done | n/a | `docs/PRODUCT.md` |
| 2 | Technical architecture | Architect | done | n/a | `docs/ARCHITECTURE.md` |
| 3 | Database schema | Backend | done | db tests | SQLite + Postgres DDL |
| 4 | Backend foundation | Backend | done | health, schema | Fastify + SQLite |
| 5 | iOS foundation | iOS | done | blocked: no Xcode | SwiftUI project |
| 6 | Auth / onboarding | iOS + Backend | done | auth tests | Email; Apple ready |
| 7 | Questions / answers | Backend + iOS | done | API tests | |
| 8 | Conversations | Realtime | done | messaging tests | WS + REST |
| 9 | Voice | Realtime | done | upload tests | |
| 10 | Anonymous identity | Backend | done | identity tests | |
| 11 | Safety / moderation | Trust | done | abuse tests | |
| 12 | Scam protection | Trust | done | scam tests | |
| 13 | AI assistance | AI | done | assistant tests | Heuristic + optional LLM |
| 14 | Culture / advice / notes | Product | done | API tests | |
| 15 | Notifications | Backend | done | notification tests | In-app |
| 16 | Admin dashboard | Backend | done | permission tests | |
| 17 | Testing | QA | done | `npm test` | |
| 18 | Security audit | Security | in progress | permission + auth tests | See SECURITY.md |
| 19 | Performance | DevOps | in progress | indexes in place | |
| 20 | App Store | Release | blocked | n/a | Needs Apple account + Xcode |

## Feature tracker

| Feature | Requirements | Owner | Status | Dependencies | Known issues |
| --- | --- | --- | --- | --- | --- |
| Core conversation loop | Ask/answer/reply/talk/voice/safe | All | done | auth, db | Compile iOS locally blocked |
| Sign in with Apple | Token verify | Security | implemented | Apple keys | Untested against live Apple |
| APNs push | Send on events | DevOps | stub send | certs | Tokens stored |
| LLM moderation | Second pass | AI | optional | OPENAI_API_KEY | Heuristics always on |
| Human review staffing | 24/7 | Safety | n/a | people | Software queue exists |

## Status report

**COMPLETED:** Product docs, architecture, schema, runnable backend, companion web, admin, SwiftUI app source, automated tests.

**IN PROGRESS:** Security hardening review, performance pass.

**BLOCKED:** Native iOS compile and TestFlight (no Xcode / no Apple Developer account on this machine).

**RISKS:** Empty-room liquidity; scam false positives; App Review dating misclassification; voice moderation without transcription.

**NEXT:** Install Xcode, configure signing, run on simulator, point the app at a deployed API.
