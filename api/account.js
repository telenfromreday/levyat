const { route, send, readBody, HttpError } = require("../lib/http");
const { requireUser, ensureOrg } = require("../lib/auth");
const { admin } = require("../lib/db");

/* Deletes the signed-in owner's account and all of their business data (your POPIA deletion promise).
   Payment records held by Paystack are outside our control and are kept as the law requires. */
module.exports = route(["DELETE"], async (req, res) => {
  const user = await requireUser(req);
  const org = await ensureOrg(user);
  if (org.role !== "owner") throw new HttpError(403, "Only the owner can delete the account");
  const body = await readBody(req);
  if (body.confirm !== "DELETE") throw new HttpError(400, "Type DELETE to confirm");
  const db = admin();
  const files = await db.storage.from("statements").list(org.id, { limit: 1000 });
  if (files.data && files.data.length) await db.storage.from("statements").remove(files.data.map((f) => `${org.id}/${f.name}`));
  const d = await db.from("organisations").delete().eq("id", org.id);
  if (d.error) throw d.error;
  const u = await db.auth.admin.deleteUser(user.id);
  if (u.error) throw u.error;
  send(res, 200, { deleted: true });
});
