const root = document.getElementById("app");
const state = {
  token: localStorage.getItem("thinking.token"),
  me: null,
  tab: "home",
  view: "boot",
  payload: null,
  error: "",
  interests: [],
  selectedInterests: [],
};

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (opts.body && !(opts.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, { ...opts, headers, body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || "Request failed");
    err.code = data.error?.code;
    err.extra = data.error;
    throw err;
  }
  return data;
}

function go(view, payload) {
  state.view = view;
  state.payload = payload;
  state.error = "";
  render();
}

function nav(tab) {
  state.tab = tab;
  go(tab);
}

function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function top(subtitle) {
  return `<div class="topbar"><div><h1 class="brand serif">Thinking</h1><div class="sub">${escape(subtitle)}</div></div>
    <button class="btn secondary" id="bell">Inbox</button></div>`;
}

function navBar() {
  const tabs = [
    ["home", "Home"],
    ["questions", "Questions"],
    ["notes", "Notes"],
    ["talks", "Talks"],
    ["you", "You"],
  ];
  return `<nav class="nav">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${state.tab === id ? "on" : ""}">${label}</button>`).join("")}</nav>`;
}

function screen(inner, subtitle = "Someone interesting is waiting to talk.") {
  root.innerHTML = `${top(subtitle)}${inner}${state.view === "welcome" || state.view === "register" ? "" : navBar()}`;
  document.getElementById("bell")?.addEventListener("click", () => go("inbox"));
  root.querySelectorAll(".nav button").forEach((b) => b.addEventListener("click", () => nav(b.dataset.tab)));
}

async function boot() {
  if (!state.token) return go("welcome");
  try {
    state.me = await api("/v1/me");
    if (!state.me.account.onboardingCompleted) return go("onboarding");
    nav("home");
  } catch {
    state.token = null;
    localStorage.removeItem("thinking.token");
    go("welcome");
  }
}

function welcome() {
  screen(`
    <section class="welcome">
      <p class="kicker">Anonymous to each other. Accountable to the room.</p>
      <h1 class="serif">People connect through thoughts, not followers.</h1>
      <p class="sub">Answer a question. Meet a stranger. Talk like a human.</p>
      <div class="card">
        <div class="error" id="err"></div>
        <input id="email" type="email" placeholder="Email" />
        <input id="password" type="password" placeholder="Password" />
        <div class="row">
          <button class="btn" id="login">Sign in</button>
          <button class="btn secondary" id="to-reg">Create account</button>
        </div>
      </div>
    </section>`, "A quieter kind of social.");
  document.getElementById("to-reg").onclick = () => go("register");
  document.getElementById("login").onclick = async () => {
    try {
      const data = await api("/v1/auth/login", { method: "POST", body: { email: email.value, password: password.value } });
      state.token = data.token;
      localStorage.setItem("thinking.token", data.token);
      state.me = data.me;
      if (!state.me.account.onboardingCompleted) return go("onboarding");
      nav("home");
    } catch (e) {
      document.getElementById("err").textContent = e.message;
    }
  };
}

function register() {
  screen(`
    <div class="card">
      <p class="kicker">Adults only</p>
      <h2>Create a private account</h2>
      <p class="meta">Strangers will see a generated name, never your email.</p>
      <div class="error" id="err"></div>
      <input id="email" type="email" placeholder="Email" />
      <input id="password" type="password" placeholder="Password (10+ characters)" />
      <label class="meta">Birth date</label>
      <input id="birth" type="date" />
      <label class="meta"><input id="age" type="checkbox" /> I confirm I am 18 or older</label>
      <div class="row" style="margin-top:16px">
        <button class="btn" id="create">Continue</button>
        <button class="btn ghost" id="back">I already have an account</button>
      </div>
    </div>`);
  document.getElementById("back").onclick = () => go("welcome");
  document.getElementById("create").onclick = async () => {
    try {
      if (!document.getElementById("age").checked) throw new Error("Please confirm you are 18 or older.");
      const data = await api("/v1/auth/register", {
        method: "POST",
        body: { email: email.value, password: password.value, birthDate: birth.value, ageConfirmed: true },
      });
      state.token = data.token;
      localStorage.setItem("thinking.token", data.token);
      state.me = data.me;
      go("onboarding");
    } catch (e) {
      document.getElementById("err").textContent = e.message;
    }
  };
}

async function onboarding() {
  const interests = await api("/v1/interests");
  state.interests = interests.interests;
  const name = state.me?.identity?.displayName || "Quiet Lantern";
  screen(`
    <div class="card">
      <p class="kicker">Your public self</p>
      <h2>Hello, ${escape(name)}</h2>
      <p class="meta">You can keep this name or choose another. No photos required.</p>
      <input id="display" value="${escape(name)}" />
      <input id="card1" placeholder="Curious traveler" />
      <input id="card2" placeholder="Loves food" />
      <input id="card3" placeholder="Learning languages" />
      <p class="meta">What are you curious about?</p>
      <div class="chips" id="chips">${state.interests.map((i) => `<button class="chip" data-slug="${i.slug}">${escape(i.name)}</button>`).join("")}</div>
      <div class="error" id="err"></div>
      <button class="btn" id="done" style="margin-top:16px">Enter Thinking</button>
    </div>`, "Become someone worth talking to.");
  root.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
    c.classList.toggle("on");
    state.selectedInterests = [...root.querySelectorAll(".chip.on")].map((x) => x.dataset.slug);
  }));
  document.getElementById("done").onclick = async () => {
    try {
      const personaCard = [card1.value, card2.value, card3.value].filter(Boolean);
      await api("/v1/onboarding/identity", { method: "POST", body: { displayName: display.value, personaCard } });
      if (state.selectedInterests.length) {
        await api("/v1/onboarding/interests", { method: "POST", body: { slugs: state.selectedInterests } });
      }
      state.me = await api("/v1/onboarding/complete", { method: "POST", body: {} });
      nav("home");
    } catch (e) {
      document.getElementById("err").textContent = e.message;
    }
  };
}

async function home() {
  const data = await api("/v1/home");
  const q = data.questionOfTheDay;
  screen(`
    ${q ? `<article class="card" data-open-q="${q.id}"><p class="kicker">Question of the day</p><h2>${escape(q.prompt)}</h2><p class="meta">Answer, then see who else is thinking about it.</p></article>` : ""}
    <article class="card"><p class="kicker">Waiting for a voice or a sentence</p>
      ${data.waiting.map((x) => `<p><button class="btn ghost" data-open-q="${x.id}">${escape(x.prompt)}</button></p>`).join("")}
    </article>
    <article class="card"><p class="kicker">Answers nearby</p>
      ${data.answers.map((a) => `<div class="answer"><div class="meta">${escape(a.author.displayName)} on “${escape(a.prompt)}”</div><p>${escape(a.body || "Voice answer")}</p>
      <button class="btn secondary" data-talk="${a.id}">Talk about this</button></div>`).join("") || "<p class='meta'>Be the first to answer today.</p>"}
    </article>
    <article class="card"><p class="kicker">Notes from strangers</p>
      ${data.notes.map((n) => `<div class="answer"><div class="meta">${escape(n.author.displayName)}</div><p class="serif">${escape(n.body)}</p></div>`).join("")}
    </article>
    <article class="card"><p class="kicker">Meet someone interesting</p>
      ${data.people.map((p) => `<div class="row" style="margin:8px 0"><div><strong>${escape(p.displayName)}</strong><div class="meta">${(p.personaCard || []).join(" · ")}</div></div>
      <button class="btn secondary" data-match="${p.id}">Say hello</button></div>`).join("") || "<p class='meta'>More people will appear as the room fills.</p>"}
    </article>
  `);
  root.querySelectorAll("[data-open-q]").forEach((b) => b.addEventListener("click", () => go("question", b.dataset.openQ)));
  root.querySelectorAll("[data-talk]").forEach((b) => b.addEventListener("click", () => startTalk(b.dataset.talk)));
  root.querySelectorAll("[data-match]").forEach((b) => b.addEventListener("click", () => match(b.dataset.match)));
}

async function questions() {
  const data = await api("/v1/questions");
  screen(`<div class="card"><p class="kicker">Ask the room</p>
    <textarea id="prompt" placeholder="A question that opens a conversation, not an argument."></textarea>
    <button class="btn" id="ask">Publish question</button></div>
    ${data.questions.map((q) => `<article class="card"><h2>${escape(q.prompt)}</h2><button class="btn secondary" data-open-q="${q.id}">Open</button></article>`).join("")}`);
  document.getElementById("ask").onclick = async () => {
    await api("/v1/questions", { method: "POST", body: { prompt: prompt.value } });
    questions();
  };
  root.querySelectorAll("[data-open-q]").forEach((b) => b.addEventListener("click", () => go("question", b.dataset.openQ)));
}

async function question(id) {
  const q = await api(`/v1/questions/${id}`);
  const a = await api(`/v1/questions/${id}/answers`);
  screen(`<article class="card"><p class="kicker">${escape(q.question.kind)}</p><h2>${escape(q.question.prompt)}</h2>
    <textarea id="ans" placeholder="Here’s what is true for me…"></textarea>
    <div class="row"><button class="btn" id="send">Share answer</button>
    <button class="btn secondary" id="save">Save</button></div></article>
    ${a.answers.map((x) => `<article class="card"><div class="meta">${escape(x.author.displayName)}</div><p>${escape(x.body || "Voice answer")}</p>
      <button class="btn secondary" data-talk="${x.id}">Start a conversation</button></article>`).join("")}`, "Listen first.");
  document.getElementById("send").onclick = async () => {
    await api(`/v1/questions/${id}/answers`, { method: "POST", body: { body: ans.value } });
    question(id);
  };
  document.getElementById("save").onclick = () => api(`/v1/questions/${id}/save`, { method: "POST", body: {} });
  root.querySelectorAll("[data-talk]").forEach((b) => b.addEventListener("click", () => startTalk(b.dataset.talk)));
}

async function startTalk(answerId) {
  const data = await api(`/v1/answers/${answerId}/converse`, {
    method: "POST",
    body: { intent: "just_talk", firstMessage: "I read your answer and would like to talk more." },
  });
  go("thread", data.conversationId);
}

async function match(identityId) {
  const data = await api("/v1/matches", {
    method: "POST",
    body: { identityId, intent: "cultural_exchange", firstMessage: "Hello — I’d like to hear a little about your world." },
  });
  go("thread", data.conversationId);
}

async function notes() {
  const data = await api("/v1/notes");
  screen(`<div class="card"><p class="kicker">Bulletin</p>
    <textarea id="note" placeholder="A thought, a lesson, something you wish people knew."></textarea>
    <button class="btn" id="leave">Leave a note</button></div>
    ${data.notes.map((n) => `<article class="card"><div class="meta">${escape(n.kind)} · ${escape(n.author.displayName)}</div>
      <p class="serif" style="font-size:22px">${escape(n.body)}</p>
      <div class="row"><button class="btn secondary" data-react="${n.id}">I felt this</button>
      ${n.conversationAllowed && n.author.id !== "editorial" ? `<button class="btn ghost" data-note-talk="${n.id}">Ask about it</button>` : ""}</div></article>`).join("")}`);
  document.getElementById("leave").onclick = async () => {
    await api("/v1/notes", { method: "POST", body: { body: note.value, kind: "thought" } });
    notes();
  };
  root.querySelectorAll("[data-react]").forEach((b) => b.addEventListener("click", () => api(`/v1/notes/${b.dataset.react}/react`, { method: "POST", body: { reaction: "felt" } })));
  root.querySelectorAll("[data-note-talk]").forEach((b) => b.addEventListener("click", async () => {
    const data = await api(`/v1/notes/${b.dataset.noteTalk}/converse`, { method: "POST", body: { intent: "just_talk" } });
    go("thread", data.conversationId);
  }));
}

async function talks() {
  const data = await api("/v1/conversations");
  screen(`${data.conversations.map((c) => `<article class="card"><div class="meta">${escape(c.intent.replaceAll("_", " "))} · ${escape(c.status)}</div>
    <h2>${escape(c.peer?.displayName || "Conversation")}</h2>
    <p class="meta">${escape(c.lastMessage?.body || "")}</p>
    ${c.scamWarned ? `<div class="warn">Scam Shield is watching this thread. Never send money or codes.</div>` : ""}
    <button class="btn" data-open="${c.id}">Open</button></article>`).join("") || "<div class='card'><p>No conversations yet. Answer a question and invite someone in.</p></div>"}`);
  root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => go("thread", b.dataset.open)));
}

async function thread(id) {
  const data = await api(`/v1/conversations/${id}`);
  screen(`<article class="card"><div class="meta">${escape(data.conversation.intent.replaceAll("_", " "))}</div>
    <h2>${escape(data.conversation.peer?.displayName || "Talk")}</h2>
    ${data.conversation.scamWarned ? `<div class="warn">⚠️ This conversation contains patterns commonly associated with scams. Never send money, passwords, verification codes, cryptocurrency, or banking information to someone you met here.</div>` : ""}
    <div class="thread" id="thread">${data.messages.map((m) => `<div class="bubble ${m.type === "system" ? "system" : m.mine ? "mine" : ""}">${escape(m.body || (m.voiceId ? "Voice message" : ""))}</div>`).join("")}</div>
    <textarea id="msg" placeholder="A real sentence."></textarea>
    <div class="row">
      <button class="btn" id="send">Send</button>
      <button class="btn secondary" id="help">I don’t know what to say</button>
      <button class="btn secondary" id="end">End gracefully</button>
      <button class="btn danger" id="block">Block</button>
    </div>
    <div id="ideas"></div>
    <div class="error" id="err"></div>
  </article>`, data.conversation.peer?.displayName || "Conversation");
  document.getElementById("send").onclick = () => sendMessage(id);
  document.getElementById("help").onclick = async () => {
    const s = await api(`/v1/conversations/${id}/assist`, { method: "POST", body: {} });
    document.getElementById("ideas").innerHTML = s.suggestions.map((x) => `<button class="chip idea">${escape(x.text)}</button>`).join("");
    root.querySelectorAll(".idea").forEach((b) => b.addEventListener("click", () => { msg.value = b.textContent; }));
  };
  document.getElementById("end").onclick = async () => { await api(`/v1/conversations/${id}/end`, { method: "POST", body: {} }); talks(); };
  document.getElementById("block").onclick = async () => {
    if (data.conversation.peer) await api("/v1/blocks", { method: "POST", body: { identityId: data.conversation.peer.id } });
    talks();
  };
}

async function sendMessage(id, extra = {}) {
  try {
    await api(`/v1/conversations/${id}/messages`, { method: "POST", body: { body: msg.value, ...extra } });
    thread(id);
  } catch (e) {
    if (e.code === "scam_warning") {
      document.getElementById("err").innerHTML = `<div class="warn">${escape(e.message)}</div>
        <button class="btn danger" id="rep">Report</button> <button class="btn" id="cont">Continue</button>`;
      document.getElementById("cont").onclick = () => sendMessage(id, { confirmScam: true });
      document.getElementById("rep").onclick = () => api("/v1/reports", { method: "POST", body: { targetType: "account", targetId: state.payload, category: "scam" } });
    } else if (e.code === "pii_warning") {
      document.getElementById("err").innerHTML = `<div class="warn">${escape(e.message)}</div><button class="btn" id="cont">Send anyway</button>`;
      document.getElementById("cont").onclick = () => sendMessage(id, { confirmPii: true });
    } else {
      document.getElementById("err").textContent = e.message;
    }
  }
}

async function you() {
  const me = await api("/v1/me");
  screen(`<article class="card"><p class="kicker">Personality card</p>
    <h2>${escape(me.identity?.displayName)}</h2>
    <p class="meta">${(me.identity?.personaCard || []).join(" · ")}</p>
    <p class="meta">Email stays private. Trust stays internal. No public score.</p>
    <div class="row">
      <button class="btn secondary" id="safety">Safety center</button>
      <button class="btn secondary" id="export">Export my data</button>
      <button class="btn danger" id="leave">Delete account</button>
      <button class="btn ghost" id="out">Sign out</button>
    </div></article>
    <article class="card"><p class="kicker">Culture & advice</p>
      <button class="btn secondary" id="culture">Cultural questions</button>
      <button class="btn secondary" id="advice">Advice from experience</button>
    </article>`);
  document.getElementById("out").onclick = async () => {
    await api("/v1/auth/logout", { method: "POST", body: {} });
    state.token = null;
    localStorage.removeItem("thinking.token");
    go("welcome");
  };
  document.getElementById("safety").onclick = () => go("safety");
  document.getElementById("culture").onclick = () => go("culture");
  document.getElementById("advice").onclick = () => go("advice");
  document.getElementById("export").onclick = async () => {
    const data = await api("/v1/me/export");
    alert("Export ready: " + data.answers.length + " answers, " + data.notes.length + " notes.");
  };
  document.getElementById("leave").onclick = async () => {
    if (confirm("Delete your account and public writing?")) {
      await api("/v1/me", { method: "DELETE" });
      state.token = null;
      localStorage.removeItem("thinking.token");
      go("welcome");
    }
  };
}

async function safety() {
  const data = await api("/v1/safety");
  screen(`<article class="card"><p class="kicker">Safety center</p><h2>Stay human. Stay safe.</h2>
    <ul>${data.rules.map((r) => `<li>${escape(r)}</li>`).join("")}</ul>
    <p class="meta">Blocked: ${data.blocked.map((b) => b.displayName).join(", ") || "no one"}</p>
  </article>`);
}

async function culture() {
  const data = await api("/v1/culture");
  screen(data.questions.map((q) => `<article class="card"><h2>${escape(q.prompt)}</h2><button class="btn secondary" data-open-q="${q.id}">Answer</button></article>`).join(""));
  root.querySelectorAll("[data-open-q]").forEach((b) => b.addEventListener("click", () => go("question", b.dataset.openQ)));
}

async function advice() {
  const data = await api("/v1/advice");
  screen(`<div class="card"><p class="kicker">Here is what happened to me</p>
    <p class="meta">Not professional advice — lived experience.</p>
    <input id="ap" placeholder="How did you…?" />
    <textarea id="ab" placeholder="Here’s what I did, and what it cost."></textarea>
    <button class="btn" id="post">Share</button></div>
    ${data.posts.map((p) => `<article class="card"><h2>${escape(p.prompt)}</h2><p>${escape(p.body || "")}</p><div class="meta">${escape(p.author.displayName)}</div></article>`).join("")}`);
  document.getElementById("post").onclick = async () => {
    await api("/v1/advice", { method: "POST", body: { prompt: ap.value, body: ab.value } });
    advice();
  };
}

async function inbox() {
  const data = await api("/v1/notifications");
  screen(data.notifications.map((n) => `<article class="card"><div class="meta">${escape(n.type)}</div><h2>${escape(n.title)}</h2><p>${escape(n.body)}</p></article>`).join("") || "<div class='card'>No notifications. We will not nag you.</div>");
}

async function render() {
  try {
    if (state.view === "welcome") return welcome();
    if (state.view === "register") return register();
    if (state.view === "onboarding") return onboarding();
    if (state.view === "home") return home();
    if (state.view === "questions") return questions();
    if (state.view === "question") return question(state.payload);
    if (state.view === "notes") return notes();
    if (state.view === "talks") return talks();
    if (state.view === "thread") return thread(state.payload);
    if (state.view === "you") return you();
    if (state.view === "safety") return safety();
    if (state.view === "culture") return culture();
    if (state.view === "advice") return advice();
    if (state.view === "inbox") return inbox();
  } catch (e) {
    screen(`<div class="card"><p class="error">${escape(e.message)}</p></div>`);
  }
}

boot();
