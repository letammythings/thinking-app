# Trust and Safety

Safety is a product feature, not a settings afterthought.

## Principle

Users are anonymous to each other and accountable to Thinking. Anonymity is not permission to harass, threaten, scam, or cycle accounts.

## User controls

| Control | Effect |
| --- | --- |
| Report | Creates a report on a message, voice, post, question, or account. Queued for admin. |
| Block | Hides both sides from each other. Ends active conversations. |
| Mute | Silences notifications from a conversation or identity |
| Restrict | Recipient can read; replies are held / limited (MVP: no new conversation requests) |
| Safety Center | How to report, scam advice, community rules, blocked list |

### Report categories

Harassment, bullying, threats, sexual content, hate, scam, asking for money, impersonation, spam, personal information, other.

## Trust score (internal only)

Not displayed. Starts at 45 for a new adult account.

Signals that raise trust: account age, completed conversations, answers that receive a reply (not a like count), no reports.

Signals that lower trust: reports that are upheld, blocks received in a short window, spam velocity, scam-shield hits, repeat content, failed age/honesty checks.

Used for:

- messages per hour
- conversation requests per day
- whether links are allowed
- whether discovery matching is available
- whether voice uploads are allowed after prior abuse

Never a public karma system.

## New-account limits

Default (configurable):

- 8 messages / hour
- 3 conversation requests / day
- no outbound links until trust ≥ 60
- voice allowed (product-critical) but capped at 60s until trust ≥ 55

## Enforcement ladder

1. **Warn** — in-app notice, content hidden from others if needed
2. **Restrict** — tighter rate limits, no new conversations
3. **Suspend** — temporary login block
4. **Ban** — permanent, with appeal

**Never permanently ban solely on an uncertain automated label.** Orange+ automated findings hide or hold content and queue review. Red + high-confidence threat (clear violent intent toward a person) can auto-suspend pending review.

## Repeat offenders

`moderation_events` + `trust_events` feed a repeat-offender count. A second upheld harassment report within 30 days jumps to suspend.

## Appeals

User submits an appeal tied to a moderation event. Admin can reverse. Reversal writes an audit row.

## Scam Shield

See also `AI_MODERATION.md`. If a conversation crosses the scam threshold, both people see a warning:

> This conversation contains patterns commonly associated with scams. Never send money, passwords, verification codes, cryptocurrency, or banking information to someone you met here.

Actions: Report · Block · Continue

Ordinary life talk about jobs, travel, or money stress must not trip the shield. The detector requires a combination of solicitation + off-platform / payment / urgency — not the word “money” alone.

## Personal information

Before send, the API can return `pii_warning` for phone, email, address-like strings, account numbers, passwords, or OTP-like codes. The client must confirm to send.

## Adults only

Onboarding stores age confirmation and birth date (restricted column). Under 18 is rejected. Stronger vendor verification can plug into `users.age_verification_provider` later.
