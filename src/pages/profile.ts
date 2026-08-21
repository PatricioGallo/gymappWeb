import { setupAutoHideHeader } from "../lib/nav";
import { smartNavigate } from "../shell/router";
import type { ViewModule } from "../shell/router";
import type { ViewContext } from "../shell/viewContext";
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
  touchProfileVisit,
  type Profile,
  type ProfileBasic,
  type ProfileLink,
  type RoutineWithCounts,
  type WeightLogEntry,
} from "../services/profile.service";
import { getCachedProfileById, getCachedProfileByUsername, cacheProfile } from "../lib/profileDb";
import { setRoutinePublic, deleteRoutine } from "../services/routine.service";
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
import { getGymMembershipStatus, getSocioCount, requestGymMembership, leaveGym, type GymMembershipStatus } from "../services/gymMember.service";
import {
  getGymTrainerHandleStatus,
  requestGymTrainerHandle,
  acceptGymTrainerInvite,
  leaveGymAsTrainer,
  type GymTrainerHandleStatus,
  type HandleInitiatedBy,
} from "../services/gymTrainer.service";
import { listGymClasses, enrollInClass, unenrollFromClass, type GymClassRow, type ClassSession } from "../services/gymClass.service";
import { listGymTrainerRatings, type GymTrainerRatingRow } from "../services/gymTrainerRating.service";
import { openRateTrainerModal, openTrainerReviewsModal } from "../lib/gymTrainerRatingModal";
import { listGymPostsFull, type GymPostFull } from "../services/gymPost.service";
import { openGymPostViewer } from "../lib/gymPostViewer";
import { openCreateGymPostModal } from "../lib/gymPostComposer";
import { getBlockStatus, blockUser, unblockUser, type BlockStatus } from "../services/block.service";
import { submitErrorReport, validateErrorReport } from "../services/errorReport.service";
import { submitUserReport, validateUserReport } from "../services/userReport.service";
import { renderVerifiedBadge, getUserTypeLabel } from "../lib/verifiedBadge";
import { getPlatform } from "../lib/socialLinks";
import { renderPostCard, wirePostCard, type PostCardHandlers } from "../lib/postCard";
import { openQuoteModal, openShareToChatModal, openCommentModal, openPostMetricsModal, confirmDeletePost } from "../lib/postModals";
import { openPostDetailModal } from "../lib/postDetailModal";
import {
  getUserRepsAndReposts,
  getUserMedia,
  getUserLikedPosts,
  getUserPostCount,
  getPost,
  toggleLike,
  toggleRepost,
  recordPostView,
  type FeedPost,
  type PostAuthor,
} from "../services/post.service";

import type { Chart as ChartInstance } from "chart.js";
import { loadChart } from "../lib/chartLoader";
import { parseStatWidgets, type StatWidget } from "../lib/statsWidgets";
import type { WeightUnit } from "../services/weightLog.service";

// Estado que hoy se calculaba una sola vez a nivel de modulo (MPA: cada carga de pagina es un
// modulo nuevo). Con el shell, este mismo modulo puede quedar cargado en memoria durante varias
// visitas a distintos perfiles en la misma sesion -- mount() reasigna estas variables en cada
// llamada, y como todas las funciones de mas abajo ya cierran sobre estos bindings (no sobre un
// valor copiado), siguen viendo el estado correcto de la visita actual sin tener que anidarlas
// todas dentro de mount().
let myId: string | null = null;
let usernameParam: string | null = null;
let freqChartInstance: ChartInstance | null = null;
// Con el picker de widgets puede haber mas de un grafico "Progreso por ejercicio" a la vez
// (uno por ejercicio elegido) -- por eso es un array y no una sola instancia como freqChart.
let progressChartInstances: ChartInstance[] = [];

