# API

Base URL: `PUBLIC_URL` (local default `http://127.0.0.1:8787`)

JSON over HTTPS. Authenticated routes send:

```
Authorization: Bearer <session-token>
```

Web also sets an HttpOnly cookie. Other users never appear as `user_id` — only `identityId`.

Errors:

```json
{ "error": { "code": "rate_limited", "message": "Please wait a moment." } }
```

## Auth

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/v1/auth/register` | email, password, birthDate, ageConfirmed |
| POST | `/v1/auth/login` | email, password |
| POST | `/v1/auth/apple` | identityToken |
| POST | `/v1/auth/logout` | |
| POST | `/v1/auth/logout-all` | |
| POST | `/v1/auth/forgot` | |
| POST | `/v1/auth/reset` | token, password |
| GET | `/v1/me` | account + active identity + preferences |
| PATCH | `/v1/me` | personality card, region, languages |
| DELETE | `/v1/me` | account deletion |
| GET | `/v1/me/export` | JSON export of the user’s data |

## Onboarding

| POST | `/v1/onboarding/identity` | optional displayName; otherwise generated |
| POST | `/v1/onboarding/interests` | slugs |
| POST | `/v1/onboarding/complete` | |

## Discover and search

| GET | `/v1/home` | question of the day, waiting, answers, notes, culture, advice, matches |
| GET | `/v1/search?q=` | questions, notes, advice, topics — relevance, not popularity |
| GET | `/v1/categories` | |
| GET | `/v1/interests` | |
| GET | `/v1/reference/countries` | |
| GET | `/v1/reference/languages` | |

## Questions

| GET | `/v1/questions` | filter: category, kind, saved |
| POST | `/v1/questions` | prompt, categoryId, kind |
| GET | `/v1/questions/:id` | |
| POST | `/v1/questions/:id/save` | |
| DELETE | `/v1/questions/:id/save` | |
| GET | `/v1/questions/:id/answers` | |
| POST | `/v1/questions/:id/answers` | body and/or voiceId |
| POST | `/v1/answers/:id/replies` | |
| POST | `/v1/answers/:id/converse` | intent, firstMessage |

## Notes / advice / culture

| GET/POST | `/v1/notes` | |
| POST | `/v1/notes/:id/replies` | |
| POST | `/v1/notes/:id/react` | |
| POST | `/v1/notes/:id/converse` | |
| GET/POST | `/v1/advice` | |
| POST | `/v1/advice/:id/replies` | |
| GET | `/v1/culture` | cultural questions + answers |

## Conversations

| GET | `/v1/conversations` | |
| GET | `/v1/conversations/:id` | messages included (paged) |
| POST | `/v1/conversations/:id/messages` | body, voiceId, confirmPii |
| POST | `/v1/conversations/:id/read` | |
| POST | `/v1/conversations/:id/end` | |
| POST | `/v1/conversations/:id/mute` | |
| POST | `/v1/conversations/:id/assist` | |
| POST | `/v1/matches` | start a stranger conversation |
| POST | `/v1/conversation-requests/:id/accept` | |
| POST | `/v1/conversation-requests/:id/decline` | |

Message send may return `409` with `code: pii_warning` or `scam_warning` unless confirmed.

## Voice

| POST | `/v1/voice` | multipart field `file` |
| GET | `/v1/voice/:id` | metadata |
| GET | `/media/:token` | short-lived audio |

## Safety

| POST | `/v1/reports` | targetType, targetId, category, details |
| GET | `/v1/blocks` | |
| POST | `/v1/blocks` | identityId |
| DELETE | `/v1/blocks/:identityId` | |
| POST | `/v1/mutes` | identityId |
| POST | `/v1/restricts` | identityId |
| GET | `/v1/safety` | center payload + my reports |

## Notifications

| GET | `/v1/notifications` | |
| POST | `/v1/notifications/read` | ids or all |
| PATCH | `/v1/me/notifications` | preference flags |
| POST | `/v1/push-tokens` | token, platform |

## Admin (`role=admin|moderator`)

| GET | `/v1/admin/health` | |
| GET | `/v1/admin/reports` | |
| POST | `/v1/admin/reports/:id/resolve` | action, notes |
| GET | `/v1/admin/users/:id` | internal, audit-logged |
| POST | `/v1/admin/users/:id/enforce` | warn/restrict/suspend/ban |
| POST | `/v1/admin/users/:id/reverse` | |
| GET | `/v1/admin/moderation` | |
| GET | `/v1/admin/questions` | |
| POST | `/v1/admin/questions` | |
| PATCH | `/v1/admin/questions/:id` | |
| GET | `/v1/admin/analytics` | |
| GET | `/v1/admin/audit` | |

## WebSocket

`GET /ws?token=<session-token>`

Client → server: `{ "type": "ping" }`  
Server → client: event envelopes listed in ARCHITECTURE.md

## Analytics (client)

`POST /v1/events` `{ "name": "onboarding_completed", "properties": { ... } }`

No message bodies. No identifiers of other users.
