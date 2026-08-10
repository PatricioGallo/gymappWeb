import { setupNavToggle, setupRevealObserver } from "../lib/nav";
import { supabase } from "../lib/supabaseClient";
import { escapeHtml } from "../lib/dom";
import { diaLabel, formatFechaCorta } from "../lib/dias";
import {
  getProfile,
  getProfileByUsername,
  getProfileBasicByUsername,
  getProfileBasicById,
  getProfilesBasicByIds,
  uploadAvatar,
  listRoutines,
  finishRoutine,
  reactivateRoutine,
  listWeightLogsWithContext,
  parseProfileLinks,
  type Profile,
  type ProfileBasic,
  type ProfileLink,
  type RoutineWithCounts,
  type WeightLogEntry,
} from "../services/profile.service";
import { setRoutinePublic } from "../services/routine.service";
import { routineOwnerLineMarkup, type BasicNamedProfile } from "../lib/routineOwner";
import { getFollowStatus, getFollowCounts, followUser, unfollowOrCancel, type FollowStatus } from "../services/follow.service";
import { getOrCreateConversation } from "../services/chat.service";
import {
  getSubscriptionStatus,
  getSubscriberCount,
  subscribeToTrainer,
  unsubscribeOrCancel,
  listSubscribers,
  type SubscriptionStatus,
  type SubscriberListRow,
} from "../services/subscription.service";
import { getBlockStatus, blockUser, unblockUser, type BlockStatus } from "../services/block.service";
import { submitErrorReport, validateErrorReport } from "../services/errorReport.service";
import { submitUserReport, validateUserReport } from "../services/userReport.service";
import { renderVerifiedBadge, getUserTypeLabel } from "../lib/verifiedBadge";
import { getPlatform } from "../lib/socialLinks";

declare const Chart: any;

setupNavToggle();
setupRevealObserver();
setupProfileMenuToggle();
setupRoutineMenuOutsideClick();

const { data: sessionData } = await supabase.auth.getSession();
const myId = sessionData.session?.user.id ?? null;

const urlParams = new URLSearchParams(window.location.search);
// pages/profile.html (nav "Perfil") es siempre TU perfil salvo que le pasen ?u=.
// Cualquier otra ruta (gymsocial.com.ar/<username>) llega aca via 404.html:
// GitHub Pages no tiene rewrites, asi que 404.html sirve este mismo script y
// leemos el username directo del path en vez de la query.
const onOwnProfilePage = window.location.pathname.endsWith("/pages/profile.html");
const pathUsername = onOwnProfilePage ? null : window.location.pathname.replace(/^\/+|\/+$/g, "") || null;
const usernameParam = urlParams.get("u") ?? pathUsername;

if (!usernameParam && !myId) {
  window.location.href = "login.html";
  throw new Error("not authenticated");
}

// Un visitante sin sesion no tiene "su" perfil al que volver, ni "por que salir",
// ni solicitudes de seguimiento propias.
if (!myId) {
  document.getElementById("navPerfil")?.remove();
  document.getElementById("navSalir")?.remove();
  document.getElementById("navFollowRequests")?.remove();
  document.getElementById("footerPerfil")?.remove();
  document.getElementById("footerSalir")?.remove();
}

function parseFechaISO(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function computeWeeklyFrequency(logs: WeightLogEntry[], weeksBack = 8) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: { start: Date; count: number }[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() - i * 7);
    buckets.push({ start, count: 0 });
  }
  const seenDates = new Set<string>();
  logs.forEach((entry) => {
    // Un mismo entrenamiento carga varios pesos con la misma fecha: contamos
    // la fecha una sola vez por bucket, no cada fila.
    const key = entry.fecha;
    const fecha = parseFechaISO(entry.fecha);
    buckets.forEach((bucket) => {
      const end = new Date(bucket.start);
      end.setDate(bucket.start.getDate() + 7);
      if (fecha >= bucket.start && fecha < end && !seenDates.has(`${bucket.start.getTime()}-${key}`)) {
        seenDates.add(`${bucket.start.getTime()}-${key}`);
        bucket.count++;
      }
    });
  });
  return buckets.map((b) => ({ label: `${b.start.getDate()}/${b.start.getMonth() + 1}`, count: b.count }));
}

function mostFrequentExercise(logs: WeightLogEntry[]): { id: string; name: string } | null {
  const freq = new Map<string, { name: string; count: number }>();
  logs.forEach((l) => {
    const cur = freq.get(l.exerciseId) ?? { name: l.exerciseName, count: 0 };
    cur.count++;
    freq.set(l.exerciseId, cur);
  });
  let bestId: string | null = null;
  let bestName = "";
  let bestCount = 0;
  freq.forEach((v, id) => {
    if (v.count > bestCount) {
      bestCount = v.count;
      bestId = id;
      bestName = v.name;
    }
  });
  return bestId ? { id: bestId, name: bestName } : null;
}

function trainingDaysCount(logs: WeightLogEntry[]): number {
  return new Set(logs.map((l) => l.fecha)).size;
}

function lastTrainingLabel(logs: WeightLogEntry[]): string {
  if (logs.length === 0) return "Sin entrenos previos";
  return formatFechaCorta(logs[logs.length - 1].fecha);
}

// ---------- Avatar ----------

function initAvatar(profile: Profile) {
  const avatarImg = document.getElementById("avatarImg") as HTMLImageElement | null;
  const avatarInput = document.getElementById("avatarInput") as HTMLInputElement | null;
  const uploadingOverlay = document.getElementById("avatarUploading");
  if (!avatarInput || !avatarImg) return;

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    if (uploadingOverlay) uploadingOverlay.hidden = false;
    try {
      const { url, error } = await uploadAvatar(profile.id, file);
      if (error) {
        alert(error);
        avatarInput.value = "";
        return;
      }
      if (url) avatarImg.src = url;
    } finally {
      if (uploadingOverlay) uploadingOverlay.hidden = true;
    }
  });
}

// ---------- Compartir perfil ----------

