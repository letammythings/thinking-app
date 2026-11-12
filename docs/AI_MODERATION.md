# AI Moderation and Assistance

## Goals

- Distinguish expressive language from directed abuse
- Catch scams without labeling ordinary conversations
- Help people continue a conversation without taking it over
- Keep a human review path

## Severity

| Level | Meaning | Automated action |
| --- | --- | --- |
| GREEN | Normal | None |
| YELLOW | Potentially problematic | Log; may prompt a gentle client hint |
| ORANGE | Likely harassment, sexual solicitation, hate, or scam | Hold/hide content, notify user, queue review |
| RED | Credible threat, exploitation, or severe safety issue | Hide content, suspend pending review if confidence is high |

Uncertain + RED/ORANGE ⇒ queue, do not permanent-ban.

## Context rules (heuristic model)

The built-in classifier is **not** a profanity list.

Examples:

| Text | Expected |
| --- | --- |
| “I’m fucking excited.” | GREEN — self, emotion |
| “You’re fucking stupid.” | ORANGE — directed insult |
| “I’m going to hurt you.” | RED — directed threat |
| “I want to hurt myself.” | YELLOW/ORANGE — self-harm crisis path, not a ban of the other party |
| “Send me a $50 gift card so I can verify” | ORANGE — scam |
| “Rent is expensive, I’m trying to save money.” | GREEN |

Signals:

- Directed second-person + slur/insult
- Threat verbs + target
- Sexual solicitation toward the other person
- Hate slurs
- Scam clusters (money + urgency + off-platform + secrecy)
- PII shapes (phone, email, IBAN/card-like, OTP)

When `OPENAI_API_KEY` is present, yellow+ text can receive a second-pass JSON classification. The heuristic decision is the floor; the LLM cannot downgrade a high-confidence RED threat.

## Scam model

Independent of toxicity. Features:

- Payment / crypto / gift card / “investment”
- Move off-platform (WhatsApp, Telegram, “text me”)
- Fake emergency + money
- Romance + isolation + money (slow burn: repeated compliments + ask)
- Banking / verification codes
- Suspicious links
- Near-duplicate messages to many people
- High outbound velocity

Threshold: `SCAM_SHIELD_THRESHOLD` (default 0.72).

## Conversation assistant

`POST /v1/conversations/:id/assist`

Returns 3–5 suggestions, each with a move type:

- ask_follow_up
- share_experience
- go_deeper
- change_subject
- end_gracefully

The model only sees the last few messages (redacted PII). It does not receive emails or user IDs.

Without an LLM key, suggestions are generated from the last message using intent-aware templates (still useful, not random lorem).

## Question generation

Seeded editorial questions ship with the product. An optional job can draft more; drafts land in admin for approval. The app never auto-publishes raw model output.

## Future

- Voice transcription → same pipeline
- Translation
- Cultural-context notes
- Conversation summaries (user-requested only)
