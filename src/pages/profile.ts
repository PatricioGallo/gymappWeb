import { setupNavToggle, setupRevealObserver } from "../lib/nav";
import { supabase } from "../lib/supabaseClient";
import { escapeHtml } from "../lib/dom";
import { diaLabel, formatFechaCorta } from "../lib/dias";
import {
  getProfile,
  getProfileByUsername,
  getProfileBasicByUsername,
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
import { getFollowStatus, getFollowCounts, followUser, unfollowOrCancel, type FollowStatus } from "../services/follow.service";
import { renderVerifiedBadge } from "../lib/verifiedBadge";

declare const Chart: any;

setupNavToggle();
setupRevealObserver();

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
  if (!avatarInput || !avatarImg) return;

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    const { url, error } = await uploadAvatar(profile.id, file);
    if (error) {
      alert(error);
      avatarInput.value = "";
      return;
    }
    if (url) avatarImg.src = url;
  });
}

// ---------- Compartir perfil ----------

function initShare(username: string) {
  const shareBtn = document.getElementById("shareBtn");
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

// ---------- Identidad, estadisticas, bio y enlaces ----------

function renderProfileIdentity(username: string, nombre: string, apellido: string, userType: Profile["user_type"], isVerified: boolean) {
  const usernameEl = document.getElementById("profileUsername");
  if (usernameEl) usernameEl.innerHTML = `@${escapeHtml(username)}${renderVerifiedBadge(userType, isVerified, 20)}`;
  const fullnameEl = document.getElementById("profileFullname");
  if (fullnameEl) fullnameEl.textContent = `${nombre} ${apellido}`.trim();
}

async function renderProfileStats(userId: string, username: string, canViewLists: boolean) {
  const stats = document.getElementById("profileStats");
  if (!stats) return;
  // Publicaciones todavia no existe (llega con el feed de la red social): se
  // muestra en 0 hasta que se sume ese sistema. Seguidores/seguidos si son reales.
  const counts = await getFollowCounts(userId).catch(() => ({ followers: 0, following: 0 }));
  const u = encodeURIComponent(username);

  function stat(count: number, label: string, tab: "followers" | "following"): string {
    const inner = `<strong>${count}</strong> ${label}`;
    return canViewLists ? `<a class="profile-stat" href="followers.html?u=${u}&tab=${tab}">${inner}</a>` : `<span class="profile-stat">${inner}</span>`;
  }

  stats.innerHTML = `
    <span class="profile-stat"><strong>0</strong> publicaciones</span>
    ${stat(counts.followers, "seguidores", "followers")}
    ${stat(counts.following, "seguidos", "following")}
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
}

function renderProfileLinks(links: ProfileLink[]) {
  const linksEl = document.getElementById("profileLinks");
  if (!linksEl) return;
  if (links.length === 0) {
    linksEl.remove();
    return;
  }
  linksEl.innerHTML = links
    .map(
      (l) => `
    <a class="profile-link-chip" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer nofollow">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      ${escapeHtml(l.label)}
    </a>`
    )
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

async function renderProfileActions(targetId: string, username: string, ownerView: boolean, viewerLoggedIn: boolean): Promise<FollowStatus> {
  const actions = document.getElementById("profileActions");
  const showFollowBtn = !ownerView && viewerLoggedIn;
  const followStatus: FollowStatus = showFollowBtn ? await getFollowStatus(targetId).catch(() => "none" as FollowStatus) : "none";
  if (!actions) return followStatus;

  actions.innerHTML = `
    ${ownerView ? `<a class="btn btn-outline" href="/pages/settings.html">Editar perfil</a>` : ""}
    <button class="btn btn-outline" id="shareBtn" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5"/></svg>
      Compartir perfil
    </button>
    ${showFollowBtn ? `<button class="btn ${followStatus === "none" ? "btn-primary" : "btn-outline"}" id="followBtn" type="button">${followButtonLabel(followStatus)}</button>` : ""}
  `;
  initShare(username);
  if (showFollowBtn) initFollowButton(targetId, followStatus);
  return followStatus;
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
function renderQuickActions(userId: string) {
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
      <div class="stat-card reveal"><div class="label">Rutinas activas</div><div class="value">${activeRoutinesCount}</div></div>
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

let activeRoutineTab: "active" | "historic" = "active";

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

async function renderRoutines(userId: string, ownerView: boolean, logs: WeightLogEntry[]) {
  const routinesContent = document.getElementById("routinesContent");
  const routinesTitle = document.getElementById("routinesTitle");
  const tabsWrap = document.getElementById("routineTabs");
  if (!routinesContent) return;

  // Las historicas son algo personal: un visitante solo ve las activas, sin
  // pestaña para cambiar.
  if (!ownerView) {
    activeRoutineTab = "active";
    tabsWrap?.remove();
  } else if (tabsWrap) {
    tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === activeRoutineTab);
      btn.onclick = () => {
        activeRoutineTab = btn.dataset.tab as "active" | "historic";
        renderRoutines(userId, ownerView, logs);
      };
    });
  }
  if (routinesTitle) routinesTitle.textContent = activeRoutineTab === "active" ? "Rutinas activas" : "Rutinas históricas";

  const routines = await listRoutines(userId, activeRoutineTab === "active");

  if (activeRoutineTab === "active") {
    renderActiveRoutines(routines, ownerView, routinesContent, logs);
  } else {
    renderHistoricRoutines(routines, ownerView, routinesContent, logs);
  }
  return routines.length;
}

function renderActiveRoutines(routines: RoutineWithCounts[], ownerView: boolean, container: HTMLElement, logs: WeightLogEntry[]) {
  if (routines.length === 0) {
    container.innerHTML = ownerView
      ? `<div class="empty-state reveal"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div><h3>Todavía no tenés rutinas activas</h3><p>Creá tu primera rutina para empezar a entrenar con Gym Social.</p><a href="/pages/rutinsView.html" class="btn btn-primary btn-sm">Crear nueva rutina</a></div>`
      : `<div class="empty-state reveal"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div><h3>Todavía no tiene rutinas activas</h3><p>Este usuario no cargó ninguna rutina por ahora.</p></div>`;
    return;
  }

  container.innerHTML = routines
    .map((r) => {
      const actions = ownerView
        ? `<button class="btn btn-primary btn-sm addPeso" data-id="${r.id}">Entrenar hoy</button>
           <button class="btn btn-outline btn-sm showExc" data-id="${r.id}">Mostrar</button>
           <button class="btn btn-outline btn-sm modExc" data-id="${r.id}">Modificar</button>
           <button class="btn btn-success btn-sm finishRoutine" data-id="${r.id}">Finalizar</button>
           <button class="btn btn-danger btn-sm button_red" data-id="${r.id}">Eliminar</button>`
        : `<button class="btn btn-outline btn-sm showExc" data-id="${r.id}">Mostrar</button>`;

      return `
        <div class="routine-card reveal">
          <span class="routine-started-tag">Iniciada el ${escapeHtml(formatFechaCorta(r.fecha_inicio))}</span>
          <h3>${escapeHtml(r.nombre)}</h3>
          ${routineStatsMarkup(r, logs)}
          <div class="routine-actions">${actions}</div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll<HTMLButtonElement>(".showExc").forEach((btn) => {
    btn.addEventListener("click", () => (window.location.href = `showExc.html?rid=${btn.dataset.id}`));
  });
  if (!ownerView) return;

  container.querySelectorAll<HTMLButtonElement>(".modExc").forEach((btn) => {
    btn.addEventListener("click", () => (window.location.href = `excView.html?rid=${btn.dataset.id}`));
  });
  container.querySelectorAll<HTMLButtonElement>(".addPeso").forEach((btn) => {
    btn.addEventListener("click", () => (window.location.href = `pesos.html?rid=${btn.dataset.id}`));
  });
  container.querySelectorAll<HTMLButtonElement>(".button_red").forEach((btn) => {
    btn.addEventListener("click", () => (window.location.href = `deleteRutins.html?rid=${btn.dataset.id}`));
  });
  container.querySelectorAll<HTMLButtonElement>(".finishRoutine").forEach((btn) => {
    btn.addEventListener("click", () => confirmFinishRoutine(btn.dataset.id!, routines.find((r) => r.id === btn.dataset.id)!));
  });
}

function renderHistoricRoutines(routines: RoutineWithCounts[], ownerView: boolean, container: HTMLElement, logs: WeightLogEntry[]) {
  if (routines.length === 0) {
    container.innerHTML = ownerView
      ? `<div class="empty-state reveal"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div><h3>Todavía no tenés rutinas históricas</h3><p>Cuando finalices una rutina activa, va a aparecer acá.</p></div>`
      : `<div class="empty-state reveal"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div><h3>Este usuario no tiene rutinas históricas</h3><p>Todavía no finalizó ninguna rutina.</p></div>`;
    return;
  }

  container.innerHTML = routines
    .map((r) => {
      const actions = ownerView
        ? `<button class="btn btn-outline btn-sm showExcHist" data-id="${r.id}">Mostrar</button>
           <button class="btn btn-primary btn-sm reactivateRoutine" data-id="${r.id}">Reactivar</button>`
        : `<button class="btn btn-outline btn-sm showExcHist" data-id="${r.id}">Mostrar</button>`;

      return `
        <div class="routine-card is-historic reveal">
          ${r.finalizada_at ? `<span class="routine-finished-tag">Finalizada el ${escapeHtml(formatFechaCorta(r.finalizada_at))}</span>` : ""}
          <h3>${escapeHtml(r.nombre)}</h3>
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

  container.querySelectorAll<HTMLButtonElement>(".reactivateRoutine").forEach((btn) => {
    btn.addEventListener("click", () => openReactivateModal(btn.dataset.id!));
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
    await finishRoutine(routineId);
    activeRoutineTab = "active";
    window.location.reload();
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
    await reactivateRoutine(routineId);
    activeRoutineTab = "active";
    window.location.reload();
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

  const followStatus = await renderProfileActions(displayProfile.id!, displayProfile.username ?? "", isOwner, myId !== null);

  // Un seguidor aceptado ve el perfil completo aunque sea privado (misma logica
  // que ya usan las RLS de rutinas/pesos via is_profile_public en la base).
  const isPrivateForViewer = !profile && !basicProfile?.is_public && followStatus !== "accepted";

  // El link a seguidores/seguidos usa la misma regla: si el perfil es privado
  // para este visitante, ni siquiera se muestra clickeable (la RPC tambien lo
  // bloquea server-side, pero evitamos el link muerto).
  void renderProfileStats(displayProfile.id!, displayProfile.username ?? "", !isPrivateForViewer);

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
    renderQuickActions(displayProfile.id!);
  } else {
    document.getElementById("quickActionsSection")?.remove();
  }

  const logs = await listWeightLogsWithContext(displayProfile.id!);
  const activeCount = await renderRoutines(displayProfile.id!, isOwner, logs);
  renderStats(logs, activeCount ?? 0, isOwner);
}

main();
