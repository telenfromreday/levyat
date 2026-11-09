const crypto = require("crypto");
const { route, send, readBody } = require("../lib/http");
const { requireUser, ensureOrg } = require("../lib/auth");
const { requireSubscription } = require("../lib/gate");
const { safeFilename } = require("../lib/validate");
const { admin } = require("../lib/db");

/* Gives the browser a one-time link to upload the original file into private storage */
module.exports = route(["POST"], async (req, res) => {
  const user = await requireUser(req);
  const org = await ensureOrg(user);
  await requireSubscription(org);
  const body = await readBody(req);
  const path = `${org.id}/${crypto.randomUUID()}-${safeFilename(body.filename)}`;
  const { data, error } = await admin().storage.from("statements").createSignedUploadUrl(path);
  if (error) throw error;
  send(res, 200, { path: data.path || path, token: data.token });
});
