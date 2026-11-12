# Thinking — Product Specification

Thinking is a social conversation platform for strangers who meet through questions, experiences, and curiosity — not followers, photos, or status.

**Anonymous to each other. Accountable to the platform.**

## Vision

People open Thinking and immediately understand: someone interesting is waiting to talk to me.

The product is not a feed, not a dating app, and not a messaging utility. It is a place to ask, answer, listen, and continue a conversation — in text or asynchronous voice.

## Core loop (the product must prove this)

1. A person opens the app.
2. They encounter an interesting question.
3. They answer it.
4. Another stranger discovers that answer.
5. The stranger responds, or starts a conversation.
6. They continue through text or voice.
7. Both people feel safe.
8. The conversation can end naturally.
9. They want to come back and talk to someone else.

Everything else exists to support this loop.

## What we will not optimize for

- Follower counts, likes-as-status, or public karma
- Endless algorithmic scrolling
- Photo-first matching or swiping
- Time-spent as a success metric
- Engagement bait and notification loops

A ten-minute conversation that ends well is a success.

## Product risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Empty-room problem | Strangers need something to talk about or the app dies on day one | Seed high-quality questions, daily prompt, and sample notes. Discovery is question-first, not people-first. |
| Anonymity as cover for abuse | Harassment and scams thrive when identity feels disposable | Accountable backend identity, trust scores, rate limits, report/block, scam shield, device/session signals |
| Dating-app drift | Users will try to turn any stranger chat into dating or extraction | No photos as the matching surface. Conversation intent is required. Copy and design reject dating language. |
| Safety vs false positives | Over-blocking kills curiosity; under-blocking is unsafe | Severity levels, human review for uncertain automated bans, confirm-to-send for PII |
| Retention without vanity | Without likes, users may not feel a reason to return | Question of the day, unfinished conversations, “someone replied to your answer,” not streaks or badges |
| Cold conversations | People freeze after “hello” | Optional conversation assistant that suggests follow-ups; never auto-sends |
| Voice cost and misuse | Audio is expensive and harder to moderate | Retention window, duration caps, future transcription hook, report-a-voice-message |

## MVP (ship this first)

Must work end to end, with real data, not mock screens:

- Email authentication and session management
- Age confirmation (18+)
- Generated anonymous identity + optional personality card
- Home / discover built around questions and answers
- Browse, create, save, and answer questions (text + voice)
- Reply to an answer or start a private conversation from it
- Real-time text conversations with conversation intent
- Asynchronous voice messages (record, preview, send, play)
- Conversation assistant suggestions (on demand)
- Report, block, mute, restrict
- Scam Shield warnings
- PII share warning
- In-app notifications + preference controls
- Privacy settings, account deletion
- Admin review of reports and enforcement
- Seeded questions so the first user is not staring at emptiness

Deferred from MVP (architecture allows later):

- Sign in with Apple (implemented, requires Apple developer credentials)
- Push via APNs (token registration exists; sending is optional)
- Stronger age verification vendor
- Translation and cultural-context LLM extras
- Image attachments and reactions
- Rotating per-conversation identities (data model supports it)
- Human moderation queue staffing

## Major areas

### Home / Discover

Not a generic social feed. Sections are conversational invitations:

- Question of the day
- Questions waiting for answers
- Interesting recent answers
- Notes from strangers
- Cultural questions
- Advice asked from experience
- People you might enjoy talking to (interest + intent, never photo-swipe)

### Questions and answers

Categories exist to start conversations, not arguments. Answers can be text or voice. Another person can respond or start a private conversation from an answer.

### Conversations

Private, 1:1, text + voice. Required intent: Just talk, Ask me questions, Advice wanted, Just listen, Friendly discussion, Open debate, Cultural exchange.

No video calling.

### Conversation assistant

On-demand only. Suggests follow-ups, sharing your own experience, going deeper, changing subject, or ending gracefully. Never posts for the user.

### Bulletin / notes

Short public thoughts. Author chooses: public, replies allowed, conversation allowed. Reactions are quiet and not ranked as popularity.

### Advice

Framed as “here is what happened to me,” not professional counsel. Disclaimer in the product copy.

### Culture exchange

Optional country, broad region, age range, languages, interests. Never precise location.

### Discover a person

Intentional “meet someone interesting.” Matching uses interests, answers, intent, and complementary perspectives. No photo-first swipe.

## Identity

Public display is a generated name (Blue Lantern, Paper Crane) plus an optional personality card. Email, phone, exact location, and internal user IDs are never shown to other users.

## Success metrics (not vanity)

- Onboarding completion
- Questions answered
- Conversations started and completed (ended well, not abandoned after spam)
- Repeat conversations
- Voice used at least once
- Reports, blocks, moderation rate, scam-shield triggers
- 7-day return after a completed conversation

Do not optimize solely for session length.

## Audience

Adults only. The product is not marketed to minors. Architecture allows stronger age checks later.
