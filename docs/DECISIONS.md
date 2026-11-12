# Decisions

Format: PROBLEM / WHY IT MATTERS / RECOMMENDATION / TRADEOFF

---

## D001 — SQLite locally, Postgres in production

**PROBLEM:** This machine has no Docker, Postgres, or Redis. A Postgres-only backend would be unrunnable here.

**WHY IT MATTERS:** The brief requires a real, working system — not a paper architecture.

**RECOMMENDATION:** Use Node’s built-in SQLite for development and tests. Keep a Postgres schema in lockstep. Abstract queries so we do not depend on SQLite-only features beyond `AUTOINCREMENT` (we use string UUIDs).

**TRADEOFF:** Two dialects to maintain. Accepted for MVP. Do not use SQLite in a multi-region production deployment.

---

## D002 — One Node process instead of a service mesh

**PROBLEM:** The brief lists API, realtime, media, moderation, notifications, analytics as separate concerns.

**WHY IT MATTERS:** Premature split increases failure modes before the core loop is proven.

**RECOMMENDATION:** One Fastify process. Extract voice transcription / LLM workers later.

**TRADEOFF:** A single process is a single crash domain. Supervisors and health checks mitigate this.

---

## D003 — Companion web client

**PROBLEM:** Full Xcode is not installed (only Command Line Tools). The iOS app cannot be compiled on this Mac today.

**WHY IT MATTERS:** We still need to prove the product loop with real users, auth, voice, and safety.

**RECOMMENDATION:** Ship a first-class SwiftUI app *and* a companion web client on the same API. The web client is for development, QA, and admin-adjacent verification — not a second consumer brand.

**TRADEOFF:** Two UIs to keep in sync. Shared API contract and design tokens reduce drift.

---

## D004 — Heuristic moderation first, LLM second

**PROBLEM:** True contextual moderation is asked for, but an API key may not exist, and LLM-only bans are legally and ethically risky.

**WHY IT MATTERS:** False permanent bans destroy trust. Missing threats is unsafe.

**RECOMMENDATION:** Ship a context-aware heuristic model that distinguishes self-directed vs other-directed language. Optional LLM second pass. No permanent ban on uncertain automation.

**TRADEOFF:** Heuristics can be gamed. Combine with velocity, reports, and review.

---

## D005 — No public reputation

**PROBLEM:** Safety wants signals; social products usually display scores.

**WHY IT MATTERS:** A visible score recreates follower culture and invites brigading.

**RECOMMENDATION:** Internal trust score only. Privileges change silently.

**TRADEOFF:** Users cannot “see progress.” We accept this. Return value is better conversations, not points.

---

## D006 — Store birth date, never show it

**PROBLEM:** Adults-only requires more than a checkbox to be honest.

**WHY IT MATTERS:** Checkbox-only age gates fail App Store and legal scrutiny for UGC social.

**RECOMMENDATION:** Collect birth date, reject under 18, expose only optional age *range* if the user opts in. Add a vendor later via `age_verification_provider`.

**TRADEOFF:** Birth date is sensitive. Locked down, never in public APIs, deleted with the account.

---

## D007 — Email first, Apple implemented but optional locally

**PROBLEM:** Sign in with Apple needs a paid developer account and certificates.

**WHY IT MATTERS:** Blocking all auth on Apple would make the app untestable.

**RECOMMENDATION:** Email auth is complete. Apple token verification is implemented and waits for keys.

**TRADEOFF:** Production App Store build should still offer Apple if any other third-party login appears.

---

## D008 — Voice retention, not infinite storage

**PROBLEM:** “Do not store audio permanently without a defined retention policy.”

**WHY IT MATTERS:** Cost, moderation debt, and privacy.

**RECOMMENDATION:** Default 90 days. Job deletes files. Metadata can remain as “expired” for thread continuity.

**TRADEOFF:** Old voice stories vanish. Users are told this in privacy settings.

---

## D009 — Discover-a-person is not dating

**PROBLEM:** Stranger matching looks like dating to users and to App Review.

**WHY IT MATTERS:** Wrong audience, higher scam/romance-bait risk, 17+ dating rules.

**RECOMMENDATION:** No photos, no swipe, required conversation intent, copy is “meet someone interesting.” Matching uses questions, interests, culture, and complementary perspectives.

**TRADEOFF:** Lower dopamine. That is the product.

---

## D010 — Monetization is out of MVP

**PROBLEM:** The brief does not specify revenue.

**WHY IT MATTERS:** Ads would poison the “no vanity / no bait” principle.

**RECOMMENDATION:** No ads, no coins, no paid boosts. Revisit later (tip jar / membership) only if it does not sell attention.

**TRADEOFF:** No revenue until the loop works. Correct.

---

## D011 — Advice is experiential, not professional

**PROBLEM:** “How did you…” can be read as licensed advice (medical, legal, financial).

**WHY IT MATTERS:** Legal risk.

**RECOMMENDATION:** Product copy: “People share what happened to them. This is not professional advice.” Report category covers dangerous advice.

**TRADEOFF:** Some users want “experts.” They are not the MVP audience.

---

## D012 — In-app notifications before APNs

**PROBLEM:** Push needs certificates and a device.

**WHY IT MATTERS:** A half-wired APNs integration looks like a placeholder.

**RECOMMENDATION:** Full in-app notification center + preferences. Token registration endpoint exists. APNs send is enabled only when keys are present.

**TRADEOFF:** Background alerts will not arrive on device until keys exist.
