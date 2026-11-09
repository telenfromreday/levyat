const { HttpError } = require("./http");
const { UNC } = require("./categories");

const MAX_ROWS = 5000;

/* Checks rows sent by the browser. Keeps extra simple fields the app needs to restore its view. */
function cleanRows(input) {
  if (!Array.isArray(input) || input.length === 0) throw new HttpError(400, "No transactions to save");
  if (input.length > MAX_ROWS) throw new HttpError(400, `Too many transactions (maximum ${MAX_ROWS})`);
  return input.map((r, n) => {
    if (!r || typeof r !== "object") throw new HttpError(400, `Row ${n + 1} is not valid`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) throw new HttpError(400, `Row ${n + 1} has an invalid date`);
    if (typeof r.amt !== "number" || !Number.isFinite(r.amt)) throw new HttpError(400, `Row ${n + 1} has an invalid amount`);
    const out = {};
    Object.keys(r).slice(0, 30).forEach((k) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,19}$/.test(k)) return;
      const v = r[k];
      if (typeof v === "string") out[k] = v.slice(0, 300);
      else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      else if (typeof v === "boolean") out[k] = v;
    });
    out.date = String(r.date); out.amt = r.amt; out.desc = String(r.desc || "").slice(0, 200); out.cat = String(r.cat || UNC).slice(0, 80);
    return out;
  });
}

function cleanReceipts(input) {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 500) throw new HttpError(400, "Receipts are not valid");
  return input.map((c) => ({
    supplier: String((c && c.supplier) || "").slice(0, 120),
    date: c && /^\d{4}-\d{2}-\d{2}$/.test(String(c.date)) ? String(c.date) : null,
    total: Math.abs(Number(c && c.total)) || 0,
    vat: Math.abs(Number(c && c.vat)) || 0,
  }));
}

function safeFilename(name) {
  const n = String(name || "statement").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  if (!/\.(csv|xlsx|xls|pdf)$/i.test(n)) throw new HttpError(400, "Only CSV, Excel and PDF files can be stored");
  return n;
}

module.exports = { cleanRows, cleanReceipts, safeFilename, MAX_ROWS };
