const createClient = window.supabase?.createClient;
if (!createClient) throw new Error("Supabase-Bibliothek konnte nicht geladen werden.");

const config = window.SPACE_CONTROL_CONFIG;
const $ = (id) => document.getElementById(id);
const supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let sessionId = localStorage.getItem("spaceControl.adminSessionId") || "";
let inviteUrl = "";
function readInviteToken() {
  const queryToken = new URLSearchParams(location.search).get("join");
  const hashText = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const hashParams = new URLSearchParams(hashText);
  return queryToken || hashParams.get("join") || "";
}
let currentToken = readInviteToken();
let currentUser = null;
let playerPollHandle = null;
let playerStatusCheckInFlight = false;
let adminPollHandle = null;

function notice(id, kind, message) {
  const el = $(id);
  el.className = "notice show " + kind;
  el.textContent = message;
}
function clearNotice(id) {
  const el = $(id);
  el.className = "notice";
  el.textContent = "";
}
function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = label;
}
async function ensureIdentity() {
  let { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  if (!session) {
    const result = await supabaseClient.auth.signInAnonymously();
    if (result.error) throw result.error;
    session = result.data.session;
  }
  currentUser = session.user;
  $("connection").textContent = "Browser sicher angemeldet";
  return session;
}
async function invoke(name, body) {
  const { data, error } = await supabaseClient.functions.invoke(name, { body });
  if (error) {
    let message = error.message || "Backend-Aufruf fehlgeschlagen";
    try {
      const payload = await error.context?.json();
      if (payload?.error) {
        message = payload.error;
        if (payload?.diagnostic?.code || payload?.diagnostic?.message) {
          message += " (" + [payload.diagnostic.code, payload.diagnostic.message].filter(Boolean).join(": ") + ")";
        }
      }
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
function showAdmin(sessionIdValue, displayName = "") {
  sessionId = sessionIdValue;
  if (displayName) localStorage.setItem("spaceControl.adminSessionName", displayName);
  const savedName = displayName || localStorage.getItem("spaceControl.adminSessionName") || "Partie";
  localStorage.setItem("spaceControl.adminSessionId", sessionId);
  $("admin-create").classList.add("hidden");
  $("resume-panel").classList.add("hidden");
  $("admin-panel").classList.remove("hidden");
  $("session-state").textContent = savedName + " · " + sessionId;
  loadRequests();
  loadRoster();
  if (adminPollHandle) clearInterval(adminPollHandle);
  adminPollHandle = setInterval(() => { if (!document.hidden) { loadRequests(); loadRoster(); } }, 5000);
}
async function checkPlayerStatus() {
  if (!currentUser || playerStatusCheckInFlight) return;
  const savedSession = localStorage.getItem("spaceControl.playerSessionId") || "";
  if (!savedSession) return;
  playerStatusCheckInFlight = true;
  try {
    // Never infer a player's game from an unrelated old request.
    // The active session is set only after this browser submits this invite.
    const query = supabaseClient.from("join_requests")
      .select("session_id,nickname,status,requested_at")
      .eq("user_id", currentUser.id)
      .eq("session_id", savedSession)
      .order("requested_at", { ascending: false })
      .limit(1);
    const { data, error } = await query;
    if (error) throw error;
    const request = data?.[0];
    if (!request) return;
    localStorage.setItem("spaceControl.playerSessionId", request.session_id);
    localStorage.setItem("spaceControl.playerNickname", request.nickname);
    if (request.status === "approved") {
      $("join-panel").classList.add("hidden");
      $("admin-create").classList.add("hidden");
      $("resume-panel").classList.add("hidden");
      $("admin-panel").classList.add("hidden");
      $("player-panel").classList.remove("hidden");
      $("player-name").textContent = request.nickname;
      $("player-state").textContent = "Du bist für diese Partie freigegeben.";
      const { data: member, error: memberError } = await supabaseClient
        .from("session_members").select("id").eq("session_id", request.session_id)
        .eq("user_id", currentUser.id).eq("status", "active").maybeSingle();
      if (memberError) throw memberError;
      if (!member) {
        localStorage.removeItem("spaceControl.playerSessionId");
        localStorage.removeItem("spaceControl.playerNickname");
        localStorage.removeItem("spaceControl.pendingJoinToken");
        $("player-panel").classList.add("hidden");
        $("join-panel").classList.remove("hidden");
        notice("join-notice", "error", "Für diese Partie wurde keine aktive Spielteilnahme gefunden. Bitte sende eine neue Beitrittsanfrage.");
        return;
      }
      const { data: sessionInfo, error: sessionError } = await supabaseClient
        .from("game_sessions").select("id,display_name,status").eq("id", request.session_id).maybeSingle();
      if (sessionError) throw sessionError;
      if (sessionInfo) {
        $("player-session-name").textContent = sessionInfo.display_name;
        $("player-session-id").textContent = sessionInfo.id;
        $("player-state").textContent = sessionInfo.status === "active"
          ? "Die Partie wurde gestartet. Viel Erfolg!"
          : "Du bist freigegeben. Die Spielleitung startet die Partie, sobald sie bereit ist.";
      }
      const { data: account, error: accountError } = await supabaseClient
        .from("accounts").select("balance").eq("session_id", request.session_id)
        .eq("member_id", member.id).maybeSingle();
      if (accountError) throw accountError;
      if (account) $("player-balance").textContent = Number(account.balance).toLocaleString("de-DE") + " Credits";
      notice("player-notice", "ok", "Teilnahme bestätigt. Du kannst diese Seite jederzeit erneut öffnen.");
    } else if (request.status === "pending") {
      $("join-panel").classList.remove("hidden");
      $("join-form").classList.add("hidden");
      $("admin-create").classList.add("hidden");
      notice("join-notice", "info", "Deine Beitrittsanfrage ist eingegangen. Warte auf die Freigabe durch die Spielleitung.");
    } else if (request.status === "rejected" || request.status === "expired") {
      notice("join-notice", "error", "Deine Beitrittsanfrage wurde " + (request.status === "rejected" ? "abgelehnt." : "ist abgelaufen.") + " Bitte scanne einen aktuellen Einladungscode.");
    }
  } catch (error) {
    notice("player-notice", "error", "Spielerstatus konnte nicht aktualisiert werden: " + error.message);
  } finally {
    playerStatusCheckInFlight = false;
  }
}
function startPlayerPolling() {
  if (playerPollHandle) clearInterval(playerPollHandle);
  checkPlayerStatus();
  // Check frequently while waiting for the game master; refresh immediately
  // when the browser becomes active or reconnects after a network interruption.
  playerPollHandle = setInterval(() => {
    if (!document.hidden && navigator.onLine) checkPlayerStatus();
  }, 2500);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && playerPollHandle) checkPlayerStatus();
});
window.addEventListener("focus", () => {
  if (playerPollHandle) checkPlayerStatus();
});
window.addEventListener("pageshow", () => {
  if (playerPollHandle) checkPlayerStatus();
});
window.addEventListener("online", () => {
  if (playerPollHandle) checkPlayerStatus();
});
async function createInvite() {
  clearNotice("invite-notice");
  $("invite-result").classList.add("hidden");
  const data = await invoke("create_session_invite", { session_id: sessionId });
  const invite = data.invite;
  if (!invite?.token) throw new Error("Das Backend hat keinen Einladungstoken geliefert.");
  const url = new URL("./join.html", location.href);
  url.searchParams.set("join", invite.token);
  inviteUrl = url.toString();
  $("qr-code").replaceChildren();
  if (!window.QRCode) throw new Error("Der QR-Code-Dienst konnte nicht geladen werden. Bitte Seite neu laden.");
  new QRCode($("qr-code"), { text: inviteUrl, width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M });
  $("invite-url").textContent = inviteUrl;
  $("invite-expiry").textContent = new Date(invite.expires_at).toLocaleString("de-DE");
  $("invite-result").classList.remove("hidden");
  notice("invite-notice", "ok", "Einladung erstellt. Vorherige QR-Codes dieser Partie sind jetzt ungültig.");
}
async function loadRequests() {
  if (!sessionId) return;
  const list = $("request-list");
  try {
    const { data, error } = await supabaseClient
      .from("join_requests")
      .select("id,nickname,requested_at,status")
      .eq("session_id", sessionId)
      .eq("status", "pending")
      .order("requested_at", { ascending: true });
    if (error) throw error;
    list.replaceChildren();
    if (!data?.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Aktuell liegen keine offenen Beitrittsanfragen vor.";
      list.append(empty);
      return;
    }
    for (const request of data) {
      const item = document.createElement("div");
      item.className = "request";
      const details = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = request.nickname;
      const time = document.createElement("small");
      time.textContent = "Anfrage: " + new Date(request.requested_at).toLocaleString("de-DE");
      details.append(name, time);
      const actions = document.createElement("div");
      actions.className = "actions";
      const approve = document.createElement("button");
      approve.textContent = "Freigeben";
      approve.addEventListener("click", () => decideRequest(request.id, "approve", approve));
      const reject = document.createElement("button");
      reject.className = "danger";
      reject.textContent = "Ablehnen";
      reject.addEventListener("click", () => decideRequest(request.id, "reject", reject));
      actions.append(approve, reject);
      item.append(details, actions);
      list.append(item);
    }
  } catch (error) {
    notice("request-notice", "error", "Anfragen konnten nicht geladen werden: " + error.message);
  }
  await loadRoster();
}
async function loadRoster() {
  if (!sessionId || !$("roster-count") || !$("roster-list") || !$("start-session") || !$("start-info")) return;
  try {
    const [{ data: members, error: memberError }, { data: accounts, error: accountError }, { data: session, error: sessionError }] = await Promise.all([
      supabaseClient.from("session_members").select("id,nickname,status,joined_at").eq("session_id", sessionId).order("joined_at", { ascending: true }),
      supabaseClient.from("accounts").select("member_id,balance").eq("session_id", sessionId),
      supabaseClient.from("game_sessions").select("status,max_members").eq("id", sessionId).maybeSingle()
    ]);
    if (memberError) throw memberError;
    if (accountError) throw accountError;
    if (sessionError) throw sessionError;

    const balanceByMember = new Map((accounts || []).map(account => [account.member_id, account.balance]));
    const activeMembers = (members || []).filter(member => member.status === "active");
    const target = Number(session?.max_members || 0);
    const missing = Math.max(0, target - activeMembers.length);
    $("roster-count").textContent = activeMembers.length + " von " + target + " Spielern angemeldet";
    $("roster-list").replaceChildren();

    if (!activeMembers.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Noch keine Spieler freigegeben.";
      $("roster-list").append(empty);
    } else {
      for (const member of activeMembers) {
        const item = document.createElement("div");
        item.className = "request";
        const details = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = member.nickname;
        const meta = document.createElement("small");
        meta.textContent = "Angemeldet · " + Number(balanceByMember.get(member.id) ?? 0).toLocaleString("de-DE") + " Credits";
        details.append(name, meta);
        item.append(details);
        $("roster-list").append(item);
      }
    }

    if (session?.status === "active") {
      $("start-session").disabled = true;
      $("start-session").textContent = "Partie läuft";
      $("start-info").textContent = "Die Partie wurde gestartet. Alle Spieler wechseln automatisch in den gestarteten Spielzustand.";
    } else {
      $("start-session").disabled = activeMembers.length < 2;
      $("start-session").textContent = "Partie starten";
      $("start-info").textContent = activeMembers.length < 2
        ? "Zum Start werden mindestens 2 freigegebene Spieler benötigt. Aktuell fehlt noch " + (2 - activeMembers.length) + " Spieler."
        : (missing > 0
            ? "Es fehlen noch " + missing + (missing === 1 ? " Mitspieler" : " Mitspieler") + " bis zur gewünschten Besetzung. Du kannst mit den bereits angemeldeten Spielern trotzdem starten."
            : "Alle vorgesehenen Spielerplätze sind besetzt. Die Partie kann gestartet werden.");
    }
  } catch (error) {
    notice("roster-notice", "error", "Spielerliste konnte nicht geladen werden: " + error.message);
  }
}
async function startSession() {
  const button = $("start-session");
  setBusy(button, true, "Partie wird gestartet …");
  clearNotice("roster-notice");
  try {
    const { data, error } = await supabaseClient.rpc("start_session", { p_session_id: sessionId });
    if (error) throw error;
    notice("roster-notice", "ok", "Partie gestartet. Die Spielerhandys erhalten die Änderung automatisch.");
    await loadRoster();
  } catch (error) {
    notice("roster-notice", "error", "Partie konnte nicht gestartet werden: " + error.message);
    setBusy(button, false, "Partie starten");
  }
}
async function decideRequest(requestId, decision, button) {
  clearNotice("request-notice");
  setBusy(button, true, decision === "approve" ? "Wird freigegeben …" : "Wird abgelehnt …");
  try {
    const endpoint = decision === "approve" ? "approve_join_request" : "reject_join_request";
    await invoke(endpoint, { request_id: requestId });
    notice("request-notice", "ok", decision === "approve"
      ? "Spieler freigegeben. Das Spielerkonto wurde mit 1.000 Credits angelegt."
      : "Beitrittsanfrage abgelehnt.");
    await loadRequests();
    await loadRoster();
  } catch (error) {
    notice("request-notice", "error", error.message);
    setBusy(button, false, decision === "approve" ? "Freigeben" : "Ablehnen");
  }
}

$("create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice("create-notice");
  const button = $("create-submit");
  setBusy(button, true, "Partie wird erstellt …");
  try {
    const data = await invoke("create_session", {
      game_id: "space-control",
      display_name: $("session-name").value.trim(),
      max_members: Number($("max-members").value)
    });
    const createdId = data.session?.session_id;
    if (!createdId) throw new Error("Das Backend hat keine Partie-ID geliefert.");
    showAdmin(createdId);
    notice("invite-notice", "info", "Partie erstellt. Erzeuge jetzt den gemeinsamen QR-Code.");
  } catch (error) {
    notice("create-notice", "error", error.message);
  } finally {
    setBusy(button, false, "Partie erstellen");
  }
});

$("invite-button").addEventListener("click", async () => {
  setBusy($("invite-button"), true, "QR-Code wird erzeugt …");
  try { await createInvite(); }
  catch (error) { notice("invite-notice", "error", error.message); }
  finally { setBusy($("invite-button"), false, "QR-Code erzeugen / erneuern"); }
});

$("copy-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(inviteUrl);
    notice("invite-notice", "ok", "Einladungslink wurde kopiert.");
  } catch {
    notice("invite-notice", "error", "Kopieren nicht möglich. Bitte den Link markieren und manuell kopieren.");
  }
});

