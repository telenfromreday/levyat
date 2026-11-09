/* The Livyato assistant. It answers from verified calculations (lib/analysis.js) using fixed
   rules. It does not call any AI service. Every answer lists the steps and transactions used. */
const A = require("./analysis");
const { CATS, UNC, SALES, NONEXP } = require("./categories");
const { money } = A;

const GLOSS = [
  ["vat", "VAT is a 15% tax added to most sales. If your business is VAT-registered, you collect it for SARS and can claim back VAT you paid on business costs, but only with valid tax invoices."],
  ["provisional", "Provisional tax is advance payment of income tax during the year, based on an estimate of your profit."],
  ["cash flow", "Cash flow is the difference between money coming in and going out over a period. A business can be profitable and still run short of cash."],
  ["profit", "Operating profit is sales minus business expenses, before income tax. It shows what the business earned from running day to day."],
  ["uncategor", "Uncategorised payments are ones that have not been sorted yet. Until you sort them, your profit figure may be wrong."],
  ["recurring", "A recurring payment is one that repeats, usually monthly, such as a subscription or an account fee."],
  ["withdrawal", "Owner withdrawals are money you take out for yourself. They are not a business expense."],
];

const HELP = "I can answer questions about your statement, for example: How much did I spend on fuel this month? What is my profit? Which month was best? What are my recurring payments? Which transactions still need receipts? Why did my expenses increase? What is VAT?";
const MN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function months(rows) { return [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort(); }

function monthOf(Q, ms) {
  const latest = ms[ms.length - 1];
  if (/last month|previous month/.test(Q)) return ms.length > 1 ? ms[ms.length - 2] : latest;
  if (/this month|current month/.test(Q)) return latest;
  for (const m of ms) if (Q.indexOf(m) > -1) return m;
  for (let k = 0; k < 12; k++) if (Q.indexOf(MN[k]) > -1) { const p = String(k + 1).padStart(2, "0"); for (let i = ms.length - 1; i >= 0; i--) if (ms[i].slice(5) === p) return ms[i]; }
  return "";
}

function categoryOf(Q, rows) {
  const cats = [...new Set(rows.map((r) => r.cat))];
  for (const c of cats) for (const w of c.toLowerCase().split(/[^a-z]+/)) if (w.length > 3 && Q.indexOf(w) > -1) return c;
  return "";
}

const STOP = "much spend spent what have paid from about month this that with money total business expenses expense last previous current year";
function searchOf(Q, rows) {
  const ws = Q.replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 3 && STOP.indexOf(w) < 0);
  return ws.find((w) => rows.some((r) => String(r.desc || "").toLowerCase().indexOf(w) > -1)) || "";
}

function explain(rows, receipts, steps, used) {
  const S = A.summarise(rows), L = A.insights(rows), out = [];
  out.push("Here is how your business looks, in plain English.");
  out.push(`You received ${money(S.tin)} and spent ${money(S.tout)} in this statement. Your estimated operating profit (sales minus business expenses, before income tax) is ${money(S.profit)}${S.profit < 0 ? ". That is a loss for this period, so look at your costs first." : "."}`);
  const ex = S.categories.filter((k) => k !== UNC);
  if (ex.length && S.exp > 0) out.push(`Your biggest cost is ${ex[0]}, ${Math.round(S.by[ex[0]] / S.exp * 100)}% of business expenses.`);
  L.slice(0, 3).forEach((x) => out.push("Worth noticing: " + x));
  const att = A.attention(rows, receipts), nx = [];
  if (S.to_review > 0) nx.push(`Review the ${S.to_review} items still needing a decision, because they affect your profit figure.`);
  if (S.uncategorised > 0) nx.push(`Sort the ${money(S.uncategorised)} of uncategorised payments.`);
  L.filter((x) => x.indexOf("Unusually") === 0).slice(0, 2).forEach((x) => nx.push(x.replace("Unusually large: ", "Check this large payment is correct: ")));
  if (att.duplicates.ids.length) nx.push(`Look at the ${att.duplicates.ids.length} possible duplicate payments.`);
  if (att.no_receipt.ids.length) nx.push("Keep receipts for business expenses, especially for VAT claims.");
  if (L.some((x) => x.indexOf("recurring") > -1)) nx.push("Check the recurring payments and cancel any you no longer use.");
  if (nx.length) { out.push(""); out.push("What to look into next:"); nx.slice(0, 5).forEach((x, i) => out.push(`${i + 1}. ${x}`)); }
  steps.push(`Totalled ${S.count} transactions and checked trends, large payments, duplicates and receipts.`);
  return out.join("\n");
}

