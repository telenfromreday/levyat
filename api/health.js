const { route, send } = require("../lib/http");
module.exports = route(["GET"], async (req, res) => send(res, 200, { ok: true }));