function initShare(username: string, buttonId = "shareBtn") {
  const shareBtn = document.getElementById(buttonId);
  if (!shareBtn) return;
  const originalHTML = shareBtn.innerHTML;
  shareBtn.addEventListener("click", async () => {
    // gymsocial.com.ar/<username>: mas lindo que ?u= y funciona para cualquiera
    // que lo abra sin sesion iniciada (window.location.href de "mi" perfil no
    // lleva ningun parametro).
    const url = `${window.location.origin}/${encodeURIComponent(username)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mi perfil de Gym Social", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = "¡Copiado!";
      setTimeout(() => {
        shareBtn.innerHTML = originalHTML;
      }, 2000);
    } catch {
      // el usuario cancelo el share sheet, no es un error real
    }
  });
}

// ---------- Mensaje ----------

function initMessageButton(targetId: string, buttonId = "messageBtn") {
  const btn = document.getElementById(buttonId) as HTMLButtonElement | null;
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const { id, error } = await getOrCreateConversation(targetId);
    if (error || !id) {
      alert(error || "No se pudo abrir la conversación.");
      btn.disabled = false;
      return;
    }
    window.location.href = `chat.html?c=${id}`;
  });
}

// ---------- Identidad, estadisticas, bio y enlaces ----------

function renderProfileIdentity(username: string, nombre: string, apellido: string, userType: Profile["user_type"], isVerified: boolean) {
  const usernameEl = document.getElementById("profileUsername");
  if (usernameEl) usernameEl.innerHTML = `@${escapeHtml(username)}${renderVerifiedBadge(userType, isVerified, 20)}`;
  const fullnameEl = document.getElementById("profileFullname");
  if (fullnameEl) fullnameEl.textContent = `${nombre} ${apellido}`.trim();
  const roleEl = document.getElementById("profileRole");
  if (roleEl) {
    const label = getUserTypeLabel(userType, isVerified);
    if (label) roleEl.textContent = label;
    else roleEl.remove();
  }
}

async function renderProfileStats(userId: string, username: string, canViewLists: boolean, userType: Profile["user_type"]) {
  const stats = document.getElementById("profileStats");
  if (!stats) return;
  // Publicaciones todavia no existe (llega con el feed de la red social): se
  // muestra en 0 hasta que se sume ese sistema. Seguidores/seguidos si son reales.
  const counts = await getFollowCounts(userId).catch(() => ({ followers: 0, following: 0 }));
  // Suscriptores solo aplica a entrenadores (gimnasio tendra su propio sistema mas adelante).
  const subscriberCount = userType === "entrenador" ? await getSubscriberCount(userId).catch(() => 0) : null;
  const u = encodeURIComponent(username);

  function stat(count: number, label: string, tab: "followers" | "following" | "subscribers"): string {
    const inner = `<strong>${count}</strong> ${label}`;
    return canViewLists ? `<a class="profile-stat" href="followers.html?u=${u}&tab=${tab}">${inner}</a>` : `<span class="profile-stat">${inner}</span>`;
  }

  stats.innerHTML = `
    <span class="profile-stat"><strong>0</strong> publicaciones</span>
    ${stat(counts.followers, "seguidores", "followers")}
    ${stat(counts.following, "seguidos", "following")}
    ${subscriberCount !== null ? stat(subscriberCount, "suscriptores", "subscribers") : ""}
  `;
}

function renderProfileBio(bio: string | null) {
  const bioEl = document.getElementById("profileBio");
  if (!bioEl) return;
  if (!bio) {
    bioEl.remove();
    return;
  }
  bioEl.textContent = bio;

  // El clamp a 3 renglones viene puesto en el HTML (profile-bio-clamped); acá solo
  // medimos si realmente hace falta el toggle "Ver más" (si el texto entraba igual,
  // no tiene sentido mostrarlo).
  const isClamped = bioEl.scrollHeight > bioEl.clientHeight + 1;
  if (!isClamped) return;

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "profile-bio-toggle";
  toggleBtn.textContent = "Ver más";
  toggleBtn.addEventListener("click", () => {
    const expanded = bioEl.classList.toggle("profile-bio-expanded");
    toggleBtn.textContent = expanded ? "Ver menos" : "Ver más";
  });
  bioEl.insertAdjacentElement("afterend", toggleBtn);
}

function renderProfileLinks(links: ProfileLink[]) {
  const linksEl = document.getElementById("profileLinks");
  if (!linksEl) return;
  if (links.length === 0) {
    linksEl.remove();
    return;
  }
  linksEl.innerHTML = links
    .map((l) => {
      const platform = getPlatform(l.platform);
      return `
    <a class="profile-link-item" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer nofollow">
      <span class="profile-link-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${platform.icon}</svg></span>
      <span class="profile-link-label">${escapeHtml(l.label)}</span>
    </a>`;
    })
    .join("");
}

function followButtonLabel(status: FollowStatus): string {
  if (status === "pending") return "Solicitud enviada";
  if (status === "accepted") return "Siguiendo";
  return "+ Seguir";
}

function initFollowButton(targetId: string, initialStatus: FollowStatus) {
  const btn = document.getElementById("followBtn") as HTMLButtonElement | null;
  if (!btn || !myId) return;
  let status: FollowStatus = initialStatus;

  function paint() {
    btn!.textContent = followButtonLabel(status);
    btn!.classList.toggle("btn-primary", status === "none");
    btn!.classList.toggle("btn-outline", status !== "none");
  }
  paint();

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      if (status === "none") {
        const { status: newStatus, error } = await followUser(myId!, targetId);
        if (error) {
          alert(error);
          return;
        }
        status = newStatus ?? "accepted";
      } else {
        // "Solicitud enviada" -> cancela; "Siguiendo" -> deja de seguir. Misma operación.
        const { error } = await unfollowOrCancel(myId!, targetId);
        if (error) {
          alert(error);
          return;
        }
        status = "none";
        // Si el perfil es privado, dejar de seguir debe ocultar bio/links/stats/rutinas
        // que ya se habían pintado con acceso de seguidor. Recargamos para re-evaluar
        // isPrivateForViewer en main(), igual que confirmFinishRoutine/openReactivateModal.
        window.location.reload();
        return;
      }
      paint();
    } finally {
      btn.disabled = false;
    }
  });
}

function subscribeButtonLabel(status: SubscriptionStatus): string {
  if (status === "pending") return "Solicitud enviada";
  if (status === "accepted") return "Suscripto";
  return "Suscribirse";
}

function initSubscribeButton(targetId: string, initialStatus: SubscriptionStatus) {
  const btn = document.getElementById("subscribeBtn") as HTMLButtonElement | null;
  if (!btn || !myId) return;
  let status: SubscriptionStatus = initialStatus;

  function paint() {
    btn!.textContent = subscribeButtonLabel(status);
    btn!.classList.toggle("btn-primary", status === "none");
    btn!.classList.toggle("btn-outline", status !== "none");
  }
  paint();

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      if (status === "none") {
        const { status: newStatus, error } = await subscribeToTrainer(targetId);
        if (error) {
          alert(error);
          return;
        }
        status = newStatus ?? "pending";
      } else {
        // "Solicitud enviada" -> cancela; "Suscripto" -> se desuscribe. Misma operación.
        const { error } = await unsubscribeOrCancel(myId!, targetId);
        if (error) {
          alert(error);
          return;
        }
        status = "none";
      }
      paint();
    } finally {
      btn.disabled = false;
    }
  });
}

async function renderProfileActions(
  targetId: string,
  username: string,
  ownerView: boolean,
  viewerLoggedIn: boolean,
  blockStatus: BlockStatus,
  targetUserType: Profile["user_type"]
): Promise<FollowStatus> {
  const actions = document.getElementById("profileActions");
  // Si hay un bloqueo de por medio (en cualquier direccion) no tiene sentido mostrar
  // "+ Seguir": el trigger de la base lo rechaza igual, pero evitamos el error confuso.
  const showFollowBtn = !ownerView && viewerLoggedIn && blockStatus === "none";
  // Suscripcion solo tiene sentido contra un entrenador (gimnasio tendra su propio flujo mas adelante).
  const showSubscribeBtn = showFollowBtn && targetUserType === "entrenador";
  const followStatus: FollowStatus = showFollowBtn ? await getFollowStatus(targetId).catch(() => "none" as FollowStatus) : "none";
  // "ended" (fue alumno, ya no lo es) se trata igual que "none": el boton vuelve a ofrecer
  // suscribirse, y la RPC de suscripcion reactiva ese mismo vinculo historico si corresponde.
  const rawSubscriptionStatus: SubscriptionStatus = showSubscribeBtn ? await getSubscriptionStatus(targetId).catch(() => "none" as SubscriptionStatus) : "none";
  const subscriptionStatus: SubscriptionStatus = rawSubscriptionStatus === "ended" ? "none" : rawSubscriptionStatus;
  if (!actions) return followStatus;

  // En mi propio perfil, "Compartir perfil"; en el de otro con sesion iniciada,
  // ese lugar lo ocupa "Mensaje" (abre/crea la conversacion 1 a 1). Un visitante
  // sin sesion no puede mandar mensajes, asi que ahi se mantiene "Compartir perfil".
  const showMessageBtn = !ownerView && viewerLoggedIn;
  const secondaryBtn = showMessageBtn
    ? `<button class="btn btn-outline" id="messageBtn" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      Mensaje
    </button>`
    : `<button class="btn btn-outline" id="shareBtn" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5"/></svg>
      Compartir perfil
    </button>`;

  actions.innerHTML = `
    ${ownerView ? `<a class="btn btn-outline" href="/pages/settings.html">Editar perfil</a>` : ""}
    ${secondaryBtn}
    ${showFollowBtn ? `<button class="btn ${followStatus === "none" ? "btn-primary" : "btn-outline"}" id="followBtn" type="button">${followButtonLabel(followStatus)}</button>` : ""}
    ${showSubscribeBtn ? `<button class="btn ${subscriptionStatus === "none" ? "btn-primary" : "btn-outline"}" id="subscribeBtn" type="button">${subscribeButtonLabel(subscriptionStatus)}</button>` : ""}
  `;
  if (showMessageBtn) initMessageButton(targetId);
  else initShare(username, "shareBtn");
  if (showFollowBtn) initFollowButton(targetId, followStatus);
  if (showSubscribeBtn) initSubscribeButton(targetId, subscriptionStatus);
  return followStatus;
}

// ---------- Menu de tres puntos (compartir / bloquear / configuracion) ----------

function profileMenuIcon(path: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

const SHARE_ICON = profileMenuIcon(`<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5"/>`);
const SETTINGS_ICON = profileMenuIcon(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>`);
const BLOCK_ICON = profileMenuIcon(`<circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>`);
const REPORT_ICON = profileMenuIcon(`<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>`);
const REPORT_USER_ICON = profileMenuIcon(`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>`);

function renderProfileMenu(targetId: string, username: string, ownerView: boolean, viewerLoggedIn: boolean, blockStatus: BlockStatus) {
  const wrap = document.getElementById("profileMenuWrap");
  const panel = document.getElementById("profileMenuPanel");
  if (!wrap || !panel) return;

  const shareItem = `<button class="profile-menu-item" id="menuShareBtn" type="button">${SHARE_ICON}Compartir perfil</button>`;
  const reportItem = `<button class="profile-menu-item" id="menuReportBtn" type="button">${REPORT_ICON}Reportar un error</button>`;
  const reportUserItem = `<button class="profile-menu-item profile-menu-item-danger" id="menuReportUserBtn" type="button">${REPORT_USER_ICON}Reportar usuario</button>`;

  if (ownerView) {
    panel.innerHTML = `${shareItem}<a class="profile-menu-item" href="/pages/settings.html">${SETTINGS_ICON}Configuración</a>${reportItem}`;
  } else if (viewerLoggedIn) {
    const blockLabel = blockStatus === "blocked_by_me" ? "Desbloquear usuario" : "Bloquear usuario";
    panel.innerHTML = `${shareItem}<button class="profile-menu-item profile-menu-item-danger" id="menuBlockBtn" type="button">${BLOCK_ICON}${blockLabel}</button>${reportUserItem}${reportItem}`;
  } else {
    panel.innerHTML = shareItem;
  }

  wrap.hidden = false;
  initShare(username, "menuShareBtn");

  document.getElementById("menuBlockBtn")?.addEventListener("click", () => {
    panel.hidden = true;
    if (blockStatus === "blocked_by_me") {
      void handleUnblock(targetId);
    } else {
      confirmBlockModal(targetId, username);
    }
  });

  document.getElementById("menuReportBtn")?.addEventListener("click", () => {
    panel.hidden = true;
    openReportErrorModal();
  });

  document.getElementById("menuReportUserBtn")?.addEventListener("click", () => {
    panel.hidden = true;
    openReportUserModal(targetId, username);
  });

  panel.querySelectorAll<HTMLAnchorElement>("a.profile-menu-item").forEach((a) => {
    a.addEventListener("click", () => {
      panel.hidden = true;
    });
  });
}

function openReportErrorModal() {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody || !myId) return;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Reportar un error</h2>
        <p class="subtitle">Contanos qué encontraste, lo revisamos desde el panel de administración.</p>

        <div class="field"><label for="reportSubject">Asunto</label><input type="text" id="reportSubject" placeholder="Ej: El botón de guardar no responde"></div>
        <div class="field"><label for="reportMessage">Mensaje</label><textarea id="reportMessage" rows="5" placeholder="Contanos qué pasó y qué esperabas que pasara"></textarea></div>

        <div class="alert_message" id="reportAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="reportSubmit" type="button">Enviar</button>
          <button class="btn btn-outline" id="reportCancel" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("reportCancel")?.addEventListener("click", closeOverlay);

  document.getElementById("reportSubmit")?.addEventListener("click", async () => {
    const alertBox = document.getElementById("reportAlert")!;
    alertBox.innerHTML = "";

    const subject = (document.getElementById("reportSubject") as HTMLInputElement).value;
    const message = (document.getElementById("reportMessage") as HTMLTextAreaElement).value;

    const validationError = validateErrorReport(subject, message);
    if (validationError) {
      alertBox.innerHTML = `<p>${validationError === "subject_short" ? "Ingresá un asunto." : validationError === "subject_long" ? "El asunto es muy largo." : "El mensaje es muy largo."}</p>`;
      return;
    }

    const submitBtn = document.getElementById("reportSubmit") as HTMLButtonElement;
    submitBtn.disabled = true;
    const { error } = await submitErrorReport(myId!, subject, message, window.location.pathname);
    submitBtn.disabled = false;

    if (error) {
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }

    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="success-icon">
          <svg viewBox="0 0 52 52" class="success-svg">
            <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
            <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
          </svg>
        </div>
        <p>¡Gracias! Recibimos tu reporte.</p>
      </div>
    `;
    setTimeout(closeOverlay, 1800);
  });
}

function openReportUserModal(targetId: string, username: string) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody || !myId) return;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Reportar a @${escapeHtml(username)}</h2>
        <p class="subtitle">Contanos por qué. Lo revisa el equipo de Gym Social desde el panel de administración.</p>

        <div class="field"><label for="reportUserReason">Motivo</label><textarea id="reportUserReason" rows="5" placeholder="Contanos qué pasó"></textarea></div>

        <div class="alert_message" id="reportUserAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-danger" id="reportUserSubmit" type="button">Enviar reporte</button>
          <button class="btn btn-outline" id="reportUserCancel" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("reportUserCancel")?.addEventListener("click", closeOverlay);

  document.getElementById("reportUserSubmit")?.addEventListener("click", async () => {
    const alertBox = document.getElementById("reportUserAlert")!;
    alertBox.innerHTML = "";

    const reason = (document.getElementById("reportUserReason") as HTMLTextAreaElement).value;

    const validationError = validateUserReport(reason);
    if (validationError) {
      alertBox.innerHTML = `<p>${validationError === "reason_short" ? "Contanos un poco más (mínimo 5 caracteres)." : "El motivo es muy largo."}</p>`;
      return;
    }

    const submitBtn = document.getElementById("reportUserSubmit") as HTMLButtonElement;
    submitBtn.disabled = true;
    const { error } = await submitUserReport(myId!, targetId, reason);
    submitBtn.disabled = false;

    if (error) {
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }

    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="success-icon">
          <svg viewBox="0 0 52 52" class="success-svg">
            <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
            <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
          </svg>
        </div>
        <p>Gracias, recibimos tu reporte.</p>
      </div>
    `;
    setTimeout(closeOverlay, 1800);
  });
}

function setupProfileMenuToggle() {
  const btn = document.getElementById("profileMenuBtn");
  const panel = document.getElementById("profileMenuPanel");
  if (!btn || !panel) return;

  btn.addEventListener("click", () => {
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.classList.toggle("open", willOpen);
    btn.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    const target = e.target as Node;
    if (panel.contains(target) || btn.contains(target)) return;
    panel.hidden = true;
    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  });
}

// ---------- Menu de tuerca por rutina (Mostrar / Modificar / Eliminar) ----------

const ROUTINE_MENU_GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;

function setupRoutineMenuOutsideClick() {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".routine-menu-wrap")) return;
    document.querySelectorAll<HTMLElement>(".routine-menu-panel").forEach((p) => (p.hidden = true));
    document.querySelectorAll<HTMLButtonElement>(".routine-menu-btn").forEach((b) => {
      b.classList.remove("open");
      b.setAttribute("aria-expanded", "false");
    });
  });
}

function wireRoutineMenus(container: HTMLElement) {
  container.querySelectorAll<HTMLButtonElement>(".routine-menu-btn").forEach((btn) => {
    const panel = btn.nextElementSibling as HTMLElement | null;
    if (!panel) return;
    btn.addEventListener("click", () => {
      const willOpen = panel.hidden;
      container.querySelectorAll<HTMLElement>(".routine-menu-panel").forEach((p) => (p.hidden = true));
      container.querySelectorAll<HTMLButtonElement>(".routine-menu-btn").forEach((b) => {
        b.classList.remove("open");
        b.setAttribute("aria-expanded", "false");
      });
      panel.hidden = !willOpen;
      btn.classList.toggle("open", willOpen);
      btn.setAttribute("aria-expanded", String(willOpen));
    });
  });
}

async function handleUnblock(targetId: string) {
  if (!myId) return;
  const { error } = await unblockUser(myId, targetId);
  if (error) {
    alert(error);
    return;
  }
  window.location.reload();
}

function confirmBlockModal(targetId: string, username: string) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody || !myId) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Bloquear a @${escapeHtml(username)}</h2>
        <p class="subtitle">Va a dejar de seguirte automáticamente y no van a poder encontrarse en el buscador. Podés desbloquearlo después desde Configuración.</p>
        <div class="modal-actions">
          <button class="btn btn-danger" id="confirmBlock">Bloquear</button>
          <button class="btn btn-outline" id="cancelBlock">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("cancelBlock")?.addEventListener("click", closeOverlay);
  document.getElementById("confirmBlock")?.addEventListener("click", async () => {
    const { error } = await blockUser(myId!, targetId);
    if (error) {
      alert(error);
      closeOverlay();
      return;
    }
    window.location.reload();
  });
}

// ---------- Perfil privado (visitante sin acceso completo) ----------

function renderPrivateNotice(nombre: string) {
  document.getElementById("quickActionsSection")?.remove();
  document.getElementById("rutinas")?.remove();

  const statsSection = document.getElementById("statsSection");
  const container = statsSection?.querySelector(".container");
  if (container) {
    container.innerHTML = `
      <div class="empty-state reveal">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
        <h3>Este perfil es privado</h3>
        <p>${escapeHtml(nombre)} decidió que solo se vea su información básica.</p>
      </div>
    `;
  }
}

// Solo se llama para el dueño del perfil: para un visitante estos accesos
// directos (rutinas propias, progreso completo) no aplican.
function renderQuickActions(userId: string, userType: Profile["user_type"]) {
  const quickActions = document.getElementById("quickActions");
  if (!quickActions) return;

  quickActions.innerHTML = `
    <a class="quick-card reveal" href="#rutinas">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div>
      <div><h3>Tus rutinas</h3><p>Ver y gestionar tus rutinas activas</p></div>
    </a>
    <a class="quick-card reveal" href="/pages/progress.html?uid=${userId}">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
      <div><h3>Progreso completo</h3><p>Gráficos detallados por ejercicio</p></div>
    </a>
    <a class="quick-card reveal" href="/pages/rutinsView.html">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></div>
      <div><h3>Nueva rutina</h3><p>Armá una rutina desde cero</p></div>
    </a>
    ${
      userType === "entrenador"
        ? `<a class="quick-card reveal" href="/pages/alumnos.html">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      <div><h3>Tus alumnos</h3><p>Rutinas, progreso y comentarios de tus suscriptores</p></div>
    </a>`
        : ""
    }
  `;
}

// ---------- Estadisticas ----------

function renderStats(logs: WeightLogEntry[], activeRoutinesCount: number, ownerView: boolean) {
  const statsContent = document.getElementById("statsContent");
  if (!statsContent) return;

  if (logs.length === 0) {
    statsContent.innerHTML = ownerView
      ? `
      <div class="empty-state reveal">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
        <h3>Todavía no tenés estadísticas</h3>
        <p>Por ahora no tenés ningún entrenamiento registrado. Cuando cargues el peso de tus ejercicios, tu progreso va a aparecer acá.</p>
        <a href="#rutinas" class="btn btn-primary btn-sm">Ir a mis rutinas</a>
      </div>
    `
      : `
      <div class="empty-state reveal">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
        <h3>Todavía no tiene estadísticas</h3>
        <p>Este usuario todavía no registró ningún entrenamiento.</p>
      </div>
    `;
    return;
  }

  const top = mostFrequentExercise(logs);
  const excProgress = top ? logs.filter((l) => l.exerciseId === top.id) : [];

  statsContent.innerHTML = `
    <div class="card-grid">
      <div class="stat-card reveal"><div class="label">Último entrenamiento</div><div class="value">${escapeHtml(lastTrainingLabel(logs))}</div></div>
      <div class="stat-card reveal"><div class="label">Ejercicio más entrenado</div><div class="value">${escapeHtml(top?.name ?? "—")}</div></div>
      <div class="stat-card reveal"><div class="label">Entrenamientos registrados</div><div class="value">${trainingDaysCount(logs)}</div></div>
      <div class="stat-card reveal"><div class="label">Rutinas activas</div><div class="value" id="activeRoutinesStatValue">${activeRoutinesCount}</div></div>
    </div>
    <div class="chart-card reveal">
      <h3>Frecuencia de entrenamiento</h3>
      <p class="chart-sub">Entrenamientos registrados por semana, últimas 8 semanas.</p>
      <div class="chart-wrap"><canvas id="freqChart"></canvas></div>
    </div>
    ${
      excProgress.length >= 2
        ? `<div class="chart-card reveal">
      <h3>Progreso: ${escapeHtml(top?.name ?? "")}</h3>
      <p class="chart-sub">Evolución del peso registrado en ${ownerView ? "tu" : "su"} ejercicio más entrenado.</p>
      <div class="chart-wrap"><canvas id="progressChart"></canvas></div>
    </div>`
        : ""
    }
  `;

  renderFreqChart(computeWeeklyFrequency(logs));
  if (excProgress.length >= 2) renderProgressChart(excProgress);
}

function renderFreqChart(buckets: { label: string; count: number }[]) {
  const canvas = document.getElementById("freqChart");
  if (!canvas || typeof Chart === "undefined") return;
  new Chart(canvas, {
    type: "bar",
    data: {
      labels: buckets.map((b) => b.label),
      datasets: [{ label: "Entrenamientos", data: buckets.map((b) => b.count), backgroundColor: "#ff8a3d", borderRadius: 6, maxBarThickness: 34 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, color: "#9aa1ac" }, grid: { color: "#262b33" } },
        x: { ticks: { color: "#9aa1ac" }, grid: { display: false } },
      },
    },
  });
}

function renderProgressChart(entries: WeightLogEntry[]) {
  const canvas = document.getElementById("progressChart");
  if (!canvas || typeof Chart === "undefined") return;
  new Chart(canvas, {
    type: "line",
    data: {
      labels: entries.map((e) => formatFechaCorta(e.fecha)),
      datasets: [
        {
          label: "Peso (kg)",
          data: entries.map((e) => e.peso),
          borderColor: "#ff8a3d",
          backgroundColor: "rgba(255, 138, 61, 0.18)",
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: "#ff8a3d",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: false, ticks: { color: "#9aa1ac" }, grid: { color: "#262b33" } },
        x: { ticks: { color: "#9aa1ac" }, grid: { display: false } },
      },
    },
  });
}

// ---------- Rutinas ----------

let activeRoutineTab: "active" | "historic" | "saved" = "active";

// Contexto guardado tras el primer render para poder refrescar la lista de
// rutinas y el conteo de "Rutinas activas" in-place (sin recargar la pagina)
// despues de finalizar/reactivar una rutina.
let routinesCtx: { userId: string; ownerView: boolean; logs: WeightLogEntry[]; userType: Profile["user_type"]; ownerBasic: BasicNamedProfile } | null = null;

async function refreshRoutinesAndStats() {
  if (!routinesCtx) return;
  activeRoutineTab = "active";
  const count = await renderRoutines(routinesCtx.userId, routinesCtx.ownerView, routinesCtx.logs, routinesCtx.userType, routinesCtx.ownerBasic);
  const statValue = document.getElementById("activeRoutinesStatValue");
  if (statValue && count !== undefined) statValue.textContent = String(count);
}

// Una rutina asignada y privada es del que la asigno, no de quien la recibe: el
// receptor solo puede entrenarla (cargar pesos) y mirarla, nada mas. Si el
// entrenador la hizo publica, o si nunca fue asignada (rutina propia), el dueño
// (user_id) tiene control total. Ver migracion student_routine_permission_lockdown.
function isFullyOwnedByViewer(r: RoutineWithCounts): boolean {
  return !r.assigned_by || r.assigned_by === myId;
}

// Quien aparece en "Rutina de X": el que la asigno tiene prioridad (esa
// relacion ya implica que la rutina "es de" esa persona), y si no hay
// asignacion, quien la creo originalmente si esta rutina viene de un "Copiar
// a mis guardadas" del perfil de otra persona. Si ninguna aplica, no hay linea.
function provenanceOf(r: RoutineWithCounts, profiles: Map<string, ProfileBasic>): ProfileBasic | null {
  const id = r.assigned_by ?? r.copied_from_user_id;
  return id ? (profiles.get(id) ?? null) : null;
}

function routineStatsMarkup(routine: RoutineWithCounts, logs: WeightLogEntry[]) {
  const routineLogs = logs.filter((l) => l.routineId === routine.id);
  const trainedIds = new Set(routineLogs.map((l) => l.routineExerciseId));
  const totalExc = routine.totalRoutineExerciseIds.length;
  const pct = totalExc === 0 ? 0 : Math.round((trainedIds.size / totalExc) * 100);

  const last = routineLogs[routineLogs.length - 1];
  const lastProgress = last ? `Semana ${last.weekNumero} · ${diaLabel(last.diaSemana ?? 1)}` : "Sin entrenos registrados";

  return `
    <div class="routine-stats">
      <div><span>Semanas</span><strong>${routine.semanasCount}</strong></div>
      <div><span>Días por semana</span><strong>${routine.diasPorSemana}</strong></div>
      <div><span>Ejercicios</span><strong>${routine.ejerciciosCount}</strong></div>
      <div><span>Último progreso</span><strong>${escapeHtml(lastProgress)}</strong></div>
    </div>
    <div class="routine-progress">
      <div class="routine-progress-head"><span>Progreso de la rutina</span><strong>${pct}%</strong></div>
      <div class="routine-progress-bar"><span style="width:${pct}%"></span></div>
    </div>
  `;
}

async function renderRoutines(
  userId: string,
  ownerView: boolean,
  logs: WeightLogEntry[],
  targetUserType: Profile["user_type"],
  ownerBasic: BasicNamedProfile,
  viewerCanCopyToSaved = false
) {
  const routinesContent = document.getElementById("routinesContent");
  const routinesTitle = document.getElementById("routinesTitle");
  const tabsWrap = document.getElementById("routineTabs");
  const savedTabBtn = document.getElementById("savedTabBtn") as HTMLButtonElement | null;
  if (!routinesContent) return;

  // Guardadas es un espacio de trabajo personal (plantillas propias, o para
  // asignar a alumnos si sos entrenador): no tiene sentido para un visitante
  // ni para gimnasio/colaborador (gimnasio tiene su propio sistema aparte).
  const canUseSaved = ownerView && (targetUserType === "entrenador" || targetUserType === "usuario" || targetUserType === "admin");
  if (canUseSaved) savedTabBtn?.removeAttribute("hidden");
  if (!canUseSaved && activeRoutineTab === "saved") activeRoutineTab = "active";

  // Las historicas/guardadas son algo personal: un visitante solo ve las activas, sin
  // pestaña para cambiar.
  if (!ownerView) {
    activeRoutineTab = "active";
    tabsWrap?.remove();
  } else if (tabsWrap) {
    tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === activeRoutineTab);
      btn.onclick = () => {
        activeRoutineTab = btn.dataset.tab as "active" | "historic" | "saved";
        renderRoutines(userId, ownerView, logs, targetUserType, ownerBasic);
      };
    });
  }
  if (routinesTitle) {
    routinesTitle.textContent = activeRoutineTab === "active" ? "Rutinas activas" : activeRoutineTab === "historic" ? "Rutinas históricas" : "Rutinas guardadas";
  }

  const routines = await listRoutines(userId, activeRoutineTab);

  // Todas comparten el mismo dueño (esta pagina), pero cada una puede haber
  // sido asignada por un entrenador distinto, o copiada del perfil de otra
  // persona (ver "Copiar a mis guardadas"): se resuelven en un solo batch,
  // compartido entre ambas procedencias.
  const provenanceIds = [...new Set(routines.flatMap((r) => [r.assigned_by, r.copied_from_user_id]))];
  const provenanceProfiles = await getProfilesBasicByIds(provenanceIds);

  if (activeRoutineTab === "saved") {
    renderSavedRoutines(routines, routinesContent, targetUserType, provenanceProfiles);
    return routines.length;
  }

  if (activeRoutineTab === "active") {
    renderActiveRoutines(routines, ownerView, routinesContent, logs, ownerBasic, provenanceProfiles, viewerCanCopyToSaved);
  } else {
    renderHistoricRoutines(routines, ownerView, routinesContent, logs, ownerBasic, provenanceProfiles);
  }
  return routines.length;
}

function renderActiveRoutines(
  routines: RoutineWithCounts[],
  ownerView: boolean,
  container: HTMLElement,
  logs: WeightLogEntry[],
  ownerBasic: BasicNamedProfile,
  provenanceProfiles: Map<string, ProfileBasic>,
  viewerCanCopyToSaved = false
) {
  if (routines.length === 0) {
    container.innerHTML = ownerView
      ? `<div class="empty-state reveal"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div><h3>Todavía no tenés rutinas activas</h3><p>Creá tu primera rutina para empezar a entrenar con Gym Social.</p><a href="/pages/rutinsView.html" class="btn btn-primary btn-sm">Crear nueva rutina</a></div>`
      : `<div class="empty-state reveal"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div><h3>Todavía no tiene rutinas activas</h3><p>Este usuario no cargó ninguna rutina por ahora.</p></div>`;
    return;
  }

  container.innerHTML = routines
    .map((r) => {
      const fullyOwned = isFullyOwnedByViewer(r);
      // Un visitante tambien tiene ruedita: "Ver" siempre, y "Copiar a guardadas"
      // solo si la rutina es publica y el visitante tiene donde guardarla (mismo
      // gate que canUseSaved, pero aplicado a quien mira en vez de al dueño).
      const menu = ownerView
        ? `<div class="profile-menu-wrap routine-menu-wrap">
             <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${ROUTINE_MENU_GEAR_ICON}</button>
             <div class="profile-menu-panel routine-menu-panel" hidden>
               <a class="profile-menu-item" href="showExc.html?rid=${r.id}">Mostrar</a>
               ${
                 fullyOwned
                   ? `<a class="profile-menu-item" href="excView.html?rid=${r.id}">Modificar</a>
               <button type="button" class="profile-menu-item togglePublicRoutine" data-id="${r.id}">${r.is_public ? "Hacer privada" : "Hacer pública"}</button>
               <a class="profile-menu-item profile-menu-item-danger" href="deleteRutins.html?rid=${r.id}">Eliminar</a>`
                   : ""
               }
             </div>
           </div>`
        : `<div class="profile-menu-wrap routine-menu-wrap">
             <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${ROUTINE_MENU_GEAR_ICON}</button>
             <div class="profile-menu-panel routine-menu-panel" hidden>
               <a class="profile-menu-item" href="showExc.html?rid=${r.id}">Ver</a>
               ${
                 r.is_public && viewerCanCopyToSaved
                   ? `<a class="profile-menu-item" href="rutinsView.html?copyFrom=${r.id}">Copiar a mis guardadas</a>`
                   : ""
               }
             </div>
           </div>`;
      // Finalizar (a diferencia de Modificar/Eliminar/visibilidad) es control del
      // dueño de la cuenta sobre su propio progreso: se puede aunque la rutina
      // sea asignada y privada, no requiere fullyOwned.
      const actions = ownerView
        ? `<button class="btn btn-primary btn-sm addPeso" data-id="${r.id}">Entrenar hoy</button>
           <button class="btn btn-success btn-sm finishRoutine" data-id="${r.id}">Finalizar</button>`
        : "";

      return `
        <div class="routine-card reveal routine-card-has-menu">
          ${menu}
          <span class="routine-started-tag">Iniciada el ${escapeHtml(formatFechaCorta(r.fecha_inicio))}</span>
          <span class="routine-visibility-badge ${r.is_public ? "is-public" : ""}">${r.is_public ? "Pública" : "Privada"}</span>
          <h3>${escapeHtml(r.nombre)}</h3>
          ${routineOwnerLineMarkup(ownerBasic, provenanceOf(r, provenanceProfiles))}
          ${routineStatsMarkup(r, logs)}
          <div class="routine-actions">${actions}</div>
        </div>
      `;
    })
    .join("");

  wireRoutineMenus(container);
  if (!ownerView) return;

  container.querySelectorAll<HTMLButtonElement>(".addPeso").forEach((btn) => {
    btn.addEventListener("click", () => (window.location.href = `pesos.html?rid=${btn.dataset.id}`));
  });
  container.querySelectorAll<HTMLButtonElement>(".finishRoutine").forEach((btn) => {
    btn.addEventListener("click", () => confirmFinishRoutine(btn.dataset.id!, routines.find((r) => r.id === btn.dataset.id)!));
  });
  container.querySelectorAll<HTMLButtonElement>(".togglePublicRoutine").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const routine = routines.find((r) => r.id === btn.dataset.id);
      if (!routine) return;
      btn.disabled = true;
      try {
        await setRoutinePublic(routine.id, !routine.is_public);
        routine.is_public = !routine.is_public;
        renderActiveRoutines(routines, ownerView, container, logs, ownerBasic, provenanceProfiles);
      } catch {
        btn.disabled = false;
        alert("No se pudo cambiar la visibilidad. Probá de nuevo.");
      }
    });
  });
}

function renderHistoricRoutines(
  routines: RoutineWithCounts[],
  ownerView: boolean,
  container: HTMLElement,
  logs: WeightLogEntry[],
  ownerBasic: BasicNamedProfile,
  provenanceProfiles: Map<string, ProfileBasic>
) {
  if (routines.length === 0) {
    container.innerHTML = ownerView
      ? `<div class="empty-state reveal"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div><h3>Todavía no tenés rutinas históricas</h3><p>Cuando finalices una rutina activa, va a aparecer acá.</p></div>`
      : `<div class="empty-state reveal"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div><h3>Este usuario no tiene rutinas históricas</h3><p>Todavía no finalizó ninguna rutina.</p></div>`;
    return;
  }

  container.innerHTML = routines
    .map((r) => {
      const menu = ownerView
        ? `<div class="profile-menu-wrap routine-menu-wrap">
             <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${ROUTINE_MENU_GEAR_ICON}</button>
             <div class="profile-menu-panel routine-menu-panel" hidden>
               <a class="profile-menu-item" href="showExc.html?rid=${r.id}">Mostrar</a>
               ${isFullyOwnedByViewer(r) ? `<a class="profile-menu-item profile-menu-item-danger" href="deleteRutins.html?rid=${r.id}">Eliminar</a>` : ""}
             </div>
           </div>`
        : "";
      // Reactivar, igual que Finalizar: control del dueño de la cuenta sobre su
      // propio progreso, no requiere fullyOwned.
      const actions = ownerView
        ? `<button class="btn btn-primary btn-sm reactivateRoutine" data-id="${r.id}">Reactivar</button>`
        : `<button class="btn btn-outline btn-sm showExcHist" data-id="${r.id}">Mostrar</button>`;

      return `
        <div class="routine-card is-historic reveal${ownerView ? " routine-card-has-menu" : ""}">
          ${menu}
          ${r.finalizada_at ? `<span class="routine-finished-tag">Finalizada el ${escapeHtml(formatFechaCorta(r.finalizada_at))}</span>` : ""}
          <h3>${escapeHtml(r.nombre)}</h3>
          ${routineOwnerLineMarkup(ownerBasic, provenanceOf(r, provenanceProfiles))}
          ${routineStatsMarkup(r, logs)}
          <div class="routine-actions">${actions}</div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll<HTMLButtonElement>(".showExcHist").forEach((btn) => {
    btn.addEventListener("click", () => (window.location.href = `showExc.html?rid=${btn.dataset.id}`));
  });
  if (!ownerView) return;

  wireRoutineMenus(container);

  container.querySelectorAll<HTMLButtonElement>(".reactivateRoutine").forEach((btn) => {
    btn.addEventListener("click", () => openReactivateModal(btn.dataset.id!));
  });
}

// Guardadas siempre se ve solo el dueño: no hay caso "visitante" que gatear aca.
// Un entrenador puede activar y asignarsela a un alumno (o a si mismo); un
// usuario comun solo puede activarla para si mismo, sin modal de por medio.
function renderSavedRoutines(
  routines: RoutineWithCounts[],
  container: HTMLElement,
  targetUserType: Profile["user_type"],
  provenanceProfiles: Map<string, ProfileBasic>
) {
  const isTrainer = targetUserType === "entrenador";

  if (routines.length === 0) {
    container.innerHTML = isTrainer
      ? `
      <div class="empty-state reveal">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg></div>
        <h3>Todavía no tenés rutinas guardadas</h3>
        <p>Armá una plantilla y despues asignásela a cualquiera de tus suscriptores aceptados.</p>
        <a href="/pages/rutinsView.html?mode=template" class="btn btn-primary btn-sm">Crear plantilla</a>
      </div>
    `
      : `
      <div class="empty-state reveal">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg></div>
        <h3>Todavía no tenés rutinas guardadas</h3>
        <p>Cuando creás una rutina nueva, te preguntamos si la querés activar ya. Si elegís que no, queda acá para que la actives cuando quieras.</p>
        <a href="/pages/rutinsView.html" class="btn btn-primary btn-sm">Crear rutina</a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${isTrainer ? `<div class="routines-header-actions"><a href="/pages/rutinsView.html?mode=template" class="btn btn-outline btn-sm">+ Nueva plantilla</a></div>` : ""}
    ${routines
      .map(
        (r) => `
      <div class="routine-card reveal routine-card-has-menu">
        <div class="profile-menu-wrap routine-menu-wrap">
          <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${ROUTINE_MENU_GEAR_ICON}</button>
          <div class="profile-menu-panel routine-menu-panel" hidden>
            <a class="profile-menu-item" href="showExc.html?rid=${r.id}">Mostrar</a>
            <a class="profile-menu-item" href="excView.html?rid=${r.id}">Modificar</a>
            <button type="button" class="profile-menu-item togglePublicRoutine" data-id="${r.id}">${r.is_public ? "Hacer privada" : "Hacer pública"}</button>
            <a class="profile-menu-item profile-menu-item-danger" href="deleteRutins.html?rid=${r.id}">Eliminar</a>
          </div>
        </div>
        <span class="routine-started-tag">Plantilla</span>
        <span class="routine-visibility-badge ${r.is_public ? "is-public" : ""}">${r.is_public ? "Pública" : "Privada"}</span>
        <h3>${escapeHtml(r.nombre)}</h3>
        ${routineOwnerLineMarkup(null, provenanceOf(r, provenanceProfiles))}
        <div class="routine-stats">
          <div><span>Semanas</span><strong>${r.semanasCount}</strong></div>
          <div><span>Días por semana</span><strong>${r.diasPorSemana}</strong></div>
          <div><span>Ejercicios</span><strong>${r.ejerciciosCount}</strong></div>
        </div>
        <div class="routine-actions">
          ${
            isTrainer
              ? `<button class="btn btn-primary btn-sm assignRoutine" data-id="${r.id}" data-nombre="${escapeHtml(r.nombre)}">Activar o asignar</button>`
              : `<a href="rutinsView.html?uid=${encodeURIComponent(myId!)}&cloneFrom=${encodeURIComponent(r.id)}" class="btn btn-primary btn-sm">Activar</a>`
          }
        </div>
      </div>
    `
      )
      .join("")}
  `;

  wireRoutineMenus(container);
  if (isTrainer) {
    container.querySelectorAll<HTMLButtonElement>(".assignRoutine").forEach((btn) => {
      btn.addEventListener("click", () => openAssignModal(btn.dataset.id!, btn.dataset.nombre!));
    });
  }
  container.querySelectorAll<HTMLButtonElement>(".togglePublicRoutine").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const routine = routines.find((r) => r.id === btn.dataset.id);
      if (!routine) return;
      btn.disabled = true;
      try {
        await setRoutinePublic(routine.id, !routine.is_public);
        routine.is_public = !routine.is_public;
        renderSavedRoutines(routines, container, targetUserType, provenanceProfiles);
      } catch {
        btn.disabled = false;
        alert("No se pudo cambiar la visibilidad. Probá de nuevo.");
      }
    });
  });
}

