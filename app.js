// ===== Supabase Config =====
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

// ===== Shared: get active event =====
async function getActiveEvent() {
  const { data: events, error } = await supabaseClient
    .from("events")
    .select("id, title, location_name, start_date, start_time, is_active, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!events || events.length === 0) {
    throw new Error("No active event found. Set one event is_active = true.");
  }
  return events[0];
}

// ===== Page: Dashboard =====
async function loadDashboard() {
  show("dashboardCard", false);
  show("errorCard", false);

  const sessionOk = await ensureAuthUI();
  if (!sessionOk) return;

  let ev;
  try {
    ev = await getActiveEvent();
  } catch (e) {
    return fatal(e.message || String(e));
  }

  $("eventTitle").textContent = ev.title || "Active Event";
  $("eventMeta").textContent = [ev.location_name, fmtDateTime(ev.start_date, ev.start_time)].filter(Boolean).join(" • ");

  const { data: rows, error: pErr } = await supabaseClient
    .from("event_participants")
    .select("participant_name, checked_in, checked_in_at, qr_token")
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
          <a class="btn ghost" href="checkin.html?t=${encodeURIComponent(r.qr_token || "")}">Check in</a>
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
let activeEventId = null;
let currentToken = null;
let currentRow = null;

async function loadCheckin() {
  show("checkinCard", false);
  show("errorCard", false);

  const sessionOk = await ensureAuthUI();
  if (!sessionOk) return;

  let ev;
  try {
    ev = await getActiveEvent();
  } catch (e) {
    return fatal(e.message || String(e));
  }

  activeEventId = ev.id;
  if ($("activeEventMeta")) {
    $("activeEventMeta").textContent = [ev.title, ev.location_name, fmtDateTime(ev.start_date, ev.start_time)]
      .filter(Boolean).join(" • ");
  }

  const params = new URLSearchParams(location.search);
  const token = (params.get("t") || "").trim();

  if (!token) {
    const status = $("lookupStatus");
    if (status) {
      status.textContent = "No QR token found in the URL. Please scan a participant QR code.";
      status.className = "status error";
    }
    show("resultArea", false);
    show("checkinCard", true);
    return;
  }

  await doLookupAndRender(token);
  show("checkinCard", true);
}

async function doLookupAndRender(token) {
  const status = $("lookupStatus");

  if (status) {
    status.textContent = "Looking up participant...";
    status.className = "status";
  }

  const { data, error } = await supabaseClient
    .from("event_participants")
    .select("participant_name, participant_type, participant_affiliation, invite_image_url, checked_in, checked_in_at, qr_token")
    .eq("event_id", activeEventId)
    .eq("qr_token", token)
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
      status.textContent = "Not a registered participant for the active event.";
      status.className = "status error";
    }
    show("resultArea", false);
    return;
  }

  currentRow = data[0];
  currentToken = currentRow.qr_token;

  $("pName").textContent = currentRow.participant_name || "Participant";
  $("pMeta").textContent = [currentRow.participant_type, currentRow.participant_affiliation].filter(Boolean).join(" • ");

  const badge = $("pBadge");
  const confirmBtn = $("confirmBtn");

  if (currentRow.checked_in) {
    badge.textContent = `Checked in${currentRow.checked_in_at ? " • " + fmtLocal(currentRow.checked_in_at) : ""}`;
    badge.className = "pill good profile-badge";
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Already checked in";
  } else {
    badge.textContent = "Not checked in";
    badge.className = "pill neutral profile-badge";
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirm check-in";
  }

  if (currentRow.invite_image_url) {
    $("inviteImg").src = currentRow.invite_image_url;
    show("inviteWrap", true);
  } else {
    show("inviteWrap", false);
  }

  // Confirm should actually check in, then redirect to dashboard
  confirmBtn.onclick = async () => {
    await doConfirmCheckin();
  };

  if (status) {
    status.textContent = "Participant loaded.";
    status.className = "status success";
  }
  show("resultArea", true);
}