function parseFechaISO(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function computeDailyFrequency(logs: WeightLogEntry[], daysBack = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { date: Date; exercises: Set<string> }[] = [];
  const byKey = new Map<string, (typeof days)[number]>();
  for (let i = daysBack - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const day = { date, exercises: new Set<string>() };
    days.push(day);
    byKey.set(date.toDateString(), day);
  }
  logs.forEach((entry) => {
    const day = byKey.get(parseFechaISO(entry.fecha).toDateString());
    day?.exercises.add(entry.exerciseId);
  });
  return days.map((d) => ({ label: WEEKDAY_LABELS[d.date.getDay()], count: d.exercises.size }));
}

// Un mismo dia puede tener varias series cargadas para el mismo ejercicio -- para ver la
// tendencia real (sube o baja) se toma el peso maximo de cada dia, no cada serie suelta.
function maxWeightPerDay(entries: WeightLogEntry[]): { fecha: string; peso: number }[] {
  const maxByFecha = new Map<string, number>();
  entries.forEach((e) => maxByFecha.set(e.fecha, Math.max(e.peso, maxByFecha.get(e.fecha) ?? -Infinity)));
  return [...maxByFecha.entries()].map(([fecha, peso]) => ({ fecha, peso })).sort((a, b) => a.fecha.localeCompare(b.fecha));
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
    if (navigator.share) {
      try {
        await navigator.share({ title: "Mi perfil de Gym Social", url });
        return;
      } catch (err) {
        // AbortError: el usuario cerro el panel nativo a proposito, no es un error real.
        if ((err as Error).name === "AbortError") return;
        // Cualquier otro motivo (sin apps de destino, permiso denegado, etc.): seguimos
        // con el fallback de copiar el link en vez de dejar el boton sin ninguna respuesta.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = "¡Copiado!";
      setTimeout(() => {
        shareBtn.innerHTML = originalHTML;
      }, 2000);
    } catch {
      alert(`No se pudo compartir. Copiá el link:\n${url}`);
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
    smartNavigate(`chats.html?c=${id}`);
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
    // hidden en vez de remove(): esto puede pintarse dos veces en la misma carga (primero desde
    // el cache local, ver paintCachedProfile, despues con el dato real de la red) -- si sacamos
    // el nodo del DOM la primera vez, la segunda pasada ya no tiene donde escribir el label real.
    roleEl.hidden = !label;
    if (label) roleEl.textContent = label;
  }
}

async function renderProfileStats(userId: string, username: string, canViewLists: boolean, userType: Profile["user_type"], isOwner: boolean) {
  const stats = document.getElementById("profileStats");
  if (!stats) return;
  const [counts, postCount] = await Promise.all([
    getFollowCounts(userId).catch(() => ({ followers: 0, following: 0 })),
    getUserPostCount(userId).catch(() => 0),
  ]);
  // Suscriptores solo aplica a entrenadores, socios solo a gimnasios.
  const subscriberCount = userType === "entrenador" ? await getSubscriberCount(userId).catch(() => 0) : null;
  const socioCount = userType === "gimnasio" ? await getSocioCount(userId).catch(() => 0) : null;
  const u = encodeURIComponent(username);

  function stat(count: number, label: string, tab: "followers" | "following" | "subscribers"): string {
    const inner = `<strong>${count}</strong> ${label}`;
    return canViewLists ? `<a class="profile-stat" href="followers.html?u=${u}&tab=${tab}">${inner}</a>` : `<span class="profile-stat">${inner}</span>`;
  }

  // El listado de socios es informacion de gestion privada del gimnasio (nombre, estado,
  // fecha de alta, boton para dar de baja) -- a diferencia de seguidores/suscriptores no es
  // un listado semi-publico, asi que solo el dueño del perfil puede entrar a verlo.
  const socioStat = socioCount !== null
    ? isOwner
      ? `<a class="profile-stat" href="socios.html">${`<strong>${socioCount}</strong> socios`}</a>`
      : `<span class="profile-stat"><strong>${socioCount}</strong> socios</span>`
    : "";

  stats.innerHTML = `
    <span class="profile-stat"><strong>${postCount}</strong> publicaciones</span>
    ${stat(counts.followers, "seguidores", "followers")}
    ${stat(counts.following, "seguidos", "following")}
    ${subscriberCount !== null ? stat(subscriberCount, "suscriptores", "subscribers") : ""}
    ${socioStat}
  `;
}

function renderProfileBio(bio: string | null) {
  const bioEl = document.getElementById("profileBio");
  if (!bioEl) return;
  // Por si esto ya se pinto una vez en esta carga (cache local primero, dato real de la red
  // despues, ver paintCachedProfile): sacamos el toggle viejo para no duplicarlo, y no usamos
  // remove() sobre bioEl -- si el cache no tenia bio pero el dato real si, necesitamos que el
  // nodo siga ahi para la segunda pasada.
  document.querySelector(".profile-bio-toggle")?.remove();
  bioEl.classList.remove("profile-bio-expanded");
  bioEl.hidden = !bio;
  if (!bio) return;
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
  // hidden en vez de remove(): puede pintarse dos veces en la misma carga (cache local primero,
  // dato real despues, ver paintCachedProfile) -- si el cache no tenia links pero el dato real
  // si, el nodo tiene que seguir ahi para la segunda pasada.
  linksEl.hidden = links.length === 0;
  if (links.length === 0) return;
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

function socioButtonLabel(status: GymMembershipStatus): string {
  if (status === "pending") return "Solicitud enviada";
  if (status === "active") return "Socio";
  return "Ser socio";
}

function initSocioButton(targetId: string, initialStatus: GymMembershipStatus) {
  const btn = document.getElementById("socioBtn") as HTMLButtonElement | null;
  if (!btn || !myId) return;
  let status: GymMembershipStatus = initialStatus;

  function paint() {
    btn!.textContent = socioButtonLabel(status);
    btn!.classList.toggle("btn-primary", status === "none");
    btn!.classList.toggle("btn-outline", status !== "none");
  }
  paint();

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      if (status === "none") {
        const { status: newStatus, error } = await requestGymMembership(targetId);
        if (error) {
          alert(error);
          return;
        }
        status = newStatus ?? "pending";
      } else {
        // "Solicitud enviada" -> cancela; "Socio" -> deja de ser socio. Misma operación.
        const { error } = await leaveGym(targetId, myId!);
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
  // Suscripcion solo tiene sentido contra un entrenador; "socio" solo contra un gimnasio.
  const showSubscribeBtn = showFollowBtn && targetUserType === "entrenador";
  const showSocioBtn = showFollowBtn && targetUserType === "gimnasio";
  const followStatus: FollowStatus = showFollowBtn ? await getFollowStatus(targetId).catch(() => "none" as FollowStatus) : "none";
  // "ended" (fue alumno/socio, ya no lo es) se trata igual que "none": el boton vuelve a ofrecer
  // suscribirse/hacerse socio, y la RPC reactiva ese mismo vinculo historico si corresponde.
  const rawSubscriptionStatus: SubscriptionStatus = showSubscribeBtn ? await getSubscriptionStatus(targetId).catch(() => "none" as SubscriptionStatus) : "none";
  const subscriptionStatus: SubscriptionStatus = rawSubscriptionStatus === "ended" ? "none" : rawSubscriptionStatus;
  const rawSocioStatus: GymMembershipStatus = showSocioBtn ? await getGymMembershipStatus(targetId).catch(() => "none" as GymMembershipStatus) : "none";
  const socioStatus: GymMembershipStatus = rawSocioStatus === "ended" ? "none" : rawSocioStatus;
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
    ${showSocioBtn ? `<button class="btn ${socioStatus === "none" ? "btn-primary" : "btn-outline"}" id="socioBtn" type="button">${socioButtonLabel(socioStatus)}</button>` : ""}
  `;
  if (showMessageBtn) initMessageButton(targetId);
  else initShare(username, "shareBtn");
  if (showFollowBtn) initFollowButton(targetId, followStatus);
  if (showSubscribeBtn) initSubscribeButton(targetId, subscriptionStatus);
  if (showSocioBtn) initSocioButton(targetId, socioStatus);
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
const HANDLE_ICON = profileMenuIcon(`<path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M10 5h4v2h-4z"/>`);

// ---------- Item "Handle" del menu (solo entrenador visitando el perfil de un gimnasio) ----------

function confirmHandleAction(title: string, subtitle: string, confirmLabel: string, danger: boolean, onConfirm: () => Promise<{ error?: string }>, onDone: () => void): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>${escapeHtml(title)}</h2>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
        <div class="modal-actions">
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirmHandleActionBtn" type="button">${escapeHtml(confirmLabel)}</button>
          <button class="btn btn-outline" id="cancelHandleActionBtn" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("cancelHandleActionBtn")?.addEventListener("click", closeOverlay);
  document.getElementById("confirmHandleActionBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("confirmHandleActionBtn") as HTMLButtonElement;
    btn.disabled = true;
    const { error } = await onConfirm();
    closeOverlay();
    if (error) {
      alert(error);
      return;
    }
    onDone();
  });
}

function handleMenuItemsMarkup(status: GymTrainerHandleStatus, initiatedBy: HandleInitiatedBy): string {
  if (status === "pending" && initiatedBy === "gym") {
    return `
      <button class="profile-menu-item" id="menuAcceptHandleBtn" type="button">${HANDLE_ICON}Aceptar invitación de handle</button>
      <button class="profile-menu-item profile-menu-item-danger" id="menuRejectHandleBtn" type="button">${HANDLE_ICON}Rechazar invitación de handle</button>
    `;
  }
  if (status === "pending") return `<button class="profile-menu-item" id="menuCancelHandleBtn" type="button">${HANDLE_ICON}Cancelar solicitud de handle</button>`;
  if (status === "active") return `<button class="profile-menu-item profile-menu-item-danger" id="menuLeaveHandleBtn" type="button">${HANDLE_ICON}Dejar de ser handle de este gimnasio</button>`;
  return `<button class="profile-menu-item" id="menuRequestHandleBtn" type="button">${HANDLE_ICON}Ser handle de este gimnasio</button>`;
}

async function renderProfileMenu(targetId: string, username: string, ownerView: boolean, viewerLoggedIn: boolean, blockStatus: BlockStatus, targetUserType: Profile["user_type"]) {
  const wrap = document.getElementById("profileMenuWrap");
  const panel = document.getElementById("profileMenuPanel");
  if (!wrap || !panel) return;

  const shareItem = `<button class="profile-menu-item" id="menuShareBtn" type="button">${SHARE_ICON}Compartir perfil</button>`;
  const reportItem = `<button class="profile-menu-item" id="menuReportBtn" type="button">${REPORT_ICON}Reportar un error</button>`;
  const reportUserItem = `<button class="profile-menu-item profile-menu-item-danger" id="menuReportUserBtn" type="button">${REPORT_USER_ICON}Reportar usuario</button>`;

  // "Handle" solo tiene sentido si un entrenador esta mirando el perfil de un gimnasio.
  const handleEligible = !ownerView && viewerLoggedIn && targetUserType === "gimnasio";
  let showHandleItem = false;
  let handleItem = "";
  if (handleEligible) {
    const viewerBasic = await getProfileBasicById(myId!).catch(() => null);
    if (viewerBasic?.user_type === "entrenador") {
      showHandleItem = true;
      const h = await getGymTrainerHandleStatus(targetId).catch(() => ({ status: "none" as GymTrainerHandleStatus, initiatedBy: null as HandleInitiatedBy }));
      const handleStatus = h.status === "ended" ? "none" : h.status;
      handleItem = handleMenuItemsMarkup(handleStatus, h.initiatedBy);
    }
  }

  if (ownerView) {
    panel.innerHTML = `${shareItem}<a class="profile-menu-item" href="/pages/settings.html">${SETTINGS_ICON}Configuración</a>${reportItem}`;
  } else if (viewerLoggedIn) {
    const blockLabel = blockStatus === "blocked_by_me" ? "Desbloquear usuario" : "Bloquear usuario";
    panel.innerHTML = `${shareItem}${showHandleItem ? handleItem : ""}<button class="profile-menu-item profile-menu-item-danger" id="menuBlockBtn" type="button">${BLOCK_ICON}${blockLabel}</button>${reportUserItem}${reportItem}`;
  } else {
    panel.innerHTML = shareItem;
  }

  wrap.hidden = false;
  initShare(username, "menuShareBtn");

  function refreshMenu(): void {
    void renderProfileMenu(targetId, username, ownerView, viewerLoggedIn, blockStatus, targetUserType);
  }

  document.getElementById("menuRequestHandleBtn")?.addEventListener("click", () => {
    panel.hidden = true;
    confirmHandleAction(
      "Ser handle de este gimnasio",
      "Le vas a pedir al gimnasio que te sume como entrenador. El gimnasio tiene que aceptar y va a elegir por cuánto tiempo vas a ser handle.",
      "Pedir",
      false,
      () => requestGymTrainerHandle(targetId),
      refreshMenu
    );
  });
  document.getElementById("menuCancelHandleBtn")?.addEventListener("click", () => {
    panel.hidden = true;
    confirmHandleAction("Cancelar solicitud de handle", "Se cancela tu solicitud para ser handle de este gimnasio.", "Cancelar solicitud", true, () => leaveGymAsTrainer(targetId, myId!), refreshMenu);
  });
  document.getElementById("menuAcceptHandleBtn")?.addEventListener("click", () => {
    panel.hidden = true;
    confirmHandleAction("Aceptar invitación", "Vas a pasar a ser handle de este gimnasio, con la duración que ya definió.", "Aceptar", false, () => acceptGymTrainerInvite(targetId, myId!), refreshMenu);
  });
  document.getElementById("menuRejectHandleBtn")?.addEventListener("click", () => {
    panel.hidden = true;
    confirmHandleAction("Rechazar invitación", "No vas a ser handle de este gimnasio.", "Rechazar", true, () => leaveGymAsTrainer(targetId, myId!), refreshMenu);
  });
  document.getElementById("menuLeaveHandleBtn")?.addEventListener("click", () => {
    panel.hidden = true;
    confirmHandleAction("Dejar de ser handle", "Vas a dejar de ser handle de este gimnasio. Vas a poder volver a pedirlo cuando quieras.", "Dejar de ser handle", true, () => leaveGymAsTrainer(targetId, myId!), refreshMenu);
  });

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

function setupProfileMenuToggle(ctx: ViewContext) {
  const btn = document.getElementById("profileMenuBtn");
  const panel = document.getElementById("profileMenuPanel");
  if (!btn || !panel) return;

  btn.addEventListener("click", () => {
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.classList.toggle("open", willOpen);
    btn.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener(
    "click",
    (e) => {
      if (panel.hidden) return;
      const target = e.target as Node;
      if (panel.contains(target) || btn.contains(target)) return;
      panel.hidden = true;
      btn.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    },
    { signal: ctx.signal }
  );
}

// ---------- Menu de tuerca por rutina (Mostrar / Modificar / Eliminar) ----------

const ROUTINE_MENU_GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;

function setupRoutineMenuOutsideClick(ctx: ViewContext) {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".routine-menu-wrap")) return;
      document.querySelectorAll<HTMLElement>(".routine-menu-panel").forEach((p) => (p.hidden = true));
      document.querySelectorAll<HTMLButtonElement>(".routine-menu-btn").forEach((b) => {
        b.classList.remove("open");
        b.setAttribute("aria-expanded", "false");
      });
    },
    { signal: ctx.signal }
  );
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

  // El gimnasio no tiene rutinas propias ni progreso: sus accesos rapidos son un set
  // completamente distinto, no un agregado sobre el de usuario/entrenador de abajo.
  if (userType === "gimnasio") {
    quickActions.innerHTML = `
    <a class="quick-card reveal" href="/pages/socios.html">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      <div><h3>Tus socios</h3><p>Gestioná los socios de tu gimnasio</p></div>
    </a>
    <a class="quick-card reveal" href="/pages/entrenadores.html">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/></svg></div>
      <div><h3>Tus entrenadores</h3><p>Solicitudes, invitaciones y tu plantel de handles</p></div>
    </a>
    <a class="quick-card reveal" href="/pages/clases.html">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div>
      <div><h3>Tus clases</h3><p>Horarios, profesores e inscripción de socios</p></div>
    </a>
    <button type="button" class="quick-card reveal" id="addGymPostQuickBtn">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
      <div><h3>Agregar publicación</h3><p>Compartí fotos o videos con tus socios, entrenadores o público</p></div>
    </button>
  `;
    document.getElementById("addGymPostQuickBtn")?.addEventListener("click", () => activityTabsController?.openCreatePost());
    return;
  }

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

// ---------- Clases (solo perfiles de gimnasio) ----------

const CLASE_DAY_ABBR = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function claseFormatTime(t: string): string {
  return t.slice(0, 5);
}

function claseSessionsSummary(sessions: ClassSession[]): string {
  if (sessions.length === 0) return "Sin horario definido";
  return sessions.map((s) => `${CLASE_DAY_ABBR[s.dayOfWeek]} ${claseFormatTime(s.startTime)}-${claseFormatTime(s.endTime)}`).join(", ");
}

function claseCardMarkup(c: GymClassRow, isActiveSocio: boolean): string {
  const instructorName = c.instructorId ? `${c.instructorNombre ?? ""} ${c.instructorApellido ?? ""}`.trim() || c.instructorUsername : null;
  const instructorLine = instructorName
    ? c.instructorUsername
      ? `<a href="profile.html?u=${encodeURIComponent(c.instructorUsername)}">${escapeHtml(instructorName)}</a>`
      : escapeHtml(instructorName)
    : "Sin asignar";

  let enrollArea = "";
  if (c.allowEnrollment) {
    if (isActiveSocio) {
      enrollArea = c.isEnrolled
        ? `<div class="routine-actions"><button class="btn btn-outline btn-sm unenrollClassBtn" data-id="${c.id}" type="button">Cancelar inscripción</button></div>`
        : `<div class="routine-actions"><button class="btn btn-primary btn-sm enrollClassBtn" data-id="${c.id}" type="button">Inscribirme</button></div>`;
    } else {
      enrollArea = `<p class="gym-class-enroll-note">Hacete socio del gimnasio para inscribirte.</p>`;
    }
  }

  return `
    <div class="routine-card reveal" data-id="${c.id}">
      ${c.imageUrl ? `<img src="${escapeHtml(c.imageUrl)}" alt="" class="gym-class-image">` : ""}
      <h3>${escapeHtml(c.name)}</h3>
      ${c.description ? `<p>${escapeHtml(c.description)}</p>` : ""}
      <div class="routine-stats">
        <div><span>Profesor</span><strong>${instructorLine}</strong></div>
        <div><span>Horarios</span><strong>${escapeHtml(claseSessionsSummary(c.sessions))}</strong></div>
      </div>
      ${enrollArea}
    </div>
  `;
}

async function renderGymClasses(gymId: string, isActiveSocio: boolean, myUserId: string | null): Promise<void> {
  const section = document.getElementById("gymClasesSection");
  const summaryEl = document.getElementById("gymClasesSummary");
  const listEl = document.getElementById("gymClasesList");
  if (!section || !summaryEl || !listEl) return;

  let classes: GymClassRow[];
  try {
    classes = await listGymClasses(gymId);
  } catch {
    return;
  }
  // Sin clases publicadas, la seccion entera no tiene nada que mostrar -- se mantiene
  // oculta (arranca hidden en el markup) en vez de mostrar un estado vacio.
  if (classes.length === 0) return;
  section.hidden = false;
  summaryEl.textContent = "";

  function paint(): void {
    listEl!.innerHTML = classes.map((c) => claseCardMarkup(c, isActiveSocio)).join("");
    listEl!.querySelectorAll<HTMLButtonElement>(".enrollClassBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!myUserId) return;
        btn.disabled = true;
        const { error } = await enrollInClass(btn.dataset.id!, myUserId);
        if (error) {
          alert(error);
          btn.disabled = false;
          return;
        }
        const c = classes.find((x) => x.id === btn.dataset.id);
        if (c) {
          c.isEnrolled = true;
          c.enrolledCount += 1;
        }
        paint();
      });
    });
    listEl!.querySelectorAll<HTMLButtonElement>(".unenrollClassBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!myUserId) return;
        btn.disabled = true;
        const { error } = await unenrollFromClass(btn.dataset.id!, myUserId);
        if (error) {
          alert(error);
          btn.disabled = false;
          return;
        }
        const c = classes.find((x) => x.id === btn.dataset.id);
        if (c) {
          c.isEnrolled = false;
          c.enrolledCount = Math.max(0, c.enrolledCount - 1);
        }
        paint();
      });
    });
  }
  paint();
}