function subscriberRowMarkup(s: SubscriberListRow): string {
  return `
    <div class="follow-request-item" data-id="${s.id}">
      <span class="follow-request-user">
        <img src="${escapeHtml(s.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
        <span class="search-result-body">
          <span class="search-result-name">${escapeHtml(`${s.nombre} ${s.apellido}`.trim())}</span>
          <span class="search-result-username">@${escapeHtml(s.username)}</span>
        </span>
      </span>
      <div class="follow-request-actions">
        <button class="btn btn-primary btn-sm assignToSubscriber" data-id="${s.id}" type="button">Asignar</button>
      </div>
    </div>
  `;
}

function selfAssignRowMarkup(): string {
  const avatarSrc = (document.getElementById("avatarImg") as HTMLImageElement | null)?.src || "/images/avatars/default.svg";
  return `
    <div class="follow-request-item" data-id="self">
      <span class="follow-request-user">
        <img src="${escapeHtml(avatarSrc)}" alt="" class="search-result-avatar">
        <span class="search-result-body">
          <span class="search-result-name">Vos mismo</span>
          <span class="search-result-username">Para entrenar ocasionalmente con tu propia rutina</span>
        </span>
      </span>
      <div class="follow-request-actions">
        <button class="btn btn-outline btn-sm assignToSubscriber" data-id="${myId}" type="button">Asignar</button>
      </div>
    </div>
  `;
}

