import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { bootstrap, openDatabase } from "../src/db/index.js";

const dir = mkdtempSync(join(tmpdir(), "thinking-"));
mkdirSync(join(dir, "media"), { recursive: true });
const db = openDatabase(join(dir, "t.sqlite"));
await bootstrap(db);
const app = await buildApp(db);

before(async () => {
  await app.ready();
});

after(async () => {
  await app.close();
  db.close();
});

async function register(email: string, birth = "1994-02-02") {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "correct-horse-battery",
      birthDate: birth,
      ageConfirmed: true,
    },
  });
  return { status: res.statusCode, body: res.json() };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

test("health is public", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/health" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
});

test("rejects minors", async () => {
  const { status, body } = await register("kid@example.com", "2015-01-01");
  assert.equal(status, 403);
  assert.equal(body.error.code, "underage");
});

test("register, onboard, answer, converse, block", async () => {
  const a = await register("amber@example.com");
  const b = await register("blue@example.com");
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.ok(a.body.token);
  assert.ok(a.body.me.identity.displayName);
  assert.equal(a.body.me.account.hasEmail, true);
  assert.ok(!JSON.stringify(a.body).includes("password_hash"));

  await app.inject({
    method: "POST",
    url: "/v1/onboarding/complete",
    headers: auth(a.body.token),
    payload: {},
  });
  await app.inject({
    method: "POST",
    url: "/v1/onboarding/complete",
    headers: auth(b.body.token),
    payload: {},
  });

  const home = await app.inject({ method: "GET", url: "/v1/home", headers: auth(a.body.token) });
  assert.equal(home.statusCode, 200);
  const qid = home.json().questionOfTheDay.id;
  assert.ok(qid);

  const answered = await app.inject({
    method: "POST",
    url: `/v1/questions/${qid}/answers`,
    headers: auth(a.body.token),
    payload: { body: "I believe kindness is a practice, not a mood." },
  });
  assert.equal(answered.statusCode, 200, answered.body);

  const answers = await app.inject({
    method: "GET",
    url: `/v1/questions/${qid}/answers`,
    headers: auth(b.body.token),
  });
  const answerId = answers.json().answers[0].id;

  const convo = await app.inject({
    method: "POST",
    url: `/v1/answers/${answerId}/converse`,
    headers: auth(b.body.token),
    payload: { intent: "just_talk", firstMessage: "Thank you for writing that." },
  });
  assert.equal(convo.statusCode, 200, convo.body);
  const conversationId = convo.json().conversationId;

  const send = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/messages`,
    headers: auth(a.body.token),
    payload: { body: "I’m glad it landed." },
  });
  assert.equal(send.statusCode, 200, send.body);

  const thread = await app.inject({
    method: "GET",
    url: `/v1/conversations/${conversationId}`,
    headers: auth(a.body.token),
  });
  assert.equal(thread.statusCode, 200);
  assert.ok(thread.json().messages.length >= 2);
  assert.ok(!JSON.stringify(thread.json()).includes("amber@example.com"));

  const assist = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/assist`,
    headers: auth(a.body.token),
    payload: {},
  });
  assert.equal(assist.statusCode, 200);
  assert.ok(assist.json().suggestions.length >= 3);

  const end = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/end`,
    headers: auth(a.body.token),
    payload: {},
  });
  assert.equal(end.statusCode, 200);

  const block = await app.inject({
    method: "POST",
    url: "/v1/blocks",
    headers: auth(a.body.token),
    payload: { identityId: b.body.me.identity.id },
  });
  assert.equal(block.statusCode, 200);

  const again = await app.inject({
    method: "POST",
    url: `/v1/answers/${answerId}/converse`,
    headers: auth(b.body.token),
    payload: { intent: "friendly_discussion" },
  });
  assert.equal(again.statusCode, 403);
});

test("pii warning requires confirm", async () => {
  const a = await register("pii-a@example.com");
  const b = await register("pii-b@example.com");
  const home = await app.inject({ method: "GET", url: "/v1/home", headers: auth(a.body.token) });
  const qid = home.json().waiting[0].id;
  const ans = await app.inject({
    method: "POST",
    url: `/v1/questions/${qid}/answers`,
    headers: auth(a.body.token),
    payload: { body: "A short lived experience about starting over." },
  });
  const list = await app.inject({ method: "GET", url: `/v1/questions/${qid}/answers`, headers: auth(b.body.token) });
  const answerId = list.json().answers.find((x: { id: string }) => x.id === ans.json().id).id;
  const convo = await app.inject({
    method: "POST",
    url: `/v1/answers/${answerId}/converse`,
    headers: auth(b.body.token),
    payload: { intent: "just_talk" },
  });
  const warn = await app.inject({
    method: "POST",
    url: `/v1/conversations/${convo.json().conversationId}/messages`,
    headers: auth(b.body.token),
    payload: { body: "Email me at person@example.com" },
  });
  assert.equal(warn.statusCode, 409);
  assert.equal(warn.json().error.code, "pii_warning");
  const ok = await app.inject({
    method: "POST",
    url: `/v1/conversations/${convo.json().conversationId}/messages`,
    headers: auth(b.body.token),
    payload: { body: "Email me at person@example.com", confirmPii: true },
  });
  assert.equal(ok.statusCode, 200);
});

test("scam shield warns on gift cards", async () => {
  const a = await register("scam-a@example.com");
  const b = await register("scam-b@example.com");
  const home = await app.inject({ method: "GET", url: "/v1/home", headers: auth(a.body.token) });
  const qid = home.json().waiting[1].id;
  await app.inject({
    method: "POST",
    url: `/v1/questions/${qid}/answers`,
    headers: auth(a.body.token),
    payload: { body: "I learned to ask for help sooner." },
  });
  const list = await app.inject({ method: "GET", url: `/v1/questions/${qid}/answers`, headers: auth(b.body.token) });
  const convo = await app.inject({
    method: "POST",
    url: `/v1/answers/${list.json().answers[0].id}/converse`,
    headers: auth(b.body.token),
    payload: { intent: "just_talk" },
  });
  const warn = await app.inject({
    method: "POST",
    url: `/v1/conversations/${convo.json().conversationId}/messages`,
    headers: auth(b.body.token),
    payload: { body: "Urgent: send me a gift card right now so I can verify you." },
  });
  assert.equal(warn.statusCode, 409);
  assert.equal(warn.json().error.code, "scam_warning");
});

test("abuse message is rejected", async () => {
  const a = await register("kind@example.com");
  const b = await register("rude@example.com");
  const home = await app.inject({ method: "GET", url: "/v1/home", headers: auth(a.body.token) });
  const qid = home.json().questionOfTheDay?.id || home.json().waiting[0].id;
  await app.inject({
    method: "POST",
    url: `/v1/questions/${qid}/answers`,
    headers: auth(a.body.token),
    payload: { body: "Sunday is for long walks and a slow breakfast." },
  });
  const list = await app.inject({ method: "GET", url: `/v1/questions/${qid}/answers`, headers: auth(b.body.token) });
  const convo = await app.inject({
    method: "POST",
    url: `/v1/answers/${list.json().answers[0].id}/converse`,
    headers: auth(b.body.token),
    payload: { intent: "open_debate" },
  });
  const bad = await app.inject({
    method: "POST",
    url: `/v1/conversations/${convo.json().conversationId}/messages`,
    headers: auth(b.body.token),
    payload: { body: "You’re fucking stupid." },
  });
  assert.equal(bad.statusCode, 400);
});

test("report and admin review", async () => {
  const user = await register("reporter@example.com");
  const target = await register("target@example.com");
  const report = await app.inject({
    method: "POST",
    url: "/v1/reports",
    headers: auth(user.body.token),
    payload: { targetType: "account", targetId: target.body.me.identity.id, category: "harassment", details: "Repeated insults." },
  });
  assert.equal(report.statusCode, 200);

  const forbidden = await app.inject({ method: "GET", url: "/v1/admin/health", headers: auth(user.body.token) });
  assert.equal(forbidden.statusCode, 403);

  const admin = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { email: "admin@example.com", password: "change-me-now" },
  });
  assert.equal(admin.statusCode, 200, admin.body);
  const health = await app.inject({ method: "GET", url: "/v1/admin/health", headers: auth(admin.json().token) });
  assert.equal(health.statusCode, 200);
  const resolve = await app.inject({
    method: "POST",
    url: `/v1/admin/reports/${report.json().id}/resolve`,
    headers: auth(admin.json().token),
    payload: { action: "warn", notes: "First incident" },
  });
  assert.equal(resolve.statusCode, 200);
});

test("account deletion prevents login", async () => {
  const user = await register("gone@example.com");
  const del = await app.inject({ method: "DELETE", url: "/v1/me", headers: auth(user.body.token) });
  assert.equal(del.statusCode, 200);
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { email: "gone@example.com", password: "correct-horse-battery" },
  });
  assert.equal(login.statusCode, 401);
});

test("voice upload and media token", async () => {
  const user = await register("voice@example.com");
  const boundary = "----ThinkingBoundary";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.m4a"\r\nContent-Type: audio/mp4\r\n\r\n`,
    ),
    Buffer.from("fake-aac-bytes"),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const up = await app.inject({
    method: "POST",
    url: "/v1/voice",
    headers: {
      ...auth(user.body.token),
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  });
  assert.equal(up.statusCode, 200, up.body);
  const id = up.json().id;
  const meta = await app.inject({ method: "GET", url: `/v1/voice/${id}`, headers: auth(user.body.token) });
  assert.equal(meta.statusCode, 200);
  assert.ok(meta.json().url.startsWith("/media/"));
});

test("forgot password returns token in development/test", async () => {
  await register("resetme@example.com");
  const forgot = await app.inject({
    method: "POST",
    url: "/v1/auth/forgot",
    payload: { email: "resetme@example.com" },
  });
  assert.equal(forgot.statusCode, 200);
  assert.ok(forgot.json().resetToken);
  const reset = await app.inject({
    method: "POST",
    url: "/v1/auth/reset",
    payload: { token: forgot.json().resetToken, password: "new-password-123" },
  });
  assert.equal(reset.statusCode, 200);
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { email: "resetme@example.com", password: "new-password-123" },
  });
  assert.equal(login.statusCode, 200);
});
