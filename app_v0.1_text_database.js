const out = document.getElementById("out");
const loginStatus = document.getElementById("loginStatus");

function setStatus(msg, cls = "") {
  if (!loginStatus) return;
  loginStatus.textContent = msg;
  loginStatus.className = cls;
}
// visible proof app.js executed
setStatus("app.js loaded. Ready.", "success");

function log(obj) {
  if (!out) return;
  out.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  console.log(obj);
}

// Show whether DOM elements exist
log({
  appJsLoaded: true,
  hasLoginStatus: !!loginStatus,
  hasOut: !!out,
  hasSupabaseGlobal: !!window.supabase,
  supabaseGlobalType: typeof window.supabase
});

// STOP here if supabase-js is not loaded
if (!window.supabase) {
  setStatus("Error: supabase-js did not load (window.supabase is undefined).", "error");
  throw new Error("supabase-js not loaded");
}

// ===== CONFIG =====
const SUPABASE_URL = "https://gmvulstojuiggxstomcq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtdnVsc3RvanVpZ2d4c3RvbWNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTExOTMsImV4cCI6MjA4Mjc2NzE5M30.b8bXDljJkrOlQV8xEgMhGXvHOFq18V1s74Gc2vmqTew";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClientForStatusHook = supabaseClient;

supabaseClient.auth.onAuthStateChange((event) => {
  log({ authEvent: event });
  if (event === "SIGNED_IN") setStatus("Login successful ✔", "success");
  if (event === "SIGNED_OUT") setStatus("Logged out");
});

const loginBtn = document.getElementById("loginBtn");
if (!loginBtn) {
  setStatus("Error: loginBtn not found. Check index.html element IDs.", "error");
  throw new Error("loginBtn not found");
}

loginBtn.addEventListener("click", async () => {
  setStatus("Attempting login…");
  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");

  if (!emailEl || !passEl) {
    setStatus("Error: email/password inputs not found. Check index.html IDs.", "error");
    return;
  }

  const email = emailEl.value.trim();
  const password = passEl.value;

  log({ step: "login_start", email });

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus("Login failed: " + error.message, "error");
      return log({ step: "login_failed", error: error.message });
    }
    setStatus("Login successful ✔", "success");
    log({ step: "login_ok", user: data.user?.email });
  } catch (e) {
    setStatus("Login crashed: " + (e?.message || e), "error");
    log({ step: "login_exception", error: String(e) });
  }
});

// ===== Post-login Tests =====
async function requireSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    log({ step: "get_session_failed", error: error.message });
    setStatus("Session error: " + error.message, "error");
    return null;
  }
  if (!data.session) {
    setStatus("Not logged in. Please login first.", "error");
    log({ step: "not_logged_in" });
    return null;
  }
  return data.session;
}

// Fetch active events
const eventsBtn = document.getElementById("eventsBtn");
if (eventsBtn) {
  eventsBtn.addEventListener("click", async () => {
    const session = await requireSession();
    if (!session) return;

    log({ step: "events_fetch_start" });

    const { data, error } = await supabaseClient
      .from("events")
      .select("id, title, start_date, start_time, end_date, end_time, location_name, is_active, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      setStatus("Fetch events failed: " + error.message, "error");
      return log({ step: "events_fetch_failed", error: error.message });
    }

    setStatus(`Fetched ${data.length} active event(s).`, "success");
    log({ step: "events_fetch_ok", rows: data });
  });
} else {
  log({ warning: "eventsBtn not found in index.html (id='eventsBtn')" });
}

// RPC check-in (calls your stored procedure)
const rpcBtn = document.getElementById("rpcBtn");
if (rpcBtn) {
  rpcBtn.addEventListener("click", async () => {
    const session = await requireSession();
    if (!session) return;

    const qrInput = document.getElementById("qr");
    const qrValue = (qrInput?.value || "").trim();

    if (!qrValue) {
      setStatus("Please paste a qr_code_url value first.", "error");
      return log({ step: "rpc_missing_qr" });
    }

    log({ step: "rpc_check_in_start", qr_code_url: qrValue });

    const { data, error } = await supabaseClient.rpc("check_in_participant", {
      p_qr_code_url: qrValue
    });

    if (error) {
      setStatus("RPC failed: " + error.message, "error");
      return log({ step: "rpc_check_in_failed", error: error.message });
    }

    setStatus("RPC success. Participant checked in.", "success");
    log({ step: "rpc_check_in_ok", updated_row: data });
  });
} else {
  log({ warning: "rpcBtn not found in index.html (id='rpcBtn')" });
}
