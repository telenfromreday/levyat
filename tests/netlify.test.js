/* Checks the Netlify wrapper routes requests to the right API file */
const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/api");

const ev = (o) => ({ httpMethod: "GET", headers: {}, body: null, isBase64Encoded: false, queryStringParameters: {}, ...o });

test("health works on both path styles", async () => {
  for (const path of ["/api/health", "/.netlify/functions/api/health"]) {
    const r = await handler(ev({ path }));
    assert.equal(r.statusCode, 200);
    assert.deepEqual(JSON.parse(r.body), { ok: true });
  }
});

test("unknown route is 404, wrong method is 405", async () => {
  assert.equal((await handler(ev({ path: "/api/nope" }))).statusCode, 404);
  assert.equal((await handler(ev({ path: "/api/health", httpMethod: "POST" }))).statusCode, 405);
});

test("protected route without a token is 401", async () => {
  const r = await handler(ev({ path: "/api/me" }));
  assert.equal(r.statusCode, 401);
});

test("nested billing route is found and the signature is checked", async () => {
  process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
  const r = await handler(ev({ path: "/api/billing/webhook", httpMethod: "POST", body: "{}", headers: { "X-Paystack-Signature": "bad" } }));
  assert.equal(r.statusCode, 401);
});