async function openAssignModal(routineId: string, nombre: string) {
  if (!myId) return;
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Activar y asignar "${escapeHtml(nombre)}"</h2>
        <p class="subtitle">Elegí a quién se la asignás: un suscriptor tuyo, o vos mismo. Se crea una rutina nueva; esta plantilla queda igual acá.</p>
        <div id="assignSelfRow">${selfAssignRowMarkup()}</div>
        <input type="search" id="assignSearchInput" class="header-search-input" placeholder="Buscar suscriptor por nombre o usuario..." hidden>
        <div id="assignModalBody"><p class="chart-sub">Cargando tus suscriptores...</p></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="assignCancel">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("assignCancel")?.addEventListener("click", closeOverlay);
  wireAssignButtons(routineId, document.getElementById("assignSelfRow")!);

  const bodyEl = document.getElementById("assignModalBody");
  const searchInput = document.getElementById("assignSearchInput") as HTMLInputElement | null;
  if (!bodyEl) return;

  async function runSubscriberSearch(query: string) {
    const subscribers = await listSubscribers(myId!, query).catch(() => []);
    bodyEl!.innerHTML =
      subscribers.length === 0
        ? `<p class="chart-sub">${query ? `Sin resultados para "${escapeHtml(query)}".` : "Todavía no tenés suscriptores aceptados. Cuando alguien se suscriba y lo aceptes, vas a poder asignarle rutinas acá también."}</p>`
        : subscribers.map(subscriberRowMarkup).join("");
    wireAssignButtons(routineId, bodyEl!);
  }

  const allSubscribers = await listSubscribers(myId).catch(() => []);
  if (allSubscribers.length > 0) searchInput?.removeAttribute("hidden");

  bodyEl.innerHTML = allSubscribers.length === 0 ? `<p class="chart-sub">Todavía no tenés suscriptores aceptados. Cuando alguien se suscriba y lo aceptes, vas a poder asignarle rutinas acá también.</p>` : allSubscribers.map(subscriberRowMarkup).join("");
  wireAssignButtons(routineId, bodyEl);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  searchInput?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void runSubscriberSearch(searchInput.value.trim()), 250);
  });
}