function answer(question, rows, receipts = []) {
  const steps = [], used = new Set();
  const done = (text) => ({ answer: text, steps, transactions: [...used].slice(0, 40).map((i) => ({ id: i, date: rows[i].date, description: rows[i].desc, category: rows[i].cat, amount: rows[i].amt })) });
  if (!rows.length) return done("Load a statement first and I can answer questions about it.");
  const Q = String(question || "").toLowerCase(), ms = months(rows), m = monthOf(Q, ms), c = categoryOf(Q, rows), S = A.summarise(rows);
  const has = (...w) => w.some((x) => Q.indexOf(x) > -1);
  const mark = (ids) => ids.slice(0, 40).forEach((i) => used.add(i));

  if (has("what is", "what's", "what does", "what are", "meaning", "define") && !has("my recurring", "my profit", "my vat")) for (const g of GLOSS) if (Q.indexOf(g[0]) > -1) return done(g[1]);
  if (has("explain", "investigate", "summar", "how is my business", "how am i doing", "check next")) return done(explain(rows, receipts, steps, used));
  if (/receipt|invoice/.test(Q) && /need|missing|without|still|which|how many/.test(Q)) {
    const a = A.attention(rows, receipts).no_receipt; mark(a.ids); steps.push(`Checked ${rows.length} transactions for a matching receipt.`);
    return done(a.ids.length ? `${a.ids.length} purchases (${money(Math.abs(a.total))}) have no receipt or invoice recorded yet. The largest are: ${a.ids.slice(0, 4).map((i) => `${rows[i].desc} on ${rows[i].date} (${money(Math.abs(rows[i].amt))})`).join("; ")}.` : "Every business purchase has a receipt or invoice recorded.");
  }
  if (/why|went up|increase|rose|higher|went down|decrease|fell/.test(Q) && /expens|spend|spent|cost/.test(Q)) {
    if (ms.length < 2) return done("I need at least two months of data to see what changed.");
    const r = A.compare(rows, ms[ms.length - 2], ms[ms.length - 1]); steps.push(`Compared ${r.a.month} with ${r.b.month}.`);
    return done(`Money out was ${money(r.a.money_out)} in ${r.a.month} and ${money(r.b.money_out)} in ${r.b.month}. The biggest changes were ${r.changes.length ? r.changes.slice(0, 3).map((z) => `${z.category} (${z.change > 0 ? "up " : "down "}${money(Math.abs(z.change))})`).join(", ") : "none"}.`);
  }
  if (/who paid|which customers|customers paid|paid me|payers/.test(Q)) {
    const r = A.sum(rows, { direction: "in", month: m }, "payer", 8); r.groups.forEach((g) => mark(g.ids)); steps.push(`Grouped money in${m ? " for " + m : ""} by payer.`);
    return done(r.groups.length ? `Your money in${m ? " for " + m : ""} came from: ${r.groups.map((g) => `${g.key} (${money(g.total)})`).join(", ")}.` : `I found no money in${m ? " for " + m : ""}.`);
  }
  const s = c ? "" : searchOf(Q, rows);
  if (/how much|spend|spent|cost/.test(Q) && (c || m || s) && !/profit|make|made|earn/.test(Q)) {
    const r = A.find(rows, { category: c, search: s, month: m, direction: "out" }); mark(r.largest); steps.push(`Added up money out${c ? " in " + c : s ? " matching " + s : ""}${m ? " for " + m : ""}: ${r.matched} transactions.`);
    return done(`You spent ${money(r.money_out)}${c ? " on " + c : s ? " on " + s : " in total"}${m ? " in " + m : " across the whole statement"}, over ${r.matched} transaction${r.matched === 1 ? "" : "s"}.`);
  }
  if (has("profit", "earn", " made", "make ") ) return done(`Your estimated operating profit is ${money(S.profit)}: sales of ${money(S.sales)} minus business expenses of ${money(S.exp)}. This is before income tax.`);
  if (has("money going", "could i cut", "where is my money")) { const ex = S.categories.filter((k) => k !== UNC).slice(0, 3); return done(ex.length ? `Your biggest expense categories are: ${ex.map((k) => `${k} (${money(S.by[k])})`).join(", ")}. Review the largest one first to see if it can be reduced.` : "I could not find categorised expenses yet."); }
  if (has("best", "worst", "strong", "weak", "highest", "lowest") && has("month")) {
    if (ms.length < 2) return done("I need at least two months of data to compare months.");
    const net = (k) => S.mo[k].i - S.mo[k].o; let b = ms[0], w = ms[0]; ms.forEach((k) => { if (net(k) > net(b)) b = k; if (net(k) < net(w)) w = k; });
    return done(`Your strongest month was ${b} (net ${money(net(b))}) and your weakest was ${w} (net ${money(net(w))}). Net means money in minus money out.`);
  }
  const L = A.insights(rows);
  if (has("recurring", "subscription")) { const r = L.filter((x) => x.indexOf("recurring") > -1); return done(r.length ? r.join("\n") : "I did not find any payments that repeat monthly yet."); }
  if (has("uncategor", "unsorted")) { const a = A.attention(rows, receipts).uncategorised; mark(a.ids); return done((S.uncategorised ? `You have ${money(S.uncategorised)} in uncategorised payments. ` : "Nothing is uncategorised. ") + `${S.to_review} items still need a decision on the Review step.`); }
  if (has("duplicate")) { const a = A.attention(rows, receipts).duplicates; mark(a.ids); return done(`I flagged ${a.ids.length} possible duplicate payments.`); }
  if (has("forecast", "next month", "runway", "cash flow")) { const r = L.filter((x) => x.indexOf("next month") > -1 || x.indexOf("balance") > -1); return done(r.length ? r.join("\n") : "I need two or more months of statements to forecast."); }
  if (has("largest", "biggest") && has("payment", "transaction", "purchase")) { const t = rows.map((r, i) => i).filter((i) => rows[i].amt < 0).sort((a, b) => rows[a].amt - rows[b].amt).slice(0, 3); mark(t); return done(`Your largest payments: ${t.map((i) => `${rows[i].desc.slice(0, 30)} on ${rows[i].date} (${money(-rows[i].amt)})`).join("; ")}.`); }
  if (has("biggest", "largest", "most") && has("expense", "category", "spend")) { const ex = S.categories.filter((k) => k !== UNC); return done(ex.length ? `Your biggest expense category is ${ex[0]}: ${money(S.by[ex[0]])}, ${Math.round(S.by[ex[0]] / S.exp * 100)}% of business expenses.` : "No categorised expenses yet."); }
  if (has("money in", "received", "income", "revenue", "sales")) return done(`Money in was ${money(S.tin)}, of which sales and customer payments were ${money(S.sales)}.`);
  if (has("money out", "total spent", "spending")) return done(`Money out was ${money(S.tout)}, of which estimated business expenses were ${money(S.exp)}.`);
  if (c) { const r = A.find(rows, { category: c }); mark(r.largest); const t = r.money_in - r.money_out; return done(`${t < 0 ? "You spent " + money(-t) : "You received " + money(t)} under ${c}, across ${r.matched} transactions.`); }
  const s2 = searchOf(Q, rows);
  if (s2) { const r = A.find(rows, { search: s2 }); mark(r.largest); const t = r.money_in - r.money_out; return done(`I found ${r.matched} transactions matching ${s2}, totalling ${money(Math.abs(t))} (${t < 0 ? "money out" : "money in"}).`); }
  return done(HELP);
}

module.exports = { answer, HELP };
