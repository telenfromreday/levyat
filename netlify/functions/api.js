/* Runs the files in /api on Netlify. Each file keeps its normal (req, res) shape,
   so nothing in /api or /lib had to change. This file only translates between
   Netlify's request format and that shape. */
const handlers = {
  "health": require("../../api/health"),
  "me": require("../../api/me"),
  "upload-url": require("../../api/upload-url"),
  "account": require("../../api/account"),
  "statements": require("../../api/statements"),
  "ask": require("../../api/ask"),
  "billing/checkout": require("../../api/billing/checkout"),
  "billing/webhook": require("../../api/billing/webhook"),
};

function reply(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  const m = String(event.path || "").match(/\/(?:\.netlify\/functions\/api|api)(\/[^?]*)?$/);
  const name = ((m && m[1]) || "").replace(/^\/+|\/+$/g, "");
  if (!Object.prototype.hasOwnProperty.call(handlers, name)) return reply(404, { error: "Not found" });

  const headers = {};
  for (const k of Object.keys(event.headers || {})) headers[k.toLowerCase()] = event.headers[k];
  let body = "";
  if (event.body != null) body = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  const qs = event.rawQuery != null ? event.rawQuery : new URLSearchParams(event.queryStringParameters || {}).toString();

  const req = { method: event.httpMethod, headers, url: "/api/" + name + (qs ? "?" + qs : ""), body };
  let status = 200, out = "";
  const outHeaders = {};
  const res = {
    get statusCode() { return status; },
    set statusCode(v) { status = v; },
    setHeader(k, v) { outHeaders[k] = v; },
    end(b) { out = b == null ? "" : String(b); },
  };

  await handlers[name](req, res);
  return { statusCode: status, headers: outHeaders, body: out };
};
