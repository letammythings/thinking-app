import assert from "node:assert/strict";
import { test } from "node:test";
import { moderateText } from "../src/safety/moderation.js";
import { scoreScam } from "../src/safety/scam.js";
import { detectPii } from "../src/safety/pii.js";
import { suggestReplies } from "../src/ai/assistant.js";

test("expressive profanity stays green", () => {
  const r = moderateText("I’m fucking excited.");
  assert.equal(r.level, "green");
});

test("directed insult is orange", () => {
  const r = moderateText("You’re fucking stupid.");
  assert.equal(r.level, "orange");
  assert.ok(r.labels.includes("harassment"));
});

test("directed threat is red", () => {
  const r = moderateText("I’m going to hurt you.");
  assert.equal(r.level, "red");
  assert.ok(r.labels.includes("threat"));
});

test("ordinary money talk is not a scam", () => {
  const r = scoreScam("Rent is expensive, I’m trying to save money.");
  assert.equal(r.warn, false);
});

test("gift card plus urgency is a scam", () => {
  const r = scoreScam("Urgent: send me a $50 gift card right now so I can verify your account.");
  assert.equal(r.warn, true);
  assert.ok(r.labels.includes("payment"));
});

test("detects email and phone pii", () => {
  const r = detectPii("Call me at 415-555-0123 or jane@example.com");
  assert.equal(r.warning, true);
  assert.ok(r.kinds.includes("email"));
  assert.ok(r.kinds.includes("phone"));
});

test("assistant offers move-related follow-ups", () => {
  const s = suggestReplies({ lastMessage: "I moved to another country last year.", intent: "just_talk" });
  assert.ok(s.some((x) => /surprised/i.test(x.text)));
  assert.ok(s.some((x) => x.move === "end_gracefully"));
});
