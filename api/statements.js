const { route, send, readBody, HttpError } = require("../lib/http");
const { requireUser, ensureOrg } = require("../lib/auth");
const { requireSubscription } = require("../lib/gate");
const { cleanRows, cleanReceipts } = require("../lib/validate");
const { summarise } = require("../lib/analysis");
const { admin } = require("../lib/db");

const CHUNK = 500;

function queryId(req) {
  const id = new URL(req.url, "http://x").searchParams.get("id");
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Invalid id");
  return id;
}

/* List, open, save and delete the signed-in user's statements */
module.exports = route(["GET", "POST", "DELETE"], async (req, res) => {
  const user = await requireUser(req);
  const org = await ensureOrg(user);
  const db = admin();
  const id = queryId(req);

  if (req.method === "GET" && !id) {
    const r = await db.from("statements").select("id, name, bank, created_at, transaction_count").eq("org_id", org.id).order("created_at", { ascending: false }).limit(100);
    if (r.error) throw r.error;
    return send(res, 200, { statements: r.data });
  }

  if (req.method === "GET") {
    const st = await db.from("statements").select("id, name, bank, receipts, summary").eq("id", id).eq("org_id", org.id).maybeSingle();
    if (st.error) throw st.error;
    if (!st.data) throw new HttpError(404, "Statement not found");
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const t = await db.from("transactions").select("data").eq("statement_id", id).eq("org_id", org.id).order("position").range(from, from + 999);
      if (t.error) throw t.error;
      t.data.forEach((x) => rows.push(x.data));
      if (t.data.length < 1000) break;
    }
    return send(res, 200, { name: st.data.name, bank: st.data.bank, receipts: st.data.receipts || [], summary: st.data.summary, rows });
  }

  if (req.method === "DELETE") {
    if (!id) throw new HttpError(400, "Missing id");
    const st = await db.from("statements").select("id, file_path").eq("id", id).eq("org_id", org.id).maybeSingle();
    if (st.error) throw st.error;
    if (!st.data) throw new HttpError(404, "Statement not found");
    if (st.data.file_path && st.data.file_path.startsWith(org.id + "/")) await db.storage.from("statements").remove([st.data.file_path]);
    const d = await db.from("statements").delete().eq("id", id).eq("org_id", org.id);
    if (d.error) throw d.error;
    await db.from("audit_log").insert({ org_id: org.id, user_id: user.id, action: "delete", entity: "statement", entity_id: id });
    return send(res, 200, { deleted: true });
  }

  await requireSubscription(org);
  const body = await readBody(req);
  const rows = cleanRows(body.rows);
  const receipts = cleanReceipts(body.receipts);
  const filePath = body.file_path ? String(body.file_path) : null;
  if (filePath && !filePath.startsWith(org.id + "/")) throw new HttpError(400, "Invalid file");
  const st = await db.from("statements").insert({
    org_id: org.id, name: String(body.name || "Statement").slice(0, 120), bank: String(body.bank || "").slice(0, 60),
    file_path: filePath, transaction_count: rows.length, summary: summarise(rows), receipts, created_by: user.id,
  }).select("id").single();
  if (st.error) throw st.error;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((r, k) => ({
      statement_id: st.data.id, org_id: org.id, position: i + k, txn_date: r.date, description: r.desc, amount: r.amt, category: r.cat, data: r,
    }));
    const ins = await db.from("transactions").insert(batch);
    if (ins.error) { await db.from("statements").delete().eq("id", st.data.id); throw ins.error; }
  }
  await db.from("audit_log").insert({ org_id: org.id, user_id: user.id, action: "create", entity: "statement", entity_id: st.data.id, after: { count: rows.length } });
  send(res, 200, { id: st.data.id, count: rows.length });
});
