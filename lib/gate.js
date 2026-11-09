const { admin } = require("./db");
const { isActive } = require("./billing");
const { HttpError } = require("./http");

/* When REQUIRE_SUBSCRIPTION=true, saving and server features need an active subscription */
async function requireSubscription(org) {
  if (process.env.REQUIRE_SUBSCRIPTION !== "true") return;
  const s = await admin().from("subscriptions").select("status, current_period_end").eq("org_id", org.id).maybeSingle();
  if (s.error) throw s.error;
  if (!isActive(s.data)) throw new HttpError(402, "An active subscription is needed for this");
}
module.exports = { requireSubscription };