$("refresh-requests").addEventListener("click", () => { loadRequests(); loadRoster(); });
$("start-session")?.addEventListener("click", startSession);
$("player-refresh").addEventListener("click", checkPlayerStatus);
$("player-leave").addEventListener("click", async () => {
  const playerSessionId = localStorage.getItem("spaceControl.playerSessionId");
  if (!playerSessionId) return;
  if (!window.confirm("Möchtest du diese Partie wirklich verlassen? Dein Kontostand und die Buchungshistorie bleiben erhalten.")) return;
  setBusy($("player-leave"), true, "Austritt wird ausgeführt …");
  try {
    const { data, error } = await supabaseClient.rpc("leave_own_session", { p_session_id: playerSessionId });
    if (error) throw error;
    localStorage.removeItem("spaceControl.playerSessionId");
    localStorage.removeItem("spaceControl.playerNickname");
    localStorage.removeItem("spaceControl.pendingJoinToken");
    if (playerPollHandle) { clearInterval(playerPollHandle); playerPollHandle = null; }
    $("player-panel").classList.add("hidden");
    $("admin-create").classList.remove("hidden");
    notice("create-notice", "ok", "Du hast die Partie verlassen. Dein Konto und deine Buchungshistorie bleiben erhalten.");
  } catch (error) {
    notice("player-notice", "error", "Austritt nicht möglich: " + error.message);
    setBusy($("player-leave"), false, "Partie verlassen");
  }
});
$("resume-session").addEventListener("click", () => showAdmin(sessionId));
$("new-session").addEventListener("click", () => {
  localStorage.removeItem("spaceControl.adminSessionId");
  sessionId = "";
  $("admin-panel").classList.add("hidden");
  $("resume-panel").classList.add("hidden");
  $("admin-create").classList.remove("hidden");
});

