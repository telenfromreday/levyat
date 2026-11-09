const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const A = require("../lib/analysis");
const { answer } = require("../lib/assistant");
const B = require("../lib/billing");
const { cleanRows, safeFilename } = require("../lib/validate");

const rows = [
  { date: "2026-09-03", desc: "SHELL FUEL", amt: -500, cat: "Transport & fuel" },
  { date: "2026-10-03", desc: "ENGEN FUEL", amt: -800, cat: "Transport & fuel" },
  { date: "2026-09-14", desc: "ZENDROP ORDER 441", amt: -2300, cat: "Stock & supplies" },
  { date: "2026-10-14", desc: "ZENDROP ORDER 442", amt: -2600, cat: "Stock & supplies" },
  { date: "2026-09-05", desc: "PAYSTACK PAYOUT", amt: 7000, cat: "Sales & customer payments" },
  { date: "2026-10-05", desc: "PAYSTACK PAYOUT", amt: 9000, cat: "Sales & customer payments" },
  { date: "2026-10-20", desc: "TRANSFER TO SAVINGS", amt: -1000, cat: "Owner withdrawals & transfers" },
];

test("summary totals and profit", () => {
  const S = A.summarise(rows);
  assert.equal(S.tin, 16000);
  assert.equal(S.tout, 7200);
  assert.equal(S.sales, 16000);
  assert.equal(S.exp, 6200); // the savings transfer is not an expense
  assert.equal(S.profit, 9800);
  assert.equal(S.mo["2026-10"].o, 4400);
});

test("money formatting", () => {
  assert.equal(A.money(2600), "R2 600,00");
  assert.equal(A.money(-1234567.5), "-R1 234 567,50");
});

test("assistant: spend on a category this month", () => {
  const r = answer("How much did I spend on fuel this month?", rows);
  assert.match(r.answer, /R800,00 on Transport & fuel in 2026-10/);
  assert.ok(r.transactions.length >= 1);
});

test("assistant: why expenses increased compares the last two months", () => {
  const r = answer("Why did my expenses increase?", rows);
  assert.match(r.answer, /R2 800,00 in 2026-09 and R4 400,00 in 2026-10/);
});

test("assistant: supplier name search", () => {
  assert.match(answer("how much on zendrop", rows).answer, /R4 900,00 on zendrop/);
});

test("assistant: profit and glossary", () => {
  assert.match(answer("What is my profit?", rows).answer, /R9 800,00/);
  assert.match(answer("What is VAT?", rows).answer, /15% tax/);
});

test("assistant: needs receipts", () => {
  assert.match(answer("Which transactions still need receipts?", rows, []).answer, /4 purchases/);
  const withReceipt = [{ supplier: "Zendrop", total: 2600, tx: 3 }];
  assert.match(answer("Which transactions still need receipts?", rows, withReceipt).answer, /3 purchases/);
});

test("assistant: empty statement and unknown question", () => {
  assert.match(answer("hello", []).answer, /Load a statement/);
  assert.match(answer("tell me a joke", rows).answer, /I can answer questions/);
});

test("webhook signature accepts the real signature and rejects others", () => {
  const body = Buffer.from('{"event":"charge.success"}');
  const sig = crypto.createHmac("sha512", "sk_test_x").update(body).digest("hex");
  assert.equal(B.verifySignature(body, sig, "sk_test_x"), true);
  assert.equal(B.verifySignature(body, sig, "other"), false);
  assert.equal(B.verifySignature(Buffer.from("{}"), sig, "sk_test_x"), false);
  assert.equal(B.verifySignature(body, "", "sk_test_x"), false);
});

test("subscription is active only while the paid period has not ended", () => {
  const now = new Date("2026-11-09T00:00:00Z");
  assert.equal(B.isActive({ status: "active", current_period_end: "2026-12-01T00:00:00Z" }, now), true);
  assert.equal(B.isActive({ status: "active", current_period_end: "2026-11-01T00:00:00Z" }, now), false);
  assert.equal(B.isActive({ status: "cancelled", current_period_end: "2026-12-01T00:00:00Z" }, now), false);
  assert.equal(B.isActive({ status: "non-renewing", current_period_end: "2026-12-01T00:00:00Z" }, now), true);
  assert.equal(B.isActive(null, now), false);
});

test("payment events map to subscription changes", () => {
  const e = { event: "charge.success", data: { customer: { email: "A@B.co", customer_code: "CUS_1" }, metadata: { org_id: "o1" } } };
  const p = B.planEvent(e, new Date("2026-11-09T00:00:00Z"));
  assert.equal(p.orgId, "o1"); assert.equal(p.email, "a@b.co"); assert.equal(p.patch.status, "active");
  assert.equal(B.planEvent({ event: "subscription.disable", data: {} }).patch.status, "cancelled");
  assert.equal(B.planEvent({ event: "something.else", data: {} }), null);
});

test("row validation rejects bad data and keeps simple extra fields", () => {
  assert.throws(() => cleanRows([]), /No transactions/);
  assert.throws(() => cleanRows([{ date: "09/2026", amt: 1 }]), /invalid date/);
  assert.throws(() => cleanRows([{ date: "2026-09-01", amt: "5" }]), /invalid amount/);
  const ok = cleanRows([{ date: "2026-09-01", amt: -5, desc: "X", cat: "Bank fees", conf: "high", ok: true, "bad key!": 1, nested: { a: 1 } }])[0];
  assert.equal(ok.conf, "high"); assert.equal(ok.ok, true); assert.equal(ok["bad key!"], undefined); assert.equal(ok.nested, undefined);
});

test("only statement file types can be stored, with safe names", () => {
  assert.equal(safeFilename("my statement (1).csv"), "my_statement_1_.csv");
  assert.throws(() => safeFilename("virus.exe"), /Only CSV/);
});
