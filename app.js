// ===== Supabase Config =====
// Keep anon key here for now (fine for GitHub Pages). Never use service_role key on frontend.
const SUPABASE_URL = "https://gmvulstojuiggxstomcq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtdnVsc3RvanVpZ2d4c3RvbWNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTExOTMsImV4cCI6MjA4Mjc2NzE5M30.b8bXDljJkrOlQV8xEgMhGXvHOFq18V1s74Gc2vmqTew";

if (!window.supabase) {
  alert("Supabase library not loaded. Check the CDN script tag in HTML.");
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Helpers =====
const $ = (id) => document.getElementById(id);

function setPill(text, kind = "neutral") {
  const pill = $("authPill");
  if (!pill) return;
  pill.textContent = text;
  pill.className = `pill ${kind}`;
}

function show(id, yes) {
  const el = $(id);
  if (!el) return;
  el.style.display = yes ? "" : "none";
}

function fmtDateTime(dateStr, timeStr) {
  if (!dateStr && !timeStr) return "";
  return [dateStr || "", timeStr || ""].filter(Boolean).join(" ");
}

function fmtLocal(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

async function requireSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function ensureAuthUI() {
  const session = await requireSession();
  const logoutBtn = $("logoutBtn");

  if (session) {
    setPill("Signed in", "good");
    if (logoutBtn) logoutBtn.style.display = "";
    show("loginCard", false);
    return true;
  }

  setPill("Not signed in", "neutral");
  if (logoutBtn) logoutBtn.style.display = "none";
  show("loginCard", true);
  return false;
}

async function doLogin() {
  const email = ($("email")?.value || "").trim();
  const password = $("password")?.value || "";
  const status = $("loginStatus");
  if (status) {
    status.textContent = "Signing in...";
    status.className = "status";
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    if (status) {
      status.textContent = error.message;
      status.className = "status error";
    }
    return;
  }
  if (status) {
    status.textContent = "Login successful.";
    status.className = "status success";
  }
}

async function doLogout() {
  await supabaseClient.auth.signOut();
}

// ===== Page: Dashboard =====
async function loadDashboard() {
  show("dashboardCard", false);
  show("errorCard", false);

  const sessionOk = await ensureAuthUI();
  if (!sessionOk) return;

  // Get active event (first active one)
  const { data: events, error: eErr } = await supabaseClient
    .from("events")
    .select("id, title, location_name, start_date, start_time, is_active, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (eErr) return fatal(eErr.message);
  if (!events || events.length === 0) {
    return fatal("No active event found. Set one event is_active = true.");
  }

  const ev = events[0];
  $("eventTitle").textContent = ev.title || "Active Event";
  $("eventMeta").textContent = [ev.location_name, fmtDateTime(ev.start_date, ev.start_time)].filter(Boolean).join(" • ");

  const { data: rows, error: pErr } = await supabaseClient
    .from("event_participants")
    .select("participant_name, checked_in, checked_in_at, qr_code_url")
    .eq("event_id", ev.id)
    .order("checked_in", { ascending: true })
    .order("participant_name", { ascending: true });

  if (pErr) return fatal(pErr.message);

  const total = rows.length;
  const checked = rows.filter(r => r.checked_in).length;
  $("statTotal").textContent = String(total);
  $("statChecked").textContent = String(checked);
  $("statRemaining").textContent = String(total - checked);

  const tbody = $("tbody");
  const search = $("search");

  function render(filterText) {
    const f = (filterText || "").toLowerCase().trim();
    const list = rows.filter(r => !f || (r.participant_name || "").toLowerCase().includes(f));

    tbody.innerHTML = list.map(r => `
      <tr>
        <td>${r.checked_in ? "✅" : "⏳"}</td>
        <td>${escapeHtml(r.participant_name || "")}</td>
        <td>${escapeHtml(r.checked_in_at ? fmtLocal(r.checked_in_at) : "")}</td>
        <td>
          <a class="btn ghost" href="checkin.html?qr=${encodeURIComponent(r.qr_code_url || "")}">Check in</a>
        </td>
      </tr>
    `).join("");
  }

  render("");

  search?.addEventListener("input", () => render(search.value));
  $("refreshBtn")?.addEventListener("click", () => loadDashboard());

  show("dashboardCard", true);
}

// ===== Page: Check-in =====
async function loadCheckin() {
  show("checkinCard", false);
  show("errorCard", false);

  const sessionOk = await ensureAuthUI();
  if (!sessionOk) return;

  // Show active event meta
  const { data: events, error: eErr } = await supabaseClient
    .from("events")
    .select("id, title, location_name, start_date, start_time, is_active, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (eErr) return fatal(eErr.message);
  if (!events || events.length === 0) {
    return fatal("No active event found. Set one event is_active = true.");
  }

  const ev = events[0];
  $("activeEventMeta").textContent = [ev.title, ev.location_name, fmtDateTime(ev.start_date, ev.start_time)].filter(Boolean).join(" • ");

  const params = new URLSearchParams(location.search);
  const initialQr = params.get("qr") || "";
  if ($("qrInput")) $("qrInput").value = initialQr;

  $("lookupBtn")?.addEventListener("click", () => doLookupAndRender());
  $("clearBtn")?.addEventListener("click", () => {
    $("qrInput").value = "";
    $("lookupStatus").textContent = "";
    $("lookupStatus").className = "status";
    show("resultArea", false);
  });

  if (initialQr) await doLookupAndRender();
  show("checkinCard", true);
}

let currentQr = null;
let currentRow = null;

async function doLookupAndRender() {
  const qr = ($("qrInput")?.value || "").trim();
  const status = $("lookupStatus");

  if (!qr) {
    if (status) {
      status.textContent = "Please paste a QR value first.";
      status.className = "status error";
    }
    show("resultArea", false);
    return;
  }

  if (status) {
    status.textContent = "Looking up participant...";
    status.className = "status";
  }

  const { data, error } = await supabaseClient
    .from("event_participants")
    .select("participant_name, participant_type, participant_affiliation, invite_image_url, checked_in, checked_in_at, qr_code_url")
    .eq("qr_code_url", qr)
    .limit(1);

  if (error) {
    if (status) {
      status.textContent = error.message;
      status.className = "status error";
    }
    show("resultArea", false);
    return;
  }

  if (!data || data.length === 0) {
    if (status) {
      status.textContent = "No matching participant found (or event not active).";
      status.className = "status error";
    }
    show("resultArea", false);
    return;
  }

  currentRow = data[0];
  currentQr = currentRow.qr_code_url;

  $("pName").textContent = currentRow.participant_name || "Participant";
  $("pMeta").textContent = [currentRow.participant_type, currentRow.participant_affiliation].filter(Boolean).join(" • ");

  const badge = $("pBadge");
  if (currentRow.checked_in) {
    badge.textContent = "Checked in";
    badge.className = "pill good";
    $("confirmBtn").disabled = true;
  } else {
    badge.textContent = "Not checked in";
    badge.className = "pill neutral";
    $("confirmBtn").disabled = false;
  }

  if (currentRow.invite_image_url) {
    $("inviteImg").src = currentRow.invite_image_url;
    show("inviteWrap", true);
  } else {
    show("inviteWrap", false);
  }

  $("confirmBtn")?.addEventListener("click", async () => {
    await doConfirmCheckin();
  }, { once: true });

  if (status) {
    status.textContent = "Participant found.";
    status.className = "status success";
  }
  show("resultArea", true);
}

async function doConfirmCheckin() {
  const status = $("lookupStatus");
  if (!currentQr) return;

  $("confirmBtn").disabled = true;
  if (status) {
    status.textContent = "Checking in...";
    status.className = "status";
  }

  const { data, error } = await supabaseClient.rpc("check_in_participant", {
    p_qr_code_url: currentQr
  });

  if (error) {
    $("confirmBtn").disabled = false;
    if (status) {
      status.textContent = error.message;
      status.className = "status error";
    }
    return;
  }

  // Refresh view using returned row if present, otherwise re-lookup
  if (status) {
    status.textContent = "Check-in confirmed.";
    status.className = "status success";
  }
  await doLookupAndRender();
}

// ===== Fatal / Escape =====
function fatal(msg) {
  show("dashboardCard", false);
  show("checkinCard", false);
  show("errorCard", true);
  const el = $("fatalError");
  if (el) el.textContent = msg;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// ===== Init =====
window.addEventListener("load", async () => {
  $("loginBtn")?.addEventListener("click", doLogin);
  $("logoutBtn")?.addEventListener("click", doLogout);

  supabaseClient.auth.onAuthStateChange(() => {
    const page = document.body.getAttribute("data-page");
    if (page === "checkin") loadCheckin();
    else loadDashboard();
  });

  const page = document.body.getAttribute("data-page");
  if (page === "checkin") await loadCheckin();
  else await loadDashboard();
});