function wireAssignButtons(routineId: string, container: HTMLElement) {
  container.querySelectorAll<HTMLButtonElement>(".assignToSubscriber").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `rutinsView.html?uid=${encodeURIComponent(btn.dataset.id!)}&cloneFrom=${encodeURIComponent(routineId)}`;
    });
  });
}

function closeOverlay() {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

function confirmFinishRoutine(routineId: string, routine: RoutineWithCounts) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Finalizar rutina</h2>
        <p class="subtitle">"${escapeHtml(routine.nombre)}" va a pasar a Históricas. Vas a poder reactivarla cuando quieras.</p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="confirmFinish">Finalizar</button>
          <button class="btn btn-outline" id="cancelFinish">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("cancelFinish")?.addEventListener("click", closeOverlay);
  document.getElementById("confirmFinish")?.addEventListener("click", async () => {
    const confirmBtn = document.getElementById("confirmFinish") as HTMLButtonElement;
    confirmBtn.disabled = true;
    document.getElementById("cancelFinish")?.setAttribute("disabled", "true");
    try {
      await finishRoutine(routineId);
    } catch {
      alert("No se pudo finalizar la rutina. Probá de nuevo.");
      confirmBtn.disabled = false;
      document.getElementById("cancelFinish")?.removeAttribute("disabled");
      return;
    }
    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="success-icon">
          <svg viewBox="0 0 52 52" class="success-svg">
            <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
            <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
          </svg>
        </div>
        <p>¡Rutina finalizada! Pasó a Históricas.</p>
      </div>
    `;
    setTimeout(() => {
      closeOverlay();
      void refreshRoutinesAndStats();
    }, 1600);
  });
}

function openReactivateModal(routineId: string) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Reactivar rutina</h2>
        <p class="subtitle">Vas a volver a verla en Activas, con todo tu historial de pesos intacto.</p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="confirmReactivate">Reactivar</button>
          <button class="btn btn-outline" id="cancelReactivate">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("cancelReactivate")?.addEventListener("click", closeOverlay);
  document.getElementById("confirmReactivate")?.addEventListener("click", async () => {
    const confirmBtn = document.getElementById("confirmReactivate") as HTMLButtonElement;
    confirmBtn.disabled = true;
    document.getElementById("cancelReactivate")?.setAttribute("disabled", "true");
    try {
      await reactivateRoutine(routineId);
    } catch {
      alert("No se pudo reactivar la rutina. Probá de nuevo.");
      confirmBtn.disabled = false;
      document.getElementById("cancelReactivate")?.removeAttribute("disabled");
      return;
    }
    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="success-icon">
          <svg viewBox="0 0 52 52" class="success-svg">
            <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
            <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
          </svg>
        </div>
        <p>¡Rutina reactivada! Volvió a Activas.</p>
      </div>
    `;
    setTimeout(() => {
      closeOverlay();
      void refreshRoutinesAndStats();
    }, 1600);
  });
}


