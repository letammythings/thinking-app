const root = document.getElementById("app");
let token = localStorage.getItem("thinking.admin");

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || "Failed");
  return data;
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function loginView() {
  root.innerHTML = `<div class="card" style="margin:48px auto;max-width:420px">
    <p class="kicker">Restricted</p>
    <h2>Thinking admin</h2>
    <input id="email" placeholder="Admin email" />
    <input id="password" type="password" placeholder="Password" />
    <p class="error" id="err"></p>
    <button class="btn" id="go">Enter</button>
  </div>`;
  go.onclick = async () => {
    try {
      const data = await api("/v1/auth/login", { method: "POST", body: { email: email.value, password: password.value } });
      if (data.me.account.role !== "admin" && data.me.account.role !== "moderator") throw new Error("Not an admin account.");
      token = data.token;
      localStorage.setItem("thinking.admin", token);
      dashboard();
    } catch (e) {
      err.textContent = e.message;
    }
  };
}

async function dashboard() {
  const [health, reports, moderation, analytics, questions] = await Promise.all([
    api("/v1/admin/health"),
    api("/v1/admin/reports"),
    api("/v1/admin/moderation"),
    api("/v1/admin/analytics"),
    api("/v1/admin/questions"),
  ]);
  root.innerHTML = `
    <div class="topbar"><h1 class="brand serif">Thinking · Admin</h1><span class="sub">${health.users} people · ${health.openReports} open reports</span></div>
    <article class="card"><p class="kicker">System</p>
      <p>${health.conversations} conversations · ${health.messages} messages · ${Math.round(health.uptime)}s uptime</p>
      <p class="meta">Events: ${analytics.events.map((e) => `${e.name} ${e.c}`).join(" · ") || "none yet"}</p>
    </article>
    <article class="card"><p class="kicker">Reports</p>
      ${reports.reports.map((r) => `<div class="answer"><div class="meta">${escape(r.category)} · ${escape(r.status)} · ${escape(r.target_type)}</div>
        <p>${escape(r.details || "")}</p>
        ${r.status === "open" ? `<div class="row">
          <button class="btn" data-res="${r.id}" data-act="dismiss">Dismiss</button>
          <button class="btn" data-res="${r.id}" data-act="warn">Warn</button>
          <button class="btn" data-res="${r.id}" data-act="suspend">Suspend</button>
          <button class="btn" data-res="${r.id}" data-act="ban">Ban</button>
        </div>` : ""}</div>`).join("") || "<p>Queue is clear.</p>"}
    </article>
    <article class="card"><p class="kicker">Moderation</p>
      ${moderation.events.slice(0, 12).map((e) => `<p class="meta">${escape(e.severity)} · ${escape(e.action)} · ${escape(e.labels)}</p>`).join("")}
    </article>
    <article class="card"><p class="kicker">Questions</p>
      <input id="np" placeholder="New editorial question" />
      <button class="btn" id="nq">Publish</button>
      ${questions.questions.slice(0, 8).map((q) => `<p>${escape(q.prompt)} <button data-hide="${q.id}">Hide</button></p>`).join("")}
    </article>`;
  root.querySelectorAll("[data-res]").forEach((b) => b.addEventListener("click", async () => {
    await api(`/v1/admin/reports/${b.dataset.res}/resolve`, { method: "POST", body: { action: b.dataset.act } });
    dashboard();
  }));
  nq.onclick = async () => {
    await api("/v1/admin/questions", { method: "POST", body: { prompt: np.value, featured: true } });
    dashboard();
  };
  root.querySelectorAll("[data-hide]").forEach((b) => b.addEventListener("click", async () => {
    await api(`/v1/admin/questions/${b.dataset.hide}`, { method: "PATCH", body: { status: "hidden" } });
    dashboard();
  }));
}

if (token) dashboard().catch(loginView);
else loginView();
