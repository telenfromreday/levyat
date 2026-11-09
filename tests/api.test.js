/* Runs the real API handlers against a small in-memory fake of Supabase. */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const path = require("path");

const tables = { organisations: [], memberships: [], statements: [], transactions: [], subscriptions: [], audit_log: [] };
let uid = 0;
const newId = () => "00000000-0000-4000-8000-" + String(++uid).padStart(12, "0");

class Q {
  constructor(t) { this.t = t; this.f = []; this.op = "select"; this.payload = null; this.opt = {}; this.one = null; this.ord = null; this.rng = null; this.lim = null; this.sel = false; }
  select() { this.sel = true; return this; }
  insert(p) { this.op = "insert"; this.payload = p; return this; }
  upsert(p, o) { this.op = "upsert"; this.payload = p; this.opt = o || {}; return this; }
  delete() { this.op = "delete"; return this; }
  eq(k, v) { this.f.push([k, v]); return this; }
  order(k, o) { this.ord = [k, !(o && o.ascending === false)]; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
  run() {
    const rows = tables[this.t];
    const match = (r) => this.f.every(([k, v]) => r[k] === v);
    let out;
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ id: newId(), created_at: new Date().toISOString(), ...r }));
      rows.push(...list); out = list;
    } else if (this.op === "upsert") {
      const key = this.opt.onConflict || "id", p = this.payload, ex = rows.find((r) => r[key] === p[key]);
      if (ex) { if (!this.opt.ignoreDuplicates) Object.assign(ex, p); out = [ex]; } else { const n = { ...p }; if (this.t === "subscriptions" && !n.status) n.status = "none"; rows.push(n); out = [n]; }
    } else if (this.op === "delete") {
      const gone = rows.filter(match); gone.forEach((g) => rows.splice(rows.indexOf(g), 1));
      if (this.t === "statements") gone.forEach((g) => { for (let i = tables.transactions.length - 1; i >= 0; i--) if (tables.transactions[i].statement_id === g.id) tables.transactions.splice(i, 1); });
      out = gone;
    } else {
      out = rows.filter(match);
      if (this.ord) out.sort((a, b) => (a[this.ord[0]] > b[this.ord[0]] ? 1 : -1) * (this.ord[1] ? 1 : -1));
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) out = out.slice(0, this.lim);
      if (this.t === "memberships") out = out.map((m) => ({ ...m, organisations: tables.organisations.find((o) => o.id === m.org_id) }));
    }
    if (this.one === "single") return { data: out[0], error: out[0] ? null : { message: "no row" } };
    if (this.one === "maybe") return { data: out[0] || null, error: null };
    return { data: out, error: null };
  }
}
const removed = [], deletedUsers = [];
const fake = {
  from: (t) => new Q(t),
  auth: { admin: { deleteUser: async (id) => { deletedUsers.push(id); return {}; } }, getUser: async (token) => (token.startsWith("tok-") ? { data: { user: { id: token.slice(4), email: token.slice(4) + "@x.co" } }, error: null } : { data: null, error: { message: "bad" } }) },
  storage: { from: () => ({ list: async (p) => ({ data: [{ name: "a.csv" }] }), createSignedUploadUrl: async (p) => ({ data: { path: p, token: "up-token" }, error: null }), remove: async (l) => { removed.push(...l); return {}; } }) },
};
require.cache[require.resolve("../lib/db")] = { id: "db", filename: "db", loaded: true, exports: { admin: () => fake } };

const call = async (handler, { method = "GET", url = "/", headers = {}, body } = {}) => {
  const req = { method, url, headers, body };
  let status, payload;
  const res = { setHeader() {}, set statusCode(v) { status = v; }, end(s) { payload = JSON.parse(s); } };
  await handler(req, res);
  return { status, body: payload };
};
const as = (u) => ({ authorization: "Bearer tok-" + u });
const rows = [
  { date: "2026-10-01", desc: "ENGEN FUEL", amt: -800, cat: "Transport & fuel", conf: "high", ok: true },
  { date: "2026-10-05", desc: "PAYSTACK PAYOUT", amt: 9000, cat: "Sales & customer payments", conf: "high", ok: true },
];

test("a signed-out request is refused", async () => {
  const r = await call(require("../api/statements"), { headers: {} });
  assert.equal(r.status, 401);
});