async function doConfirmCheckin() {
  const status = $("lookupStatus");
  const confirmBtn = $("confirmBtn");

  if (!currentToken) return;

  confirmBtn.disabled = true;
  if (status) {
    status.textContent = "Checking in...";
    status.className = "status";
  }

  const { error } = await supabaseClient.rpc("check_in_participant", {
    p_qr_token: currentToken
  });

  if (error) {
    confirmBtn.disabled = false;
    if (status) {
      status.textContent = error.message;
      status.className = "status error";
    }
    return;
  }

  // Success: go to dashboard to show updated counts
  window.location.href = "index.html";
}


// ===== Page: Admin Add Participants =====
let allParticipants = [];
let selected = new Set();

function setAdminStatus(msg, kind = "") {
  const el = $("adminStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "status" + (kind ? " " + kind : "");
}

function updateSelCount() {
  const el = $("selCount");
  if (el) el.textContent = String(selected.size);
}

function participantRowHtml(p) {
  const id = p.id;
  const checked = selected.has(id) ? "checked" : "";
  return `
    <tr>
      <td><input type="checkbox" data-pid="${escapeHtml(id)}" ${checked} /></td>
      <td>${escapeHtml(p.full_name || "")}</td>
      <td>${escapeHtml(p.participant_type || "")}</td>
      <td>${escapeHtml(p.affiliation || "")}</td>
    </tr>
  `;
}

function renderParticipantsWithSource(filterText, sourceList) {
  const tbody = $("pTbody");
  if (!tbody) return;

  const list0 = sourceList || [];
  const f = (filterText || "").toLowerCase().trim();

  const list = list0.filter(p => {
    const name = (p.full_name || "").toLowerCase();
    return !f || name.includes(f);
  });

  tbody.innerHTML = list.map(p => {
    const id = p.id;
    const checked = selected.has(id) ? "checked" : "";
    return `
      <tr>
        <td><input type="checkbox" data-pid="${escapeHtml(id)}" ${checked} /></td>
        <td>${escapeHtml(p.full_name || "")}</td>
        <td>${escapeHtml(p.participant_type || "")}</td>
        <td>${escapeHtml(p.affiliation || "")}</td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll('input[type="checkbox"][data-pid]').forEach(cb => {
    cb.addEventListener("change", (e) => {
      const pid = e.target.getAttribute("data-pid");
      if (e.target.checked) selected.add(pid);
      else selected.delete(pid);
      updateSelCount();
    });
  });

  updateSelCount();
}

async function loadAdminAdd() {
  show("adminCard", false);
  show("errorCard", false);

  const sessionOk = await ensureAuthUI();
  if (!sessionOk) return;

  setAdminStatus("Loading events and participants...");

  // Load events 
  const { data: events, error: eErr } = await supabaseClient
    .from("events")
    .select("id, title, start_date, start_time, is_active, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  
  if (eErr) return fatal(eErr.message);
  if (!events || events.length === 0) return fatal("No active events found. Set one event is_active = true.");

  const eventSelect = $("eventSelect");
  eventSelect.innerHTML = events.map(ev => {
    const label = `${ev.title || "Untitled"}${ev.is_active ? " (active)" : ""}`;
    return `<option value="${escapeHtml(ev.id)}">${escapeHtml(label)}</option>`;
  }).join("");

  // Load active participants (use your real column names from the screenshot)
  const { data: participants, error: pErr } = await supabaseClient
    .from("participants")
    .select("id, full_name, participant_type, affiliation, is_active")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  
  if (pErr) return fatal(pErr.message);
  
  allParticipants = participants || [];
  selected = new Set();

  // refresh function that filters out already-added participants
  async function refreshCandidateListForSelectedEvent() {
    const eventId = $("eventSelect")?.value;
    if (!eventId) return;
  
    setAdminStatus("Loading eligible participants...", "");
  
    let existingIds;
    try {
      existingIds = await getExistingParticipantIdsForEvent(eventId);
    } catch (e) {
      setAdminStatus("Failed to load event participants: " + (e.message || e), "error");
      return;
    }
  
    // Keep only active participants NOT already added to this event
    const eligible = allParticipants.filter(p => !existingIds.has(p.id));
  
    // Reset selection when switching events
    selected = new Set();
  
    // Replace the list the renderer uses
    window.__eligibleParticipants = eligible; // simple storage for render
    renderParticipantsWithSource("", eligible);
  
    setAdminStatus(`Ready. Eligible participants: ${eligible.length}`, "success");
  }
  
  // Initial filter based on currently selected event
  await refreshCandidateListForSelectedEvent();
  
  // a helper that returns a Set of already-added participant_ids for an event
  async function getExistingParticipantIdsForEvent(eventId) {
    const { data, error } = await supabaseClient
      .from("event_participants")
      .select("participant_id")
      .eq("event_id", eventId);
  
    if (error) throw error;
  
    return new Set((data || []).map(r => r.participant_id));
  }
  // Load participants
  // IMPORTANT: your participants table column names must match these selects:
  // - id (uuid), full_name, participant_type, participant_affiliation
  const { data: participants, error: pErr } = await supabaseClient
    .from("participants")
    .select("id, full_name, participant_type, affiliation")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (pErr) return fatal(pErr.message);

  allParticipants = participants || [];
  selected = new Set();
  renderParticipants("");

  $("pSearch").addEventListener("input", (e) => {
    renderParticipantsWithSource(e.target.value, window.__eligibleParticipants || []);
  });

  $("selectAllBtn").onclick = () => {
    const eligible = window.__eligibleParticipants || [];
    const f = ($("pSearch")?.value || "").toLowerCase().trim();
  
    eligible
      .filter(p => !f || (p.full_name || "").toLowerCase().includes(f))
      .forEach(p => selected.add(p.id));
  
    renderParticipantsWithSource($("pSearch")?.value || "", eligible);
  };

  $("clearSelBtn").onclick = () => {
    selected = new Set();
    renderParticipantsWithSource($("pSearch")?.value || "", window.__eligibleParticipants || []);
  };

  $("addBtn").onclick = async () => {
    const eventId = eventSelect.value;
    if (!eventId) return setAdminStatus("Please select an event.", "error");
    if (selected.size === 0) return setAdminStatus("Select at least one participant.", "error");

    setAdminStatus("Adding selected participants...", "");

    // Build rows for event_participants.
    // This assumes event_participants has participant_id and event_id not null.
    // If you also require participant_name/type/affiliation, we can include those too.
    const rows = Array.from(selected).map(pid => {
      const p = allParticipants.find(x => x.id === pid);
      return {
        event_id: eventId,
        participant_id: pid,
        participant_name: p?.full_name || null,
        participant_type: p?.participant_type || null,
        participant_affiliation: p?.affiliation || null
      };
    });

    // Use upsert to avoid duplicate errors
    const { error } = await supabaseClient
      .from("event_participants")
      .upsert(rows, { onConflict: "event_id,participant_id" });

    if (error) {
      setAdminStatus("Add failed: " + error.message, "error");
      return;
    }

    setAdminStatus(`Added/updated ${rows.length} participants for this event.`, "success");
    await refreshCandidateListForSelectedEvent();
  };

  setAdminStatus("Ready.", "success");
  show("adminCard", true);
}

// When event changes, refresh the eligible list
$("eventSelect").addEventListener("change", async () => {
  $("pSearch").value = "";
  await refreshCandidateListForSelectedEvent();
});



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
    else if (page === "admin-add") loadAdminAdd();
    else loadDashboard();
  });

  const page = document.body.getAttribute("data-page");
  if (page === "checkin") await loadCheckin();
  else if (page === "admin-add") await loadAdminAdd();
  else await loadDashboard();
});