// ---------- Armado de la pagina ----------

async function main() {
  // getProfile trae la fila completa (incluye mail): solo la ven el dueño, un
  // admin o un entrenador con rutinas asignadas al usuario, via RLS. Si no hay
  // acceso completo, caemos a la vista publica (sin mail) para el resto de casos.
  let profile: Profile | null;
  let basicProfile: ProfileBasic | null = null;

  if (usernameParam) {
    profile = await getProfileByUsername(usernameParam);
    if (!profile) basicProfile = await getProfileBasicByUsername(usernameParam);
  } else {
    profile = await getProfile(myId!);
  }

  const displayProfile = profile ?? basicProfile;

  if (!displayProfile) {
    const usernameEl = document.getElementById("profileUsername");
    if (usernameEl) usernameEl.textContent = "Este perfil no existe";
    document.getElementById("profileTop")?.remove();
    return;
  }

  const isOwner = displayProfile.id === myId;
  const nombre = displayProfile.nombre ?? "Este usuario";

  renderProfileIdentity(displayProfile.username ?? "", nombre, displayProfile.apellido ?? "", displayProfile.user_type ?? "usuario", displayProfile.is_verified ?? false);

  if (!isOwner) {
    document.getElementById("avatarEditWrap")?.remove();
  }

  const avatarImg = document.getElementById("avatarImg") as HTMLImageElement | null;
  if (avatarImg && displayProfile.avatar_url) avatarImg.src = displayProfile.avatar_url;
  if (isOwner && profile) initAvatar(profile);

  const targetUserType = displayProfile.user_type ?? "usuario";
  const blockStatus: BlockStatus = !isOwner && myId ? await getBlockStatus(displayProfile.id!).catch(() => "none" as BlockStatus) : "none";
  const followStatus = await renderProfileActions(displayProfile.id!, displayProfile.username ?? "", isOwner, myId !== null, blockStatus, targetUserType);
  renderProfileMenu(displayProfile.id!, displayProfile.username ?? "", isOwner, myId !== null, blockStatus);

  // Un seguidor aceptado ve el perfil completo aunque sea privado (misma logica
  // que ya usan las RLS de rutinas/pesos via is_profile_public en la base).
  const isPrivateForViewer = !profile && !basicProfile?.is_public && followStatus !== "accepted";

  // El link a seguidores/seguidos usa la misma regla: si el perfil es privado
  // para este visitante, ni siquiera se muestra clickeable (la RPC tambien lo
  // bloquea server-side, pero evitamos el link muerto).
  void renderProfileStats(displayProfile.id!, displayProfile.username ?? "", !isPrivateForViewer, targetUserType);

  if (isPrivateForViewer) {
    renderProfileBio(displayProfile.bio ?? null);
    document.getElementById("profileLinks")?.remove();
    renderPrivateNotice(nombre);
    return;
  }

  renderProfileBio(displayProfile.bio ?? null);
  renderProfileLinks(parseProfileLinks(displayProfile.links ?? []));

  // El resto de la pagina habla en tercera persona cuando no es el dueño.
  const statsEyebrow = document.getElementById("statsEyebrow");
  const statsSubtitle = document.getElementById("statsSubtitle");
  const rutinasEyebrow = document.getElementById("rutinasEyebrow");
  if (!isOwner) {
    if (statsEyebrow) statsEyebrow.textContent = "Su actividad";
    if (statsSubtitle) statsSubtitle.textContent = `Un resumen de cómo entrena ${nombre}.`;
    if (rutinasEyebrow) rutinasEyebrow.textContent = `Rutinas de ${nombre}`;
  }

  if (isOwner) {
    renderQuickActions(displayProfile.id!, targetUserType);
  } else {
    document.getElementById("quickActionsSection")?.remove();
  }

  // "Copiar" en el menu de una rutina activa ajena solo tiene sentido si el
  // visitante tiene donde guardarla: mismo gate que canUseSaved, pero sobre el
  // *visitante*, no sobre el dueño del perfil que se esta mirando.
  const viewerBasic = !isOwner && myId ? await getProfileBasicById(myId).catch(() => null) : null;
  const viewerCanCopyToSaved =
    viewerBasic?.user_type === "entrenador" || viewerBasic?.user_type === "usuario" || viewerBasic?.user_type === "admin";

  const logs = await listWeightLogsWithContext(displayProfile.id!);
  routinesCtx = { userId: displayProfile.id!, ownerView: isOwner, logs, userType: targetUserType, ownerBasic: displayProfile };
  const activeCount = await renderRoutines(displayProfile.id!, isOwner, logs, targetUserType, displayProfile, viewerCanCopyToSaved);
  renderStats(logs, activeCount ?? 0, isOwner);
}

main();
