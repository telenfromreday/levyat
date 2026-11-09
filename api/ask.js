const { route, send, readBody, HttpError } = require("../lib/http");
const { requireUser, ensureOrg } = require("../lib/auth");
const { requireSubscription } = require("../lib/gate");
const { answer } = require("../lib/assistant");
const { admin } = require("../lib/db");

/* Answers a question about a saved statement using verified calculations. No AI service involved. */
module.exports = route(["POST"], async (req, res) => {
  const user = await requireUser(req);
  const org = await ensureOrg(user);
  await requireSubscription(org);
  const body = await readBody(req);
  const id = String(body.statement_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Invalid statement");
  const question = String(body.question || "").slice(0, 300);
  if (!question.trim()) throw new HttpError(400, "Ask a question");
  const db = admin();
  const st = await db.from("statements").select("id, receipts").eq("id", id).eq("org_id", org.id).maybeSingle();
  if (st.error) throw st.error;
  if (!st.data) throw new HttpError(404, "Statement not found");
  const t = await db.from("transactions").select("data").eq("statement_id", id).eq("org_id", org.id).order("position").limit(5000);
  if (t.error) throw t.error;
  send(res, 200, answer(question, t.data.map((x) => x.data), st.data.receipts || []));
});
