# Database

Logical model is normalized and identical in SQLite (local) and PostgreSQL (production).

Internal `users.id` is never sent to other clients. Public references use `identities.id`.

## Entities

### Account and identity

- **users** — accountable account: email (unique, nullable if Apple-only), password hash, Apple subject, role, status, age confirmation, birth date (restricted), trust score, timestamps, soft delete
- **sessions** — hashed token, expiry, user agent, revoke time
- **password_resets** — hashed token, expiry, used_at
- **identities** — public persona: display name, personality card, optional country/region/age range/languages/interests
- **user_interests** — selected interest slugs
- **notification_preferences**
- **push_tokens**

### Content

- **categories**
- **questions** — prompt, category, kind (`daily`, `general`, `culture`, `advice`), featured flag
- **saved_questions**
- **answers** — text and/or voice
- **answer_replies**
- **notes** — bulletin thoughts with reply/conversation flags
- **note_replies**
- **note_reactions** — quiet, not a public score
- **advice_posts** / **advice_replies**

### Conversations

- **conversations** — origin (question/answer/note/advice/match), intent, status
- **conversation_members** — identity + accountable user_id, mute, last_read
- **conversation_requests**
- **messages** — text | voice | system
- **voice_assets** — path, duration, size, expiry

### Safety

- **reports**
- **blocks**
- **mutes**
- **restricts**
- **moderation_events**
- **appeals**
- **trust_events**
- **rate_limit_events**
- **audit_log**
- **analytics_events** — no IP, no precise location

### Reference

- **countries** — ISO code + name (no coordinates)
- **languages**
- **interests**

## Indexes (high traffic)

- `questions(status, created_at desc)`
- `questions(featured_on)`
- `answers(question_id, created_at)`
- `messages(conversation_id, created_at)`
- `conversation_members(user_id)`
- `reports(status, created_at)`
- `blocks(blocker_user_id, blocked_user_id)` unique
- `sessions(token_hash)` unique
- `users(email)` unique where not deleted
- `identities(user_id, is_active)`
- `voice_assets(expires_at)`
- `notifications(user_id, created_at desc)`

## Privacy and retention

| Data | Retention |
| --- | --- |
| Voice audio | `VOICE_RETENTION_DAYS` (default 90), then file + row deleted |
| Messages | Kept while conversation exists; hard-deleted with account |
| Email / birth date | Account lifetime; deleted on account deletion |
| Sessions | Expiry or logout |
| Analytics | Event name + coarse properties only; no message bodies |
| Reports / moderation | Kept for abuse prevention after account deletion, stripped of content where possible |
| IP addresses | Not stored in product tables. May appear in process logs; configure log retention in production. |

## Account deletion

1. Soft-delete user (`deleted_at`)
2. Revoke sessions
3. Tombstone public content (“This note was removed”)
4. Delete voice files
5. Keep report/moderation stubs for repeat-offender detection without public identity

## Migrations

- SQLite: `backend/src/db/schema.sql` applied on boot
- Postgres: `backend/src/db/schema.postgres.sql`

Keep column names aligned. The query layer uses standard SQL that both engines accept for the MVP query set.