// ---------- Entrenadores (solo perfiles de gimnasio, calificacion de handles activos) ----------
// A diferencia de gymTrainer.service's listGymTrainers (privada, gym-owner-only), esta seccion
// usa list_gym_trainer_ratings: publica, gate por is_profile_public igual que Clases, y solo
// muestra handles activos -- no hay nada que ver aca para pending/ended.

function trainerRatingStarsMarkup(avg: number): string {
  const rounded = Math.round(avg);
  return `<span class="trainer-rating-stars" aria-hidden="true">${Array.from({ length: 5 }, (_, i) =>
    `<span class="trainer-rating-star${i < rounded ? " is-filled" : ""}">${TRAINER_STAR_ICON}</span>`
  ).join("")}</span>`;
}

const TRAINER_STAR_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2.5l2.76 5.6 6.18.9-4.47 4.36 1.06 6.16L12 16.6l-5.53 2.92 1.06-6.16-4.47-4.36 6.18-.9L12 2.5z"/></svg>`;

function entrenadorRatingCardMarkup(t: GymTrainerRatingRow, isActiveSocio: boolean): string {
  const nombreCompleto = `${t.nombre} ${t.apellido}`.trim() || t.username;
  const myRatingLabel = t.myRating != null ? `Tu calificación: ${t.myRating}★ · Editar` : "Calificar";

  const reviewsBtn = t.ratingCount > 0 ? `<button class="btn btn-outline btn-sm viewReviewsBtn" data-trainer="${t.trainerId}" type="button">Ver reseñas</button>` : "";
  const ratingArea = isActiveSocio
    ? `<div class="routine-actions"><button class="btn btn-outline btn-sm rateTrainerBtn" data-trainer="${t.trainerId}" type="button">${escapeHtml(myRatingLabel)}</button>${reviewsBtn}</div>`
    : `${reviewsBtn ? `<div class="routine-actions">${reviewsBtn}</div>` : ""}<p class="gym-gated-note">Hacete socio del gimnasio para calificar.</p>`;

  return `
    <div class="routine-card reveal" data-trainer="${t.trainerId}">
      <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(t.username)}">
        <img src="${escapeHtml(t.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
        <span class="search-result-body">
          <span class="search-result-name">${escapeHtml(nombreCompleto)}${renderVerifiedBadge("entrenador", t.isVerified)}</span>
          <span class="search-result-username">@${escapeHtml(t.username)}</span>
        </span>
      </a>
      <div class="trainer-rating-summary">
        ${trainerRatingStarsMarkup(t.avgRating)}
        <strong>${t.ratingCount > 0 ? t.avgRating.toFixed(1) : "Sin calificaciones"}</strong>
        ${t.ratingCount > 0 ? `<span class="trainer-rating-count">(${t.ratingCount})</span>` : ""}
      </div>
      ${ratingArea}
    </div>
  `;
}

