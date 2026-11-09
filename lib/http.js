class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

/* Wraps an API function: method check, JSON errors, no stack traces sent to the browser */
function route(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, "Method not allowed");
      await fn(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      send(res, status, { error: status === 500 ? "Something went wrong" : e.message });
    }
  };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === "string" ? req.body : null;
  if (raw === null) { const chunks = []; for await (const c of req) chunks.push(c); raw = Buffer.concat(chunks).toString("utf8"); }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, "Invalid JSON"); }
}

async function readRaw(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  const chunks = []; for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

module.exports = { HttpError, send, route, readBody, readRaw };
