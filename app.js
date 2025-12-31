// 1) Paste these two values from Supabase Project Settings -> API
const SUPABASE_URL = "https://gmvulstojuiggxstomcq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtdnVsc3RvanVpZ2d4c3RvbWNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTExOTMsImV4cCI6MjA4Mjc2NzE5M30.b8bXDljJkrOlQV8xEgMhGXvHOFq18V1s74Gc2vmqTew";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose for any other scripts (optional)
window.supabaseClientForStatusHook = supabase;

const out = document.getElementById("out");
const loginStatus = document.getElementById("loginStatus");

function log(obj) {
  out.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  console.log(obj);
}

function setStatus(msg, type = "") {
  if (!loginStatus) return;
  loginStatus.textContent = msg;
  loginStatus.className = type; // expects "success" or "error" CSS classes if you have them
}

// Quick proof app.js is running
setStatus("app.js loaded. Ready to login.");
log("app.js loaded.");

// Keep UI in sync with auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN") setStatus("Login successful ✔", "success");
  if (event === "SIGNED_OUT") setStatus("Logged out");
});

// A) Login
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  setStatus("Attempting login…");

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("Login failed: " + error.message, "error");
      return log({ step: "login", ok: false, error: error.message });
    }

    setStatus("Login successful ✔", "success");
    log({ step: "login", ok: true, user: data.user?.email });
  } catch (e) {
    setStatus("Login crashed: " + (e?.message || e), "error");
    log({ step: "login", ok: false, error: String(e) });
  }
});

// B) Fetch active events (after login)
document.getElementById("eventsBtn").addEventListener("click", async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return log("Not logged in. Login first.");

  const { data, error } = await supabase
    .from("events")
    .select("id,title,is_active,created_at")
    .eq("is_active", true);

  if (error) return log({ step: "select events", ok: false, error: error.message });
  log({ step: "select events", ok: true, rows: data });
});

// C) RPC check-in (after login)
document.getElementById("rpcBtn").addEventListener("click", async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return log("Not logged in. Login first.");

  const qr = document.getElementById("qr").value.trim();
  if (!qr) return log("Please enter a qr_code_url value first.");

  const { data, error } = await supabase.rpc("check_in_participant", { p_qr_code_url: qr });
  if (error) return log({ step: "rpc check_in_participant", ok: false, error: error.message });

  log({ step: "rpc check_in_participant", ok: true, updated_row: data });
});
