const { route, send } = require("../lib/http");
const { requireUser, ensureOrg } = require("../lib/auth");
const { admin } = require("../lib/db");
const { isActive } = require("../lib/billing");

module.exports = route(["GET"], async (req, res) => {
  const user = await requireUser(req);
  const org = await ensureOrg(user);
  const s = await admin().from("subscriptions").select("status, current_period_end").eq("org_id", org.id).maybeSingle();
  if (s.error) throw s.error;
  send(res, 200, {
    user: { id: user.id, email: user.email },
    org,
    subscription: s.data || null,
    subscription_active: isActive(s.data),
    subscription_required: process.env.REQUIRE_SUBSCRIPTION === "true",
  });
});
