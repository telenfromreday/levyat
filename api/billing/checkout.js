const { route, send, HttpError } = require("../../lib/http");
const { requireUser, ensureOrg } = require("../../lib/auth");
const { admin } = require("../../lib/db");
const { initialise } = require("../../lib/billing");

/* Starts a Paystack subscription checkout and returns the payment page address */
module.exports = route(["POST"], async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY, plan = process.env.PAYSTACK_PLAN_CODE, site = process.env.SITE_URL;
  if (!secret || !plan || !site) throw new HttpError(503, "Payments are not set up yet");
  const user = await requireUser(req);
  const org = await ensureOrg(user);
  const data = await initialise({
    secret, email: user.email, amount: Number(process.env.PLAN_AMOUNT_CENTS || 0), plan,
    callbackUrl: site.replace(/\/$/, "") + "/app?paid=1", metadata: { org_id: org.id, user_id: user.id },
  });
  const up = await admin().from("subscriptions").upsert({ org_id: org.id, email: String(user.email).toLowerCase(), updated_at: new Date().toISOString() }, { onConflict: "org_id", ignoreDuplicates: true });
  if (up.error) throw up.error;
  send(res, 200, { url: data.authorization_url });
});