async function renderGymEntrenadores(gymId: string, isActiveSocio: boolean, myUserId: string | null): Promise<void> {
  const section = document.getElementById("gymEntrenadoresSection");
  const summaryEl = document.getElementById("gymEntrenadoresSummary");
  const listEl = document.getElementById("gymEntrenadoresList");
  if (!section || !summaryEl || !listEl) return;

  let trainers: GymTrainerRatingRow[];
  try {
    trainers = await listGymTrainerRatings(gymId);
  } catch {
    return;
  }
  // Sin handles activos, la seccion no tiene nada que mostrar -- se mantiene oculta.
  if (trainers.length === 0) return;
  section.hidden = false;
  summaryEl.textContent = "";

  function paint(): void {
    listEl!.innerHTML = trainers.map((t) => entrenadorRatingCardMarkup(t, isActiveSocio)).join("");
    listEl!.querySelectorAll<HTMLButtonElement>(".rateTrainerBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!myUserId) return;
        const t = trainers.find((x) => x.trainerId === btn.dataset.trainer);
        if (!t) return;
        const nombreCompleto = `${t.nombre} ${t.apellido}`.trim() || t.username;
        openRateTrainerModal(gymId, t.trainerId, myUserId, nombreCompleto, { rating: t.myRating, comment: t.myComment }, () => {
          void renderGymEntrenadores(gymId, isActiveSocio, myUserId);
        });
      });
    });
    listEl!.querySelectorAll<HTMLButtonElement>(".viewReviewsBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = trainers.find((x) => x.trainerId === btn.dataset.trainer);
        if (!t) return;
        const nombreCompleto = `${t.nombre} ${t.apellido}`.trim() || t.username;
        openTrainerReviewsModal(gymId, t.trainerId, nombreCompleto);
      });
    });
  }
  paint();
}

// ---------- Publicaciones (solo perfiles de gimnasio, grilla estilo Instagram) ----------
// Viven como una pestaña mas de "Tu actividad" (ver setupActivityTabs) en vez de una seccion
// fija: para un gimnasio es la pestaña por defecto. RLS de list_gym_posts_full ya filtra que
// publicaciones puede ver este visitante puntual segun su visibilidad (publica/socios/
// entrenadores) -- aca solo se pinta lo que vino, sin recalcular nada del lado del cliente.

const GYM_POST_GRID_ICON_MULTI = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="13" height="13" rx="2"/><path d="M4 15V5a2 2 0 0 1 2-2h10"/></svg>`;
const GYM_POST_GRID_ICON_PLAY = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

function gymPostGridCellMarkup(p: GymPostFull): string {
  const cover = p.media[0];
  const isVideo = cover?.type === "video";
  return `
    <button type="button" class="gym-post-grid-cell" data-id="${p.id}">
      ${cover ? (isVideo ? `<video src="${escapeHtml(cover.url)}" muted playsinline preload="metadata"></video>` : `<img src="${escapeHtml(cover.url)}" alt="">`) : ""}
      ${p.pinned ? `<span class="gym-post-grid-pin">Fijada</span>` : ""}
      ${p.media.length > 1 ? `<span class="gym-post-grid-icon">${GYM_POST_GRID_ICON_MULTI}</span>` : isVideo ? `<span class="gym-post-grid-icon">${GYM_POST_GRID_ICON_PLAY}</span>` : ""}
    </button>
  `;
}

function gymAuthorFromProfile(profile: { id?: string | null; username?: string | null; nombre?: string | null; apellido?: string | null; avatar_url?: string | null; is_verified?: boolean | null }): PostAuthor {
  return {
    id: profile.id!,
    username: profile.username ?? "",
    nombre: profile.nombre ?? "",
    apellido: profile.apellido ?? "",
    avatarUrl: profile.avatar_url ?? null,
    userType: "gimnasio",
    isVerified: profile.is_verified ?? false,
  };
}

// ---------- Estadisticas ----------

// Une un widget "exercise_progress_chart" con los datos que necesita para dibujarse: el
// nombre a mostrar en el titulo y los puntos de peso maximo por dia. exerciseId null =
// automatico (el mas entrenado); si el ejercicio elegido ya no tiene cargas (se borraron, o
// nunca hubo), progressPoints queda vacio y el widget se omite del render (ver renderStats).
function resolveExerciseProgressWidget(
  logs: WeightLogEntry[],
  widget: { exerciseId: string | null },
  top: { id: string; name: string } | null
): { name: string; auto: boolean; points: { fecha: string; peso: number }[] } {
  const exerciseId = widget.exerciseId ?? top?.id ?? null;
  const excLogs = exerciseId ? logs.filter((l) => l.exerciseId === exerciseId) : [];
  const name = widget.exerciseId ? (excLogs[0]?.exerciseName ?? "Ejercicio") : (top?.name ?? "");
  return { name, auto: !widget.exerciseId, points: maxWeightPerDay(excLogs) };
}

// Idem para la tarjeta "Peso maximo por ejercicio", pero en vez de una serie por dia devuelve
// un unico numero: el maximo historico. Los pesos se pueden cargar en distintas unidades
// (kg/lb/bloques) y no son convertibles entre si (mismo criterio que progress.ts y
// getExerciseStats en weightLog.service.ts) -- se usa la mas repetida en el historial de este
// ejercicio puntual para no mezclar unidades en un mismo maximo.
function resolveMaxWeightWidget(
  logs: WeightLogEntry[],
  widget: { exerciseId: string | null },
  top: { id: string; name: string } | null
): { name: string; auto: boolean; max: { peso: number; unidad: WeightUnit } | null } {
  const exerciseId = widget.exerciseId ?? top?.id ?? null;
  const excLogs = exerciseId ? logs.filter((l) => l.exerciseId === exerciseId) : [];
  const name = widget.exerciseId ? (excLogs[0]?.exerciseName ?? "Ejercicio") : (top?.name ?? "");
  if (excLogs.length === 0) return { name, auto: !widget.exerciseId, max: null };

  const counts = new Map<WeightUnit, number>();
  excLogs.forEach((l) => counts.set(l.unidad, (counts.get(l.unidad) ?? 0) + 1));
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const sameUnit = excLogs.filter((l) => l.unidad === dominant);
  const max = Math.max(...sameUnit.map((l) => l.peso));
  return { name, auto: !widget.exerciseId, max: { peso: max, unidad: dominant } };
}

async function renderStats(logs: WeightLogEntry[], activeRoutinesCount: number, ownerView: boolean, widgets: StatWidget[]) {
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

  const cardsMarkup = widgets
    .map((w) => {
      switch (w.type) {
        case "last_trained":
          return `<div class="stat-card reveal"><div class="label">Último entrenamiento</div><div class="value">${escapeHtml(lastTrainingLabel(logs))}</div></div>`;
        case "top_exercise":
          return `<div class="stat-card reveal"><div class="label">Ejercicio más entrenado</div><div class="value">${escapeHtml(top?.name ?? "—")}</div></div>`;
        case "training_days_count":
          return `<div class="stat-card reveal"><div class="label">Entrenamientos registrados</div><div class="value">${trainingDaysCount(logs)}</div></div>`;
        case "active_routines":
          return `<div class="stat-card reveal"><div class="label">Rutinas activas</div><div class="value" id="activeRoutinesStatValue">${activeRoutinesCount}</div></div>`;
        case "max_weight_card": {
          const resolved = resolveMaxWeightWidget(logs, w, top);
          const label = resolved.auto ? "Peso máximo (automático)" : `Peso máximo: ${resolved.name}`;
          const value = resolved.max ? `${resolved.max.peso} ${resolved.max.unidad}` : "—";
          return `<div class="stat-card reveal"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
        }
        default:
          return "";
      }
    })
    .join("");

  // Los widgets de grafico (frecuencia / progreso por ejercicio) se resuelven antes de armar
  // el HTML porque un progreso sin al menos 2 dias de datos se omite del todo (mismo criterio
  // que ya usaba el chart unico de antes), y cada uno necesita su propio <canvas id> unico ya
  // que ahora puede haber varios "progreso por ejercicio" a la vez.
  const chartWidgets = widgets.filter((w): w is StatWidget & { type: "frequency_chart" | "exercise_progress_chart" } => w.type === "frequency_chart" || w.type === "exercise_progress_chart");

  const chartsMarkup = chartWidgets
    .map((w, i) => {
      if (w.type === "frequency_chart") {
        return `<div class="chart-card reveal">
      <h3>Frecuencia de entrenamiento</h3>
      <p class="chart-sub">Ejercicios distintos entrenados cada día de esta semana.</p>
      <div class="chart-wrap"><canvas id="freqChart"></canvas></div>
    </div>`;
      }
      const resolved = resolveExerciseProgressWidget(logs, w, top);
      if (resolved.points.length < 2) return "";
      return `<div class="chart-card reveal">
      <h3>Progreso: ${escapeHtml(resolved.name)}</h3>
      <p class="chart-sub">Peso máximo por día en ${ownerView ? "tu" : "su"} ejercicio${resolved.auto ? " más entrenado" : ""}.</p>
      <div class="chart-wrap"><canvas id="progressChart-${i}"></canvas></div>
    </div>`;
    })
    .join("");

  statsContent.innerHTML = `
    <div class="card-grid">${cardsMarkup}</div>
    ${chartsMarkup}
  `;

  freqChartInstance?.destroy();
  freqChartInstance = null;
  progressChartInstances.forEach((c) => c.destroy());
  progressChartInstances = [];

  for (const [i, w] of chartWidgets.entries()) {
    if (w.type === "frequency_chart") {
      await renderFreqChart(computeDailyFrequency(logs));
      continue;
    }
    const resolved = resolveExerciseProgressWidget(logs, w, top);
    if (resolved.points.length < 2) continue;
    const inst = await renderProgressChart(`progressChart-${i}`, resolved.points);
    if (inst) progressChartInstances.push(inst);
  }
}

