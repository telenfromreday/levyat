const { createClient } = require("@supabase/supabase-js");
let client = null;
/* Server-side client with full access. Never expose the service role key to the browser. */
function admin() {
  if (client) return client;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
module.exports = { admin };