test("first sign-in creates the business, and saving then listing works", async () => {
  const me = await call(require("../api/me"), { headers: as("alice") });
  assert.equal(me.status, 200); assert.equal(me.body.org.role, "owner"); assert.equal(me.body.subscription_active, false);
  const up = await call(require("../api/upload-url"), { method: "POST", headers: as("alice"), body: { filename: "march.csv" } });
  assert.equal(up.status, 200); assert.match(up.body.path, new RegExp("^" + me.body.org.id + "/.+-march\\.csv$"));
  const save = await call(require("../api/statements"), { method: "POST", headers: as("alice"), body: { name: "March", rows, receipts: [{ supplier: "Engen", date: "2026-10-01", total: 800, vat: 104 }], file_path: up.body.path } });
  assert.equal(save.status, 200); assert.equal(save.body.count, 2);
  const list = await call(require("../api/statements"), { headers: as("alice") });
  assert.equal(list.body.statements.length, 1); assert.equal(list.body.statements[0].transaction_count, 2);
  const open = await call(require("../api/statements"), { url: "/api/statements?id=" + save.body.id, headers: as("alice") });
  assert.equal(open.body.rows.length, 2); assert.equal(open.body.rows[0].conf, "high"); assert.equal(open.body.summary.profit, 8200);
  assert.equal(tables.audit_log.some((a) => a.action === "create"), true);
});

test("one business cannot see or delete another business's statement", async () => {
  const id = tables.statements[0].id;
  const other = await call(require("../api/statements"), { url: "/api/statements?id=" + id, headers: as("bob") });
  assert.equal(other.status, 404);
  const del = await call(require("../api/statements"), { method: "DELETE", url: "/api/statements?id=" + id, headers: as("bob") });
  assert.equal(del.status, 404);
  assert.equal(tables.statements.length, 1);
});

test("a file path from another business is rejected", async () => {
  const r = await call(require("../api/statements"), { method: "POST", headers: as("bob"), body: { name: "x", rows, file_path: tables.statements[0].file_path } });
  assert.equal(r.status, 400);
});

test("the assistant endpoint answers from saved data", async () => {
  const r = await call(require("../api/ask"), { method: "POST", headers: as("alice"), body: { statement_id: tables.statements[0].id, question: "What is my profit?" } });
  assert.equal(r.status, 200); assert.match(r.body.answer, /R8 200,00/);
});

test("saving is blocked without a subscription when required, then allowed after payment", async () => {
  process.env.REQUIRE_SUBSCRIPTION = "true";
  const blocked = await call(require("../api/statements"), { method: "POST", headers: as("alice"), body: { name: "x", rows } });
  assert.equal(blocked.status, 402);
  process.env.PAYSTACK_SECRET_KEY = "sk_test_abc";
  const orgId = tables.organisations[0].id;
  const raw = JSON.stringify({ event: "charge.success", data: { customer: { email: "alice@x.co", customer_code: "CUS_9" }, metadata: { org_id: orgId } } });
  const sig = crypto.createHmac("sha512", "sk_test_abc").update(raw).digest("hex");
  const bad = await call(require("../api/billing/webhook"), { method: "POST", headers: { "x-paystack-signature": "nope" }, body: Buffer.from(raw) });
  assert.equal(bad.status, 401);
  const good = await call(require("../api/billing/webhook"), { method: "POST", headers: { "x-paystack-signature": sig }, body: Buffer.from(raw) });
  assert.equal(good.status, 200);
  const allowed = await call(require("../api/statements"), { method: "POST", headers: as("alice"), body: { name: "April", rows } });
  assert.equal(allowed.status, 200);
  process.env.REQUIRE_SUBSCRIPTION = "false";
});

test("deleting removes the statement, its transactions and its stored file", async () => {
  const st = tables.statements.find((s) => s.file_path);
  const r = await call(require("../api/statements"), { method: "DELETE", url: "/api/statements?id=" + st.id, headers: as("alice") });
  assert.equal(r.status, 200); assert.equal(removed.includes(st.file_path), true);
  assert.equal(tables.transactions.some((t) => t.statement_id === st.id), false);
});

test("deleting the account removes the business, its files and the sign-in", async () => {
  const org = tables.organisations[0];
  const no = await call(require("../api/account"), { method: "DELETE", headers: as("alice"), body: { confirm: "yes" } });
  assert.equal(no.status, 400);
  const r = await call(require("../api/account"), { method: "DELETE", headers: as("alice"), body: { confirm: "DELETE" } });
  assert.equal(r.status, 200);
  assert.equal(tables.organisations.some((o) => o.id === org.id), false);
  assert.equal(removed.includes(org.id + "/a.csv"), true);
  assert.deepEqual(deletedUsers, ["alice"]);
});