async function renderFreqChart(buckets: { label: string; count: number }[]) {
  const canvas = document.getElementById("freqChart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const Chart = await loadChart();
  freqChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: buckets.map((b) => b.label),
      datasets: [{ label: "Ejercicios", data: buckets.map((b) => b.count), backgroundColor: "#ff8a3d", borderRadius: 6, maxBarThickness: 34 }],
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

async function renderProgressChart(canvasId: string, entries: { fecha: string; peso: number }[]): Promise<ChartInstance | null> {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return null;
  const Chart = await loadChart();
  return new Chart(canvas, {
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
// Que pestaña de "Tu actividad" esta visible ahora mismo (ver setupActivityTabs) -- vive a
// nivel de modulo, no solo dentro del closure de esa funcion, para que
// refreshCurrentRoutinesTab sepa si puede reconstruir los graficos de Estadisticas ahora
// (canvas visible) o si tiene que dejarlos marcados como "atrasados" para cuando el usuario
// vuelva a esa pestaña (ver statsDirty).
let activeActivityTab: ActivityTab = "stats";
let statsDirty = false;

// Contexto guardado tras el primer render para poder refrescar la lista de
// rutinas y el conteo de "Rutinas activas" in-place (sin recargar la pagina)
// despues de finalizar/reactivar una rutina.
let routinesCtx: {
  userId: string;
  ownerView: boolean;
  logs: WeightLogEntry[];
  userType: Profile["user_type"];
  ownerBasic: BasicNamedProfile;
  widgets: StatWidget[];
  showStats: boolean;
} | null = null;
// Puente hacia el closure de setupActivityTabs: agregar/sacar el boton "Estadisticas" y saltar
// de pestaña si hacia falta (para cuando show_stats cambia en Configuración mientras esta
// instancia de perfil sigue viva en cache, ver refreshCurrentRoutinesTab), y abrir el modal de
// "Agregar publicación" desde el quick-action del dueño de un gimnasio (ver renderQuickActions)
// sin que ese renderer tenga que conocer nada de la pestaña Publicaciones.
let activityTabsController: { setShowStats(next: boolean): void; openCreatePost(): void } | null = null;

// Mismo fallback tabla-cruda/vista-publica que usa main(): el dueño (o un admin/entrenador con
// acceso) ve profiles directamente; cualquier otro visitante cae a profiles_public.
async function fetchStatsPrefs(userId: string): Promise<{ showStats: boolean; widgets: StatWidget[] }> {
  const full = await getProfile(userId).catch(() => null);
  const row = full ?? (await getProfileBasicById(userId).catch(() => null));
  return { showStats: row?.show_stats ?? true, widgets: parseStatWidgets(row?.stats_widgets) };
}
// Idem para poder refrescar seguidores/seguidos/suscriptores/publicaciones al volver a esta
// instancia (ver refreshCurrentRoutinesTab) -- a diferencia de routinesCtx, no depende de
// weight_logs asi que no necesita cargar nada pesado, solo re-pedir los contadores.
let profileStatsCtx: { userId: string; username: string; canViewLists: boolean; userType: Profile["user_type"]; isOwner: boolean } | null = null;

async function refreshRoutinesAndStats() {
  if (!routinesCtx) return;
  activeRoutineTab = "active";
  const count = await renderRoutines(routinesCtx.userId, routinesCtx.ownerView, routinesCtx.logs, routinesCtx.userType, routinesCtx.ownerBasic);
  const statValue = document.getElementById("activeRoutinesStatValue");
  if (statValue && count !== undefined) statValue.textContent = String(count);
}

// El shell mantiene esta vista viva en cache al navegar afuera (ej. a "Pesos semanales" a
// cargar un entrenamiento, a seguir/dejar de seguir a alguien desde otro perfil, o a
// excView.html a modificar una rutina) y volver: el router solo llama mount() una vez por
// instancia (ver router.ts), asi que sin este refetch "Ultimo entrenamiento", el progreso de
// cada rutina, los contadores de seguidores/seguidos/suscriptores/publicaciones y el resto
// de las estadisticas quedarian pegados a lo que habia la primera vez que se monto el
// perfil, por mas que haya pasado algo nuevo mientras tanto. A diferencia de
// refreshRoutinesAndStats (pensada para finalizar/reactivar, siempre en la pestaña
// "Activas"), esta respeta la pestaña de rutinas que el usuario tenia seleccionada.
async function refreshCurrentRoutinesTab() {
  if (profileStatsCtx) {
    void renderProfileStats(profileStatsCtx.userId, profileStatsCtx.username, profileStatsCtx.canViewLists, profileStatsCtx.userType, profileStatsCtx.isOwner);
  }

  // Un gimnasio no tiene rutinas (routinesCtx queda null a proposito, ver main()) -- ya se
  // refresco lo unico que le aplica (seguidores/socios arriba), no hay nada mas que hacer.
  if (!routinesCtx) return;

  const logs = await listWeightLogsWithContext(routinesCtx.userId).catch(() => routinesCtx!.logs);
  routinesCtx.logs = logs;

  // "Mostrar estadisticas" y los widgets elegidos se configuran en Configuración >
  // Personalización, una vista distinta: si el usuario los cambia ahi y vuelve a este perfil
  // ya montado (misma instancia en cache, ver comentario arriba de esta funcion), sin este
  // refetch seguiria viendo la config vieja hasta recargar la pagina entera.
  const prefs = await fetchStatsPrefs(routinesCtx.userId).catch(() => ({ showStats: routinesCtx!.showStats, widgets: routinesCtx!.widgets }));
  routinesCtx.widgets = prefs.widgets;
  if (prefs.showStats !== routinesCtx.showStats) {
    routinesCtx.showStats = prefs.showStats;
    activityTabsController?.setShowStats(prefs.showStats);
  }

  const count = await renderRoutines(routinesCtx.userId, routinesCtx.ownerView, logs, routinesCtx.userType, routinesCtx.ownerBasic);
  let activeCount = count;
  if (activeRoutineTab === "active") {
    const statValue = document.getElementById("activeRoutinesStatValue");
    if (statValue && count !== undefined) statValue.textContent = String(count);
  } else {
    // "count" es el de la sub-pestaña de rutinas actualmente visible (historicas/guardadas),
    // no el de activas -- para no pisar la tarjeta de Estadisticas con el numero equivocado,
    // se usa el valor ya mostrado ahi (quedo bien puesto la ultima vez que se toco "Activas").
    activeCount = Number(document.getElementById("activeRoutinesStatValue")?.textContent ?? 0);
  }

  if (!routinesCtx.showStats) return;

  // Los graficos de Chart.js no miden bien un canvas oculto (display:none) al crearse -- si
  // la pestaña de Estadisticas no esta visible ahora mismo, se difiere la reconstruccion
  // hasta que el usuario vuelva a ella (ver switchTab en setupActivityTabs).
  if (activeActivityTab === "stats") {
    void renderStats(logs, activeCount ?? 0, routinesCtx.ownerView, routinesCtx.widgets);
  } else {
    statsDirty = true;
  }
}

// ---------- Actividad: Estadísticas / Tus Reps / Multimedia / Me gusta ----------
// Selector debajo de "Tu actividad": por defecto las estadisticas (stats de
// siempre), y 3 pestañas mas que muestran listas de Reps -- reemplaza a la
// vieja seccion #repsSection (fija, solo "Tus Reps"), ahora consolidada aca.
// "Tus Reps" incluye tanto los Reps propios como los reposteados (fusionados
// y ordenados cronologicamente, ver getUserRepsAndReposts).

const ACTIVITY_PAGE_SIZE = 20;

// "publicaciones" (solo gimnasios) no entra en los mismos mapas/tipos que reps/media/likes:
// trae GymPostFull (grilla + visor propios), no FeedPost -- se maneja aparte en cada rama de
// abajo (renderList/loadMore/switchTab), nunca se castea a FeedActivityTab.
type ActivityTab = "stats" | "reps" | "media" | "likes" | "publicaciones";
type FeedActivityTab = Exclude<ActivityTab, "stats" | "publicaciones">;
type ActivityFetcher = (userId: string, beforeIso?: string) => Promise<FeedPost[]>;

const ACTIVITY_FETCHERS: Record<FeedActivityTab, ActivityFetcher> = {
  reps: getUserRepsAndReposts,
  media: getUserMedia,
  likes: getUserLikedPosts,
};

function activityEmptyMessage(tab: FeedActivityTab, isOwner: boolean): string {
  if (tab === "reps") return isOwner ? "Todavía no publicaste ningún Rep." : "Todavía no publicó ningún Rep.";
  if (tab === "media") return isOwner ? "Todavía no subiste fotos ni videos." : "Todavía no subió fotos ni videos.";
  return isOwner ? "Todavía no le pusiste me gusta a nada." : "Todavía no le puso me gusta a nada.";
}

function goToAuthorProfile(author: PostAuthor): void {
  smartNavigate(`profile.html?u=${encodeURIComponent(author.username)}`);
}

function goToPost(postId: string, onCommentPosted?: (postId: string) => void): void {
  if (!myId) {
    smartNavigate("login.html");
    return;
  }
  openPostDetailModal(postId, myId, onCommentPosted);
}

function setupActivityTabs(
  targetUserId: string,
  isOwner: boolean,
  nombre: string,
  ctx: ViewContext,
  showStats: boolean,
  gymAuthor: PostAuthor | null
): void {
  const tabsEl = document.getElementById("activityTabs");
  const statsContent = document.getElementById("statsContent");
  const listEl = document.getElementById("activityPostsList");
  const sentinel = document.getElementById("activityPostsSentinel");
  const spinner = document.getElementById("activityPostsSpinner");
  if (!tabsEl || !statsContent || !listEl || !sentinel) return;

  // Preferencia de Configuración > Personalización ("mostrar estadísticas"): sin la pestaña
  // Estadísticas, la que aterriza por defecto es Reps (o Publicaciones si es un gimnasio, ver
  // mas abajo). null (no "stats") fuerza a switchTab de mas abajo a correr su rama completa la
  // primera vez, en vez de quedar pisada por su propio guard "if (tab === activeTab) return".
  if (!showStats) tabsEl.querySelector<HTMLButtonElement>('[data-tab="stats"]')?.remove();
  const pubTabBtn = tabsEl.querySelector<HTMLButtonElement>('[data-tab="publicaciones"]');
  if (gymAuthor) pubTabBtn?.removeAttribute("hidden");
  else pubTabBtn?.remove();
  // Un gimnasio ya tiene "Publicaciones" (grilla estilo IG con fotos/videos) -- la pestaña
  // "Multimedia" (que junta medios de Reps propios y reposteados) queda redundante ahi.
  if (gymAuthor) tabsEl.querySelector<HTMLButtonElement>('[data-tab="media"]')?.remove();

  let activeTab: ActivityTab | null = null;
  let posts: FeedPost[] = [];
  let cursor: string | undefined;
  let loadingMore = false;
  let exhausted = false;
  let gymPosts: GymPostFull[] = [];

  async function refreshGymPostGrid(): Promise<void> {
    gymPosts = await listGymPostsFull(targetUserId).catch(() => []);
    renderList();
  }

  function renderList(): void {
    if (activeTab === "stats") return;
    if (activeTab === "publicaciones") {
      listEl!.innerHTML = gymPosts.length
        ? `<div class="gym-post-grid">${gymPosts.map(gymPostGridCellMarkup).join("")}</div>`
        : `<p class="exc-pick-empty">${isOwner ? "Todavía no publicaste nada." : `Todavía no publicó nada ${nombre}.`}</p>`;
      listEl!.querySelectorAll<HTMLButtonElement>(".gym-post-grid-cell").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = gymPosts.findIndex((p) => p.id === btn.dataset.id);
          if (i === -1 || !gymAuthor) return;
          openGymPostViewer({
            posts: gymPosts,
            startIndex: i,
            author: gymAuthor,
            viewerId: myId,
            isOwner,
            onChanged: () => void refreshGymPostGrid(),
          });
        });
      });
      return;
    }
    const tab = activeTab as FeedActivityTab;
    listEl!.innerHTML = posts.length ? posts.map((p) => renderPostCard(p, myId, { compact: true })).join("") : `<p class="exc-pick-empty">${activityEmptyMessage(tab, isOwner)}</p>`;
    wirePostCard(listEl!, posts, handlers);
  }

  async function handleLikeToggle(post: FeedPost): Promise<void> {
    if (!myId) {
      smartNavigate("login.html");
      return;
    }
    const wasLiked = post.likedByMe;
    post.likedByMe = !wasLiked;
    post.likes_count += wasLiked ? -1 : 1;
    renderList();
    const { error } = await toggleLike(post.id, myId, wasLiked);
    if (error) {
      post.likedByMe = wasLiked;
      post.likes_count += wasLiked ? 1 : -1;
      renderList();
      alert(error);
    }
  }

  async function handleRepostToggle(post: FeedPost): Promise<void> {
    if (!myId) {
      smartNavigate("login.html");
      return;
    }
    const wasReposted = post.repostedByMe;
    post.repostedByMe = !wasReposted;
    post.reposts_count += wasReposted ? -1 : 1;
    renderList();
    const { error } = await toggleRepost(post.id, myId, wasReposted);
    if (error) {
      post.repostedByMe = wasReposted;
      post.reposts_count += wasReposted ? 1 : -1;
      renderList();
      alert(error);
    }
  }

  // Comentar desde adentro del modal de detalle (ver postDetailModal.ts) actualiza su propia
  // copia del Rep, no esta lista -- sin esto el contador de comentarios queda viejo al volver.
  function bumpCommentCount(postId: string): void {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    post.comments_count += 1;
    renderList();
  }

  const handlers: PostCardHandlers = {
    viewerId: myId,
    onLikeToggle: (post) => void handleLikeToggle(post),
    onRepostToggle: (post) => void handleRepostToggle(post),
    onCommentClick: (post) => {
      if (!myId) {
        smartNavigate("login.html");
        return;
      }
      openCommentModal(post, myId, () => {
        post.comments_count += 1;
        renderList();
      });
    },
    onQuoteClick: (post) => {
      if (!myId) {
        smartNavigate("login.html");
        return;
      }
      openQuoteModal(post, myId, (created) => {
        // Si estas mirando tu propio perfil y esta abierta la pestaña de Reps, la cita nueva entra a esta misma lista.
        if (activeTab !== "reps" || !isOwner || created.author_id !== myId) return;
        getPost(created.id)
          .then((hydrated) => {
            if (!hydrated) return;
            posts = [hydrated, ...posts];
            renderList();
          })
          .catch(() => {});
      });
    },
    onShareClick: (post) => {
      if (!myId) {
        smartNavigate("login.html");
        return;
      }
      void openShareToChatModal(post, myId);
    },
    onDeleteClick: (post) => {
      confirmDeletePost(post, () => {
        posts = posts.filter((p) => p.id !== post.id);
        renderList();
      });
    },
    onAuthorClick: goToAuthorProfile,
    onMetricsClick: (post) => openPostMetricsModal(post),
    onView: (post) => {
      if (myId && post.author_id !== myId) void recordPostView(post.id, myId);
    },
    onOpenPost: (post) => goToPost(post.id, bumpCommentCount),
    onQuotedClick: (quotedId) => goToPost(quotedId, bumpCommentCount),
    // A diferencia del feed, en el perfil el swipe-arriba nunca tiene que mostrar un
    // video de otra persona -- ni siquiera en la pestaña "Me gusta", que puede traer Reps
    // ajenos: se filtra siempre por el autor del Rep que se tocó, no por targetUserId (da
    // lo mismo salvo en esa pestaña, y ahi es justo donde importa la diferencia).
    getVideoQueue: (current) => posts.filter((p) => p.author_id === current.author_id && p.media_type === "video" && p.media_url),
  };

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    },
    { rootMargin: "600px 0px" }
  );
  ctx.addCleanup(() => observer.disconnect());

  async function loadMore(): Promise<void> {
    // "publicaciones" no pagina: list_gym_posts_full trae todo en una sola llamada (mismo
    // criterio que list_gym_classes/list_gym_members, sin infra de paginacion en este proyecto).
    if (activeTab === "stats" || activeTab === "publicaciones" || activeTab === null || loadingMore || exhausted) return;
    loadingMore = true;
    if (spinner) spinner.hidden = false;
    const fetcher = ACTIVITY_FETCHERS[activeTab as FeedActivityTab];
    const older = await fetcher(targetUserId, cursor).catch(() => []);
    loadingMore = false;
    if (spinner) spinner.hidden = true;

    if (older.length === 0) {
      exhausted = true;
      observer.disconnect();
      return;
    }
    cursor = older[older.length - 1].feedTimestamp;
    posts = [...posts, ...older];
    renderList();
    if (older.length < ACTIVITY_PAGE_SIZE) {
      exhausted = true;
      observer.disconnect();
    }
  }

  async function switchTab(tab: ActivityTab): Promise<void> {
    if (tab === activeTab) return;
    activeTab = tab;
    activeActivityTab = tab;
    observer.disconnect();

    tabsEl!.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    if (tab === "stats") {
      statsContent!.hidden = false;
      listEl!.hidden = true;
      sentinel!.hidden = true;
      // Si mientras esta pestaña estuvo oculta llego un refresh de logs (ver
      // refreshCurrentRoutinesTab), el canvas recien ahora queda visible -- reconstruir los
      // graficos con los datos frescos recien en este momento.
      if (statsDirty && routinesCtx) {
        statsDirty = false;
        const activeCount = Number(document.getElementById("activeRoutinesStatValue")?.textContent ?? 0);
        void renderStats(routinesCtx.logs, activeCount, routinesCtx.ownerView, routinesCtx.widgets);
      }
      return;
    }

    if (tab === "publicaciones") {
      statsContent!.hidden = true;
      listEl!.hidden = false;
      listEl!.innerHTML = `<p class="exc-pick-empty">Cargando...</p>`;
      sentinel!.hidden = true;
      await refreshGymPostGrid();
      return;
    }

    statsContent!.hidden = true;
    listEl!.hidden = false;
    listEl!.innerHTML = `<p class="exc-pick-empty">Cargando...</p>`;
    sentinel!.hidden = false;

    posts = [];
    cursor = undefined;
    exhausted = false;

    posts = await ACTIVITY_FETCHERS[tab](targetUserId).catch(() => []);
    cursor = posts.length ? posts[posts.length - 1].feedTimestamp : undefined;
    renderList();
    if (posts.length < ACTIVITY_PAGE_SIZE) exhausted = true;
    else observer.observe(sentinel!);
  }

  tabsEl.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".routine-tab");
    if (!btn?.dataset.tab) return;
    void switchTab(btn.dataset.tab as ActivityTab);
  });

  // activeTab arranca en null (no "stats") justamente para que este primer switchTab corra
  // su rama completa en vez de pisarse con el guard "if (tab === activeTab) return" de mas
  // arriba. Cuando showStats es true, la rama "stats" no vuelve a pintar el contenido (eso ya
  // lo hizo main() con su propio renderStats) -- solo deja la pestaña marcada como activa. Un
  // gimnasio no tiene "stats" (showStats siempre false para isGym, ver main()) y aterriza en
  // Publicaciones por defecto en vez de Reps.
  void switchTab(gymAuthor ? "publicaciones" : showStats ? "stats" : "reps");

  // El click en los botones de tabsEl esta delegado en un solo listener (arriba), asi que
  // agregar/sacar el boton "Estadisticas" del DOM no necesita re-wirear nada -- por eso
  // alcanza con este controller minimo para que refreshCurrentRoutinesTab pueda reaccionar a
  // un cambio en vivo de "mostrar estadisticas" (ver activityTabsController mas arriba).
  activityTabsController = {
    setShowStats(next) {
      const hasStatsBtn = !!tabsEl!.querySelector('[data-tab="stats"]');
      if (next && !hasStatsBtn) {
        const btn = document.createElement("button");
        btn.className = "routine-tab";
        btn.type = "button";
        btn.dataset.tab = "stats";
        btn.textContent = "Estadísticas";
        tabsEl!.insertBefore(btn, tabsEl!.firstChild);
      } else if (!next && hasStatsBtn) {
        tabsEl!.querySelector('[data-tab="stats"]')?.remove();
        if (activeTab === "stats") void switchTab("reps");
      }
    },
    openCreatePost() {
      if (!gymAuthor) return;
      openCreateGymPostModal(targetUserId, () => {
        if (activeTab === "publicaciones") void refreshGymPostGrid();
        else void switchTab("publicaciones");
      });
    },
  };
  ctx.addCleanup(() => {
    activityTabsController = null;
  });
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
               <button type="button" class="profile-menu-item profile-menu-item-danger deleteRoutineBtn" data-id="${r.id}">Eliminar</button>`
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
    btn.addEventListener("click", () => smartNavigate(`pesos.html?rid=${btn.dataset.id}`));
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
  container.querySelectorAll<HTMLButtonElement>(".deleteRoutineBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const routine = routines.find((r) => r.id === btn.dataset.id);
      if (routine) confirmDeleteRoutineModal(routine);
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
               ${isFullyOwnedByViewer(r) ? `<button type="button" class="profile-menu-item profile-menu-item-danger deleteRoutineBtn" data-id="${r.id}">Eliminar</button>` : ""}
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
    btn.addEventListener("click", () => smartNavigate(`showExc.html?rid=${btn.dataset.id}`));
  });
  if (!ownerView) return;

  wireRoutineMenus(container);

  container.querySelectorAll<HTMLButtonElement>(".reactivateRoutine").forEach((btn) => {
    btn.addEventListener("click", () => openReactivateModal(btn.dataset.id!));
  });
  container.querySelectorAll<HTMLButtonElement>(".deleteRoutineBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const routine = routines.find((r) => r.id === btn.dataset.id);
      if (routine) confirmDeleteRoutineModal(routine);
    });
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
            <button type="button" class="profile-menu-item profile-menu-item-danger deleteRoutineBtn" data-id="${r.id}">Eliminar</button>
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
  container.querySelectorAll<HTMLButtonElement>(".deleteRoutineBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const routine = routines.find((r) => r.id === btn.dataset.id);
      if (routine) confirmDeleteRoutineModal(routine);
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
        <div id="assignModalBody" class="modal-list"><p class="chart-sub">Cargando tus suscriptores...</p></div>
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
      smartNavigate(`rutinsView.html?uid=${encodeURIComponent(btn.dataset.id!)}&cloneFrom=${encodeURIComponent(routineId)}`);
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

function confirmDeleteRoutineModal(routine: RoutineWithCounts) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Eliminar rutina</h2>
        <p class="subtitle">¿Eliminar "${escapeHtml(routine.nombre)}"? Esta acción no se puede deshacer: vas a perder las semanas, días y pesos cargados en esta rutina.</p>
        <div class="modal-actions">
          <button class="btn btn-danger" id="confirmDeleteRoutine">Eliminar rutina</button>
          <button class="btn btn-outline" id="cancelDeleteRoutine">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("cancelDeleteRoutine")?.addEventListener("click", closeOverlay);
  document.getElementById("confirmDeleteRoutine")?.addEventListener("click", async () => {
    const confirmBtn = document.getElementById("confirmDeleteRoutine") as HTMLButtonElement;
    confirmBtn.disabled = true;
    document.getElementById("cancelDeleteRoutine")?.setAttribute("disabled", "true");
    try {
      await deleteRoutine(routine.id);
    } catch {
      alert("No se pudo eliminar la rutina. Probá de nuevo.");
      confirmBtn.disabled = false;
      document.getElementById("cancelDeleteRoutine")?.removeAttribute("disabled");
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
        <p>¡Rutina eliminada!</p>
      </div>
    `;
    setTimeout(() => {
      closeOverlay();
      void refreshCurrentRoutinesTab();
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

/** Pinta foto/nombre/bio/links al toque desde lo que se tenga cacheado de una visita anterior a
 * este mismo perfil (ver profileDb.ts), mientras se espera la respuesta real de la red -- misma
 * idea que ya usa chat.ts con los mensajes. Los mismos render*() de siempre se vuelven a llamar
 * mas abajo con el dato real apenas llega, así que esto es puramente un adelanto optimista. */
function paintCachedProfile(cached: ProfileBasic): void {
  renderProfileIdentity(cached.username ?? "", cached.nombre ?? "Este usuario", cached.apellido ?? "", cached.user_type ?? "usuario", cached.is_verified ?? false);
  const avatarImg = document.getElementById("avatarImg") as HTMLImageElement | null;
  if (avatarImg && cached.avatar_url) avatarImg.src = cached.avatar_url;
  renderProfileBio(cached.bio ?? null);
  renderProfileLinks(parseProfileLinks(cached.links ?? []));
}

async function main(ctx: ViewContext) {
  const cachedProfile = usernameParam ? await getCachedProfileByUsername(usernameParam) : myId ? await getCachedProfileById(myId) : null;
  if (cachedProfile) paintCachedProfile(cachedProfile);

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

  // Si esta instancia se descarto (ej. maxInstances:1 del catch-all de perfil desalojo esta
  // visita porque se abrio un tercer perfil distinto) mientras estos fetches estaban en vuelo,
  // seguir pintando ahora corriria el riesgo de escribir sobre el DOM del perfil que la
  // reemplazo (mismos ids, doc.getElementById encontraria el elemento equivocado).
  if (ctx.signal.aborted) return;

  const displayProfile = profile ?? basicProfile;

  if (!displayProfile) {
    const usernameEl = document.getElementById("profileUsername");
    if (usernameEl) usernameEl.textContent = "Este perfil no existe";
    document.getElementById("profileTop")?.remove();
    return;
  }

  // Solo los campos "publicos" (nunca el mail ni otra cosa privada que pueda traer la fila
  // completa que ve el dueño) -- para la proxima visita a este perfil, ver paintCachedProfile.
  void cacheProfile({
    id: displayProfile.id,
    username: displayProfile.username,
    nombre: displayProfile.nombre,
    apellido: displayProfile.apellido,
    avatar_url: displayProfile.avatar_url,
    bio: displayProfile.bio,
    links: displayProfile.links,
    nacionalidad: displayProfile.nacionalidad,
    fecha_nacimiento: displayProfile.fecha_nacimiento,
    is_public: displayProfile.is_public,
    is_verified: displayProfile.is_verified,
    user_type: displayProfile.user_type,
    show_stats: displayProfile.show_stats,
    stats_widgets: displayProfile.stats_widgets,
  });

  const isOwner = displayProfile.id === myId;
  const nombre = displayProfile.nombre ?? "Este usuario";

  // Señal para el algoritmo del feed (get_personalized_feed): perfiles que
  // visitaste le dan un pequeño boost a ese autor. Nunca debe romper la carga
  // del perfil si falla.
  if (!isOwner && myId) void touchProfileVisit(displayProfile.id!);

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
  void renderProfileMenu(displayProfile.id!, displayProfile.username ?? "", isOwner, myId !== null, blockStatus, targetUserType);

  // Un seguidor aceptado ve el perfil completo aunque sea privado (misma logica
  // que ya usan las RLS de rutinas/pesos via is_profile_public en la base).
  const isPrivateForViewer = !profile && !basicProfile?.is_public && followStatus !== "accepted";

  // El link a seguidores/seguidos usa la misma regla: si el perfil es privado
  // para este visitante, ni siquiera se muestra clickeable (la RPC tambien lo
  // bloquea server-side, pero evitamos el link muerto).
  profileStatsCtx = { userId: displayProfile.id!, username: displayProfile.username ?? "", canViewLists: !isPrivateForViewer, userType: targetUserType, isOwner };
  void renderProfileStats(profileStatsCtx.userId, profileStatsCtx.username, profileStatsCtx.canViewLists, profileStatsCtx.userType, profileStatsCtx.isOwner);

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
  const rutinasEyebrow = document.getElementById("rutinasEyebrow");
  if (!isOwner) {
    if (statsEyebrow) statsEyebrow.textContent = "Su actividad";
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

  // "Mostrar estadisticas" y que widgets (Configuración > Personalización) aplican tanto al
  // dueño como a cualquier visitante -- no es un toggle de privacidad, es "no quiero esta
  // seccion en mi perfil" (confirmado con el usuario). displayProfile puede venir de la tabla
  // cruda o de profiles_public segun el caso (ver arriba), asi que ambas exponen las columnas.
  // Un gimnasio no entrena, asi que no tiene rutinas ni estadisticas de entrenamiento --
  // fuerza showStats a false (pisa la preferencia guardada) y saltea toda la seccion de
  // rutinas por completo, sin ni siquiera pedir los weight_logs.
  const isGym = targetUserType === "gimnasio";
  const showStats = isGym ? false : (displayProfile.show_stats ?? true);
  const statWidgets = parseStatWidgets(displayProfile.stats_widgets);

  if (isGym) {
    document.getElementById("rutinas")?.remove();
    routinesCtx = null;
    const isActiveSocio = !isOwner && myId ? (await getGymMembershipStatus(displayProfile.id!).catch(() => "none")) === "active" : false;
    void renderGymClasses(displayProfile.id!, isActiveSocio, myId);
    void renderGymEntrenadores(displayProfile.id!, isActiveSocio, myId);
  } else {
    const logs = await listWeightLogsWithContext(displayProfile.id!);
    routinesCtx = { userId: displayProfile.id!, ownerView: isOwner, logs, userType: targetUserType, ownerBasic: displayProfile, widgets: statWidgets, showStats };
    const activeCount = await renderRoutines(displayProfile.id!, isOwner, logs, targetUserType, displayProfile, viewerCanCopyToSaved);
    if (showStats) void renderStats(logs, activeCount ?? 0, isOwner, statWidgets);
  }
  setupActivityTabs(displayProfile.id!, isOwner, nombre, ctx, showStats, isGym ? gymAuthorFromProfile(displayProfile) : null);
}

const VIEW_MARKUP = `
  <section class="profile-hero">
    <div class="container">
      <div class="profile-top" id="profileTop">
        <div class="avatar-wrap">
          <img src="/images/avatars/default.svg" alt="Foto de perfil" id="avatarImg">
          <div class="avatar-uploading" id="avatarUploading" hidden><div class="modern-spinner"></div></div>
          <label class="avatar-edit" id="avatarEditWrap" title="Cambiar foto de perfil">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/></svg>
            <input type="file" id="avatarInput" accept="image/*" aria-label="Cambiar foto de perfil">
          </label>
        </div>
        <div class="profile-info">
          <div class="profile-username-row">
            <h1 class="profile-username" id="profileUsername">@usuario</h1>
            <div class="profile-menu-wrap" id="profileMenuWrap" hidden>
              <button class="profile-menu-btn" id="profileMenuBtn" type="button" aria-label="Más opciones" aria-expanded="false">
                <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>
              <div class="profile-menu-panel" id="profileMenuPanel" hidden></div>
            </div>
          </div>
          <p class="profile-fullname" id="profileFullname"></p>
          <p class="profile-role" id="profileRole"></p>
          <div class="profile-stats" id="profileStats"></div>
          <p class="profile-bio profile-bio-clamped" id="profileBio"></p>
          <div class="profile-links" id="profileLinks"></div>
        </div>
      </div>

      <div class="profile-actions" id="profileActions"></div>
    </div>
  </section>

  <section class="quick-actions" id="quickActionsSection">
    <div class="container">
      <div class="quick-grid" id="quickActions"></div>
    </div>
  </section>

  <section class="features" id="gymClasesSection" hidden>
    <div class="container">
      <div class="section-head reveal">
        <span class="eyebrow">Gimnasio</span>
        <h2>Clases</h2>
      </div>
      <p class="chart-sub" id="gymClasesSummary"></p>
      <div class="search-page-list" id="gymClasesList"></div>
    </div>
  </section>

  <section class="features" id="gymEntrenadoresSection" hidden>
    <div class="container">
      <div class="section-head reveal">
        <span class="eyebrow">Gimnasio</span>
        <h2>Entrenadores</h2>
      </div>
      <p class="chart-sub" id="gymEntrenadoresSummary"></p>
      <div class="search-page-list" id="gymEntrenadoresList"></div>
    </div>
  </section>

  <section class="steps" id="rutinas">
    <div class="container">
      <div class="section-head reveal">
        <span class="eyebrow" id="rutinasEyebrow">Tus rutinas</span>
        <h2 id="routinesTitle">Rutinas activas</h2>
      </div>
      <div class="routine-tabs" id="routineTabs">
        <button class="routine-tab active" data-tab="active" type="button">Activas</button>
        <button class="routine-tab" data-tab="historic" type="button">Históricas</button>
        <button class="routine-tab" data-tab="saved" type="button" id="savedTabBtn" hidden>Guardadas</button>
      </div>
      <div id="routinesContent"></div>
    </div>
  </section>

  <section class="features" id="statsSection">
    <div class="container">
      <div class="section-head reveal">
        <span class="eyebrow" id="statsEyebrow">Tu actividad</span>
      </div>
      <div class="routine-tabs" id="activityTabs">
        <button class="routine-tab" data-tab="publicaciones" type="button" id="activityPublicacionesTab" hidden>Publicaciones</button>
        <button class="routine-tab active" data-tab="stats" type="button">Estadísticas</button>
        <button class="routine-tab" data-tab="reps" type="button">Reps</button>
        <button class="routine-tab" data-tab="media" type="button">Multimedia</button>
        <button class="routine-tab" data-tab="likes" type="button">Me gusta</button>
      </div>
      <div id="statsContent"></div>
      <div class="post-feed-list post-feed-list-compact" id="activityPostsList" hidden></div>
      <div class="post-feed-sentinel" id="activityPostsSentinel" hidden><div class="modern-spinner" id="activityPostsSpinner" hidden></div></div>
    </div>
  </section>
`;

export const profileView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    // Reset de estado que en MPA nacia limpio en cada carga de pagina -- este modulo puede
    // quedar cargado en memoria mientras se navega entre varios perfiles en la misma sesion.
    myId = authUserId;
    activeRoutineTab = "active";
    activeActivityTab = "stats";
    statsDirty = false;
    routinesCtx = null;
    profileStatsCtx = null;
    activityTabsController = null;
    freqChartInstance = null;
    progressChartInstances = [];

    container.innerHTML = VIEW_MARKUP;

    setupAutoHideHeader(ctx);
    setupProfileMenuToggle(ctx);
    setupRoutineMenuOutsideClick(ctx);

    // pages/profile.html (nav "Perfil") es siempre TU perfil salvo que le pasen ?u=. La ruta
    // catch-all (gymsocial.com.ar/<username>) manda el username ya extraido en pathUsername
    // (ver routes.ts) -- 404.html llega ahi mismo via el fallback de hosting.
    usernameParam = params.get("u") ?? params.get("pathUsername");

    if (!usernameParam && !myId) {
      smartNavigate("login.html");
      return;
    }

    // Un visitante sin sesion no tiene "su" perfil al que volver, ni "por que salir", ni
    // solicitudes de seguimiento propias. Actua sobre document (no container): estos links
    // viven en el header/footer compartido, no en el contenido de esta vista.
    if (!myId) {
      document.getElementById("navPerfil")?.remove();
      document.getElementById("navSalir")?.remove();
      document.getElementById("navFollowRequests")?.remove();
      document.getElementById("footerPerfil")?.remove();
      document.getElementById("footerSalir")?.remove();
    }

    await main(ctx);
  },
  onShow() {
    document.body.classList.add("profile-page", "header-autohide");
  },
  onHide() {
    document.body.classList.remove("profile-page", "header-autohide");
  },
  update() {
    void refreshCurrentRoutinesTab();
  },
};
