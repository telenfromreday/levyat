const { route, send, readRaw, HttpError } = require("../../lib/http");
const { verifySignature, planEvent } = require("../../lib/billing");
const { admin } = require("../../lib/db");

/* Paystack calls this address when a payment or subscription changes. Never trust it without the signature. */
const handler = route(["POST"], async (req, res) => {
  const raw = await readRaw(req);
  if (!verifySignature(raw, req.headers["x-paystack-signature"], process.env.PAYSTACK_SECRET_KEY)) throw new HttpError(401, "Invalid signature");
  let event; try { event = JSON.parse(raw.toString("utf8")); } catch { throw new HttpError(400, "Invalid JSON"); }
  const plan = planEvent(event);
  if (!plan) return send(res, 200, { ignored: true });
  const db = admin();
  let orgId = plan.orgId;
  if (!orgId && plan.email) {
    const f = await db.from("subscriptions").select("org_id").eq("email", plan.email).limit(1);
    if (f.error) throw f.error;
    orgId = f.data && f.data[0] ? f.data[0].org_id : null;
  }
  if (!orgId) return send(res, 200, { ignored: "no matching account" });
  const patch = { ...plan.patch, updated_at: new Date().toISOString() };
  if (plan.customer_code) patch.paystack_customer_code = plan.customer_code;
  if (plan.email) patch.email = plan.email;
  const u = await db.from("subscriptions").upsert({ org_id: orgId, ...patch }, { onConflict: "org_id" });
  if (u.error) throw u.error;
  await db.from("audit_log").insert({ org_id: orgId, action: event.event, entity: "subscription", after: patch });
  send(res, 200, { ok: true });
});

module.exports = handler;
/* The signature is checked against the exact bytes Paystack sent, so the body must not be parsed first */
module.exports.config = { api: { bodyParser: false } };
