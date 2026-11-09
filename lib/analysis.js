/* Business calculations. Pure functions: rows in, numbers out. No network, no AI.
   A row is { date: "YYYY-MM-DD", desc, amt (negative = money out), cat, bal?, dup?, ok?, conf? } */
const { SALES, UNC, NONEXP } = require("./categories");

const r2 = (n) => Math.round(n * 100) / 100;
const month = (r) => r.date.slice(0, 7);

function money(n) {
  const neg = n < 0;
  const [i, d] = Math.abs(r2(n)).toFixed(2).split(".");
  return (neg ? "-" : "") + "R" + i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + d;
}

function key(desc) {
  const m = String(desc || "").toUpperCase().replace(/[0-9#*]+/g, " ").replace(/\s+/g, " ").trim().split(" ");
  return m.slice(0, 2).join(" ").toLowerCase();
}

function summarise(rows) {
  const S = { tin: 0, tout: 0, sales: 0, by: {}, mo: {}, count: rows.length };
  rows.forEach((r) => {
    const m = month(r);
    S.mo[m] = S.mo[m] || { i: 0, o: 0 };
    if (r.amt > 0) { S.tin += r.amt; S.mo[m].i += r.amt; if (r.cat === SALES) S.sales += r.amt; }
    else { S.tout -= r.amt; S.mo[m].o -= r.amt; if (NONEXP.indexOf(r.cat) < 0) S.by[r.cat] = (S.by[r.cat] || 0) - r.amt; }
  });
  S.categories = Object.keys(S.by).sort((a, b) => S.by[b] - S.by[a]);
  S.exp = 0; let vatBase = 0;
  S.categories.forEach((k) => { if (k !== UNC) S.exp += S.by[k]; if (k !== "Bank fees" && k !== UNC) vatBase += S.by[k]; });
  S.vat_estimate = r2(vatBase * 15 / 115);
  S.profit = S.sales - S.exp;
  S.uncategorised = S.by[UNC] || 0;
  S.possible_duplicates = rows.filter((r) => r.dup).length;
  S.to_review = rows.filter((r) => !r.ok && r.conf !== "high").length;
  ["tin", "tout", "sales", "exp", "profit", "uncategorised"].forEach((k) => (S[k] = r2(S[k])));
  Object.keys(S.by).forEach((k) => (S.by[k] = r2(S.by[k])));
  Object.keys(S.mo).forEach((k) => { S.mo[k].i = r2(S.mo[k].i); S.mo[k].o = r2(S.mo[k].o); });
  return S;
}

/* Filter helper shared by find / sum */
function filter(rows, a = {}) {
  const cat = a.category ? String(a.category).toLowerCase() : "";
  const q = a.search ? String(a.search).toLowerCase() : "";
  const m = a.month ? String(a.month) : "";
  const d = a.direction === "in" ? 1 : a.direction === "out" ? -1 : 0;
  const mn = Math.abs(Number(a.min_amount) || 0);
  const ix = [];
  rows.forEach((r, i) => {
    if (cat && r.cat.toLowerCase().indexOf(cat) < 0) return;
    if (q && String(r.desc || "").toLowerCase().indexOf(q) < 0) return;
    if (m && month(r) !== m) return;
    if (d === 1 && r.amt <= 0) return;
    if (d === -1 && r.amt >= 0) return;
    if (Math.abs(r.amt) < mn) return;
    ix.push(i);
  });
  return ix;
}

function find(rows, a = {}, limit = 10) {
  const ix = filter(rows, a);
  let tin = 0, tout = 0;
  ix.forEach((i) => { rows[i].amt > 0 ? (tin += rows[i].amt) : (tout += rows[i].amt); });
  const top = ix.slice().sort((x, y) => Math.abs(rows[y].amt) - Math.abs(rows[x].amt)).slice(0, limit);
  return { ids: ix, matched: ix.length, money_in: r2(tin), money_out: r2(-tout), net: r2(tin + tout), largest: top };
}

function sum(rows, a = {}, groupBy = "category", top = 10) {
  const ix = filter(rows, a), g = {};
  let total = 0;
  ix.forEach((i) => {
    const r = rows[i];
    const k = groupBy === "month" ? month(r) : groupBy === "payer" ? key(r.desc) || String(r.desc).slice(0, 30) : r.cat;
    const o = (g[k] = g[k] || { key: k, count: 0, total: 0, ids: [] });
    o.count++; o.total += r.amt; o.ids.push(i); total += r.amt;
  });
  const groups = Object.values(g).sort((x, y) => Math.abs(y.total) - Math.abs(x.total)).slice(0, top).map((o) => ({ ...o, total: r2(o.total) }));
  return { groups, grand_total: r2(total), covered: ix.length };
}

function compare(rows, A, B) {
  const agg = (m) => { const o = { i: 0, o: 0, c: {}, n: 0 }; rows.forEach((r) => { if (month(r) !== m) return; o.n++; if (r.amt > 0) o.i += r.amt; else { o.o -= r.amt; o.c[r.cat] = (o.c[r.cat] || 0) - r.amt; } }); return o; };
  const x = agg(A), y = agg(B);
  if (!x.n || !y.n) return null;
  const cats = new Set([...Object.keys(x.c), ...Object.keys(y.c)]);
  const changes = [...cats].map((c) => ({ category: c, change: r2((y.c[c] || 0) - (x.c[c] || 0)) })).filter((z) => z.change !== 0).sort((p, q) => Math.abs(q.change) - Math.abs(p.change)).slice(0, 5);
  return { a: { month: A, money_in: r2(x.i), money_out: r2(x.o) }, b: { month: B, money_in: r2(y.i), money_out: r2(y.o) }, changes };
}

function hasReceipt(i, receipts) { return (receipts || []).some((c) => c.tx === i || c.tx2 === i); }

function attention(rows, receipts) {
  const unc = [], dup = [], noDoc = [];
  rows.forEach((r, i) => {
    if (r.cat === UNC) unc.push(i);
    if (r.dup) dup.push(i);
    if (r.amt < 0 && r.cat !== UNC && r.cat !== "Bank fees" && NONEXP.indexOf(r.cat) < 0 && !hasReceipt(i, receipts)) noDoc.push(i);
  });
  const tot = (a) => r2(a.reduce((s, i) => s + rows[i].amt, 0));
  noDoc.sort((x, y) => rows[x].amt - rows[y].amt);
  return { uncategorised: { ids: unc, total: tot(unc) }, duplicates: { ids: dup, total: tot(dup) }, no_receipt: { ids: noDoc, total: tot(noDoc) } };
}

/* Plain-language observations: trends, large payments, recurring payments, forecast */
function insights(rows) {
  const S = summarise(rows), ms = Object.keys(S.mo).sort(), L = [];
  if (ms.length > 1) {
    const a = S.mo[ms[ms.length - 2]], b = S.mo[ms[ms.length - 1]];
    if (a.o > 0) { const p = Math.round((b.o - a.o) / a.o * 100); if (Math.abs(p) >= 10) L.push(`Money out ${p > 0 ? "rose" : "fell"} ${Math.abs(p)}% in ${ms[ms.length - 1]} compared with ${ms[ms.length - 2]}.`); }
    if (a.i > 0) { const q = Math.round((b.i - a.i) / a.i * 100); if (Math.abs(q) >= 10) L.push(`Money in ${q > 0 ? "rose" : "fell"} ${Math.abs(q)}% over the same period.`); }
  }
  const ex = S.categories.filter((k) => k !== UNC);
  if (ex.length && S.exp > 0) L.push(`Your largest expense category is ${ex[0]}, ${Math.round(S.by[ex[0]] / S.exp * 100)}% of business expenses.`);
  const be = rows.filter((r) => r.amt < 0 && NONEXP.indexOf(r.cat) < 0);
  const sv = be.map((r) => -r.amt).sort((x, y) => x - y);
  if (sv.length > 5) {
    const med = sv[Math.floor(sv.length / 2)];
    be.filter((r) => -r.amt > med * 5 && -r.amt > 500).sort((x, y) => x.amt - y.amt).slice(0, 3).forEach((r) => L.push(`Unusually large: ${r.desc.slice(0, 40)} on ${r.date} (${money(-r.amt)}).`));
  }
  const g = {};
  rows.forEach((r) => { if (r.amt < 0) { const k = key(r.desc); if (k) (g[k] = g[k] || []).push(r); } });
  const rec = [];
  Object.keys(g).forEach((k) => {
    const mo = {}; g[k].forEach((r) => { mo[month(r)] = -r.amt; });
    const v = Object.values(mo);
    if (v.length >= 2 && Math.max(...v) <= Math.min(...v) * 1.1) rec.push(`Looks recurring: ${g[k][0].desc.slice(0, 30)}, about ${money(Math.min(...v))} a month.`);
  });
  rec.slice(0, 4).forEach((x) => L.push(x));
  if (ms.length > 1) {
    const av = ms.reduce((t, k) => t + S.mo[k].i - S.mo[k].o, 0) / ms.length;
    L.push(`If the average continues, next month's net cash flow is about ${money(av)}. Partial months can distort this.`);
    let lb = NaN;
    rows.slice().sort((x, y) => (x.date < y.date ? -1 : 1)).forEach((r) => { if (typeof r.bal === "number") lb = r.bal; });
    if (av < 0 && lb > 0) L.push(`At that pace your latest balance of ${money(lb)} would last about ${(lb / -av).toFixed(1)} months.`);
  } else L.push("Add two or more months of statements to see trends and a cash-flow forecast.");
  return L;
}

module.exports = { r2, money, key, summarise, filter, find, sum, compare, attention, insights };
