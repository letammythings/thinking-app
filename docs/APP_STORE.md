# App Store preparation

Thinking is an 18+ UGC social app. Review will focus on safety, Sign in with Apple (if other social logins exist), account deletion, and privacy.

## Identity

- Name: Thinking
- Bundle ID: `app.thinking.ios`
- Category: Social Networking
- Age rating: 17+ (UGC, infrequent mature themes possible in user text)

## Required before submit

- [ ] Apple Developer account and provisioning
- [ ] Sign in with Apple enabled (recommended even with email-only; required if any third-party login is added)
- [ ] Privacy Nutrition Labels completed
- [ ] Support URL + privacy policy URL live
- [ ] Account deletion in-app (implemented)
- [ ] Report and block (implemented)
- [ ] Age gate 18+ (implemented)
- [ ] No placeholder buttons
- [ ] Production API + TLS
- [ ] Reviewer demo account (seed script can create one)
- [ ] Voice microphone usage string
- [ ] Push entitlement only if APNs is live

## Info.plist usage strings

- `NSMicrophoneUsageDescription` — Record a voice answer or voice message for a conversation.
- `NSSpeechRecognitionUsageDescription` — not used in MVP; do not include.
- Location — not used. Do not include location keys.

## Privacy nutrition (MVP)

| Type | Purpose | Linked | Tracking |
| --- | --- | --- | --- |
| Email address | Account | Yes | No |
| User content | App functionality | Yes | No |
| Product interaction | Analytics (coarse) | No | No |

No advertising SDK. No precise location.

## Review notes to attach

Thinking is a conversation app for adults. Users meet through questions, not profiles or photos. All UGC can be reported and blocked. Accounts are accountable on the server while remaining pseudonymous to other people. Reviewer login: see release checklist.

## Release checklist

See `docs/PROJECT_STATUS.md` phase 20.
