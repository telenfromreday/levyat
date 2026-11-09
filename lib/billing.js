const crypto = require("crypto");

/* Paystack signs every webhook with HMAC-SHA512 of the raw body, using your secret key */
function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8"), b = Buffer.from(String(signature), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isActive(sub, now = new Date()) {
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "non-renewing") return false;
  return !!sub.current_period_end && new Date(sub.current_period_end) > now;
}

const DAY = 86400000;

/* Turns a Paystack event into the change we store. Returns null for events we ignore. */
function planEvent(event, now = new Date()) {
  const d = (event && event.data) || {};
  const email = d.customer && d.customer.email ? String(d.customer.email).toLowerCase() : null;
  const orgId = d.metadata && d.metadata.org_id ? String(d.metadata.org_id) : null;
  const base = { orgId, email, customer_code: d.customer && d.customer.customer_code };
  switch (event && event.event) {
    case "charge.success":
      return { ...base, patch: { status: "active", current_period_end: new Date(now.getTime() + 33 * DAY).toISOString() } };
    case "subscription.create":
      return { ...base, patch: { status: "active", subscription_code: d.subscription_code || null, plan_code: d.plan && d.plan.plan_code ? d.plan.plan_code : null } };
    case "subscription.not_renew":
      return { ...base, patch: { status: "non-renewing" } };
    case "subscription.disable":
      return { ...base, patch: { status: "cancelled" } };
    case "invoice.payment_failed":
      return { ...base, patch: { status: "past_due" } };
    default:
      return null;
  }
}

async function initialise({ secret, email, amount, plan, callbackUrl, metadata }) {
  const r = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({ email, amount, currency: "ZAR", plan, callback_url: callbackUrl, metadata }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.status) throw new Error("Payment provider error: " + (j.message || r.status));
  return j.data;
}

module.exports = { verifySignature, isActive, planEvent, initialise };