$("join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice("join-notice");
  const button = $("join-submit");
  setBusy(button, true, "Anfrage wird gesendet …");
  try {
    const data = await invoke("request_session_join", {
      token: currentToken,
      nickname: $("nickname").value.trim()
    });
    const request = data.join_request;
    if (request?.session_name) $("join-session-name").textContent = request.session_name;
    if (request?.session_id) $("join-session-id").textContent = request.session_id;
    notice("join-notice", "ok", request?.already_requested
      ? "Deine Beitrittsanfrage ist bereits offen. Die Spielleitung muss sie noch freigeben."
      : "Deine Beitrittsanfrage wurde gesendet. Du bist nach der Freigabe durch die Spielleitung dabei.");
    localStorage.setItem("spaceControl.pendingJoinToken", currentToken);
    localStorage.setItem("spaceControl.playerSessionId", request.session_id);
    localStorage.setItem("spaceControl.playerNickname", request.nickname || $("nickname").value.trim());
    $("join-form").classList.add("hidden");
    startPlayerPolling();
  } catch (error) {
    notice("join-notice", "error", error.message);
  } finally {
    setBusy(button, false, "Beitrittsanfrage senden");
  }
});

async function boot() {
  try {
    await ensureIdentity();
    const savedPlayerSession = localStorage.getItem("spaceControl.playerSessionId");
    if (currentToken) {
      $("join-panel").classList.remove("hidden");
      $("admin-create").classList.add("hidden");
      $("connection").textContent = "Einladung erkannt · Spielerbeitritt";
      $("resume-panel").classList.add("hidden");
      $("join-session-name").textContent = "Partie wird geladen …";
      $("join-session-id").textContent = "–";
      try {
        const inviteInfo = await invoke("get_session_invite_info", { token: currentToken });
        $("join-session-name").textContent = inviteInfo.session.display_name;
        $("join-session-id").textContent = inviteInfo.session.id;
        localStorage.setItem("spaceControl.pendingInviteSessionId", inviteInfo.session.id);
        localStorage.setItem("spaceControl.pendingInviteSessionName", inviteInfo.session.display_name);
      } catch (error) {
        $("join-session-name").textContent = "Einladung nicht verfügbar";
        $("join-session-id").textContent = "–";
        notice("join-notice", "error", error.message);
      }
      $("admin-panel").classList.add("hidden");
      // A QR scan must always show the join form first. Do not poll an old
      // session belonging to this browser before the player submits this invite.
      $("join-form").classList.remove("hidden");
      const pendingToken = localStorage.getItem("spaceControl.pendingJoinToken");
      if (pendingToken === currentToken) {
        $("join-form").classList.add("hidden");
        notice("join-notice", "info", "Deine Beitrittsanfrage wurde bereits gesendet. Bitte warte auf die Freigabe durch die Spielleitung.");
        startPlayerPolling();
      }
      return;
    }
    if (savedPlayerSession) {
      $("player-panel").classList.remove("hidden");
      $("admin-create").classList.add("hidden");
      $("resume-panel").classList.add("hidden");
      $("admin-panel").classList.add("hidden");
      $("player-name").textContent = localStorage.getItem("spaceControl.playerNickname") || "Spieler";
      $("player-state").textContent = "Gespeicherte Teilnahme wird wiederhergestellt …";
      startPlayerPolling();
      return;
    }
    if (sessionId) $("resume-panel").classList.remove("hidden");
  } catch (error) {
    $("connection").textContent = "Verbindung fehlgeschlagen";
    notice("create-notice", "error", "Supabase-Anmeldung nicht möglich: " + error.message + ". Prüfe, ob anonyme Anmeldungen im Supabase-Projekt aktiviert sind.");
  }
}
boot();
