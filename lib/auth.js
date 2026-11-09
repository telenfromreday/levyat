const { admin } = require("./db");
const { HttpError } = require("./http");

/* Checks the sign-in token sent by the browser and returns the user, or throws 401 */
async function requireUser(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw new HttpError(401, "Please sign in");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data || !data.user) throw new HttpError(401, "Please sign in again");
  return data.user;
}

/* Every user has one organisation (their business). Created on first use. */
async function ensureOrg(user) {
  const db = admin();
  const m = await db.from("memberships").select("org_id, role, organisations(id, name)").eq("user_id", user.id).limit(1);
  if (m.error) throw m.error;
  if (m.data && m.data.length) return { id: m.data[0].org_id, name: m.data[0].organisations.name, role: m.data[0].role };
  const o = await db.from("organisations").insert({ name: user.email || "My business" }).select("id, name").single();
  if (o.error) throw o.error;
  const mm = await db.from("memberships").insert({ org_id: o.data.id, user_id: user.id, role: "owner" });
  if (mm.error) throw mm.error;
  return { id: o.data.id, name: o.data.name, role: "owner" };
}

module.exports = { requireUser, ensureOrg };
