-- Production PostgreSQL schema. Column names match SQLite.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  password_hash TEXT,
  apple_sub TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  age_confirmed INTEGER NOT NULL DEFAULT 0,
  birth_date TEXT,
  age_verification_provider TEXT,
  trust_score DOUBLE PRECISION NOT NULL DEFAULT 45,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_active
  ON users(email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_apple_active
  ON users(apple_sub) WHERE apple_sub IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  display_name TEXT NOT NULL,
  persona_card TEXT,
  country_code TEXT,
  region TEXT,
  age_range TEXT,
  languages TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS identities_user_active ON identities(user_id, is_active);

CREATE TABLE IF NOT EXISTS interests (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_interests (
  user_id TEXT NOT NULL REFERENCES users(id),
  interest_slug TEXT NOT NULL REFERENCES interests(slug),
  PRIMARY KEY (user_id, interest_slug)
);

CREATE TABLE IF NOT EXISTS countries (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS languages (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  author_identity_id TEXT REFERENCES identities(id),
  category_id TEXT REFERENCES categories(id),
  prompt TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'general',
  is_featured INTEGER NOT NULL DEFAULT 0,
  featured_on TEXT,
  conversation_allowed INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS questions_status_created ON questions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS questions_featured ON questions(featured_on);
CREATE INDEX IF NOT EXISTS questions_kind ON questions(kind, status);

CREATE TABLE IF NOT EXISTS saved_questions (
  user_id TEXT NOT NULL REFERENCES users(id),
  question_id TEXT NOT NULL REFERENCES questions(id),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, question_id)
);

CREATE TABLE IF NOT EXISTS voice_assets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  path TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS voice_expires ON voice_assets(expires_at);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  author_identity_id TEXT NOT NULL REFERENCES identities(id),
  body TEXT,
  voice_id TEXT REFERENCES voice_assets(id),
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS answers_question ON answers(question_id, created_at DESC);

CREATE TABLE IF NOT EXISTS answer_replies (
  id TEXT PRIMARY KEY,
  answer_id TEXT NOT NULL REFERENCES answers(id),
  author_identity_id TEXT NOT NULL REFERENCES identities(id),
  body TEXT,
  voice_id TEXT REFERENCES voice_assets(id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  author_identity_id TEXT REFERENCES identities(id),
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'thought',
  replies_allowed INTEGER NOT NULL DEFAULT 1,
  conversation_allowed INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS notes_status_created ON notes(status, created_at DESC);

CREATE TABLE IF NOT EXISTS note_replies (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id),
  author_identity_id TEXT NOT NULL REFERENCES identities(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS note_reactions (
  note_id TEXT NOT NULL REFERENCES notes(id),
  identity_id TEXT NOT NULL REFERENCES identities(id),
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (note_id, identity_id)
);

CREATE TABLE IF NOT EXISTS advice_posts (
  id TEXT PRIMARY KEY,
  author_identity_id TEXT NOT NULL REFERENCES identities(id),
  prompt TEXT NOT NULL,
  body TEXT,
  category_id TEXT REFERENCES categories(id),
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS advice_replies (
  id TEXT PRIMARY KEY,
  advice_id TEXT NOT NULL REFERENCES advice_posts(id),
  author_identity_id TEXT NOT NULL REFERENCES identities(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  origin_type TEXT NOT NULL,
  origin_id TEXT,
  question_id TEXT,
  intent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scam_warned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  identity_id TEXT NOT NULL REFERENCES identities(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  last_read_at TIMESTAMPTZ,
  muted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, identity_id)
);

CREATE INDEX IF NOT EXISTS conversation_members_user ON conversation_members(user_id);

CREATE TABLE IF NOT EXISTS conversation_requests (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  from_identity_id TEXT NOT NULL REFERENCES identities(id),
  to_identity_id TEXT NOT NULL REFERENCES identities(id),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_identity_id TEXT REFERENCES identities(id),
  type TEXT NOT NULL,
  body TEXT,
  voice_id TEXT REFERENCES voice_assets(id),
  moderation_level TEXT NOT NULL DEFAULT 'green',
  created_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS messages_convo ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_user_id TEXT,
  category TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolver_user_id TEXT,
  resolution TEXT
);

CREATE INDEX IF NOT EXISTS reports_status ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_user_id TEXT NOT NULL REFERENCES users(id),
  blocked_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (blocker_user_id, blocked_user_id)
);

CREATE TABLE IF NOT EXISTS mutes (
  user_id TEXT NOT NULL REFERENCES users(id),
  identity_id TEXT NOT NULL REFERENCES identities(id),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, identity_id)
);

CREATE TABLE IF NOT EXISTS restricts (
  user_id TEXT NOT NULL REFERENCES users(id),
  identity_id TEXT NOT NULL REFERENCES identities(id),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, identity_id)
);

CREATE TABLE IF NOT EXISTS moderation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  content_type TEXT,
  content_id TEXT,
  source TEXT NOT NULL,
  severity TEXT NOT NULL,
  labels TEXT,
  action TEXT NOT NULL,
  reviewer_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS appeals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  moderation_event_id TEXT NOT NULL REFERENCES moderation_events(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  signal TEXT NOT NULL,
  delta DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_lookup ON rate_limit_events(user_id, action, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  replies INTEGER NOT NULL DEFAULT 1,
  answers INTEGER NOT NULL DEFAULT 1,
  conversations INTEGER NOT NULL DEFAULT 1,
  voice INTEGER NOT NULL DEFAULT 1,
  safety INTEGER NOT NULL DEFAULT 1,
  moderation INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  properties TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS media_tokens (
  token TEXT PRIMARY KEY,
  voice_id TEXT NOT NULL REFERENCES voice_assets(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL
);
