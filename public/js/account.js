/* Livyato account bar: sign-in, save and load statements, subscription.
   Does nothing until config.js has your Supabase details, so the app still works on its own. */
(function () {
  var cfg = window.LIVYATO || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) return;
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  var session = null, me = null, bar = null, lastFile = null;

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function say(t) { var m = document.getElementById("acctmsg"); if (m) m.textContent = t || ""; }

  function api(path, opts) {
    opts = opts || {};
    var h = { Authorization: "Bearer " + (session ? session.access_token : "") };
    if (opts.body) h["Content-Type"] = "application/json";
    return fetch((cfg.API || "/api") + path, { method: opts.method || "GET", headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Request failed"); return j; }); });
  }

  /* remember the last file the user loaded so it can be stored with the statement */
  var oldHandle = window.handleFile;
  if (typeof oldHandle === "function") window.handleFile = function (f) { lastFile = f || null; return oldHandle.apply(this, arguments); };

  function build() {
    bar = document.createElement("div");
    bar.id = "acctbar";
    bar.style.cssText = "max-width:960px;margin:0 auto;padding:10px 14px;font-size:14px;color:var(--ink);border-bottom:1px solid var(--line)";
    document.body.insertBefore(bar, document.body.firstChild);
    draw();
  }

  function draw() {
    if (!session) {
      bar.innerHTML = 'Your work stays in this browser. <a href="/login" style="color:var(--accent)">Sign in or create an account</a> to save statements and come back to them.';
      return;
    }
    var plan = me && me.subscription ? me.subscription.status : "none";
    var active = me && me.subscription_active;
    bar.innerHTML = '<span>Signed in as <b>' + esc(session.user.email) + '</b>' + (active ? ' (subscribed)' : ' (no active subscription)') + '</span> ' +
      '<button class="ghost" id="a_save">Save to my account</button> ' +
      '<button class="ghost" id="a_list">My saved statements</button> ' +
      (active ? '' : '<button class="ghost" id="a_sub">Subscribe</button> ') +
      '<button class="ghost" id="a_out">Sign out</button> ' +
      '<button class="ghost" id="a_del">Delete my account</button>' +
      '<div id="acctmsg" class="note" role="status" style="margin-top:6px"></div><div id="acctlist"></div>';
    document.getElementById("a_out").onclick = function () { sb.auth.signOut(); };
    document.getElementById("a_del").onclick = deleteAccount;
    document.getElementById("a_save").onclick = save;
    document.getElementById("a_list").onclick = list;
    var s = document.getElementById("a_sub"); if (s) s.onclick = subscribe;
  }

  function save() {
    if (!window.rows || !window.rows.length) { say("Load a statement first."); return; }
    say("Saving...");
    var name = (lastFile && lastFile.name) || "Statement " + new Date().toISOString().slice(0, 10);
    var step = lastFile
      ? api("/upload-url", { method: "POST", body: { filename: lastFile.name } }).then(function (u) {
          return sb.storage.from("statements").uploadToSignedUrl(u.path, u.token, lastFile).then(function (r) { if (r.error) throw r.error; return u.path; });
        })
      : Promise.resolve(null);
    step.then(function (path) {
      return api("/statements", { method: "POST", body: { name: name, bank: window.bank || "", file_path: path, rows: window.rows, receipts: window.rcp || [] } });
    }).then(function (r) { say("Saved. " + r.count + " transactions stored."); })
      .catch(function (e) { say("Could not save: " + e.message); });
  }

  function list() {
    say("Loading...");
    api("/statements").then(function (r) {
      say("");
      var el = document.getElementById("acctlist");
      if (!r.statements.length) { el.innerHTML = '<p class="note">Nothing saved yet.</p>'; return; }
      el.innerHTML = '<ul style="padding-left:18px">' + r.statements.map(function (s) {
        return '<li>' + esc(s.name) + ' (' + s.transaction_count + ' transactions, ' + esc(String(s.created_at).slice(0, 10)) + ') ' +
          '<button class="ghost" data-open="' + esc(s.id) + '">Open</button> <button class="ghost" data-del="' + esc(s.id) + '">Delete</button></li>';
      }).join("") + '</ul>';
      el.onclick = function (e) {
        var o = e.target.getAttribute("data-open"), d = e.target.getAttribute("data-del");
        if (o) open(o);
        if (d && confirm("Delete this saved statement? This cannot be undone.")) api("/statements?id=" + encodeURIComponent(d), { method: "DELETE" }).then(list).catch(function (x) { say(x.message); });
      };
    }).catch(function (e) { say("Could not load: " + e.message); });
  }

  function open(id) {
    say("Opening...");
    api("/statements?id=" + encodeURIComponent(id)).then(function (r) {
      window.rows = r.rows;
      window.rcp = r.receipts || [];
      if (typeof window.maxS !== "undefined") window.maxS = Math.max(window.maxS, 4);
      if (typeof window.go === "function") window.go(4);
      say("Opened " + r.name + ".");
    }).catch(function (e) { say("Could not open: " + e.message); });
  }

  function subscribe() {
    say("Opening checkout...");
    api("/billing/checkout", { method: "POST", body: { plan: "monthly" } })
      .then(function (r) { window.location.href = r.url; })
      .catch(function (e) { say("Could not start checkout: " + e.message); });
  }

  function deleteAccount() {
    var t = prompt("This permanently deletes your account and everything you saved. Type DELETE to confirm.");
    if (t !== "DELETE") return;
    api("/account", { method: "DELETE", body: { confirm: "DELETE" } })
      .then(function () { return sb.auth.signOut(); })
      .then(function () { say("Your account has been deleted."); })
      .catch(function (e) { say("Could not delete: " + e.message); });
  }

  function refresh() {
    if (!session) { me = null; draw(); return; }
    api("/me").then(function (r) { me = r; draw(); }).catch(function () { me = null; draw(); });
  }

  window.LivyatoAccount = {
    profile: function () { return session ? { email: session.user.email, name: "" } : null; },
    token: function () { return session ? session.access_token : null; }
  };

  build();
  sb.auth.getSession().then(function (r) { session = r.data.session; refresh(); });
  sb.auth.onAuthStateChange(function (_e, s) { session = s; refresh(); });
})();
