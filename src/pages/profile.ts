import { setupNavToggle, setupRevealObserver } from "../lib/nav";
import { supabase } from "../lib/supabaseClient";
import { escapeHtml } from "../lib/dom";
import { diaLabel, formatFechaCorta } from "../lib/dias";
import { calcularEdad } from "../lib/age";
import { COUNTRIES } from "../lib/countries";
import {
  getProfile,
  getProfileByUsername,
  getProfileBasicByUsername,
  updateProfileFields,
  updateEmail,
  updatePassword,
  uploadAvatar,
  listRoutines,
  finishRoutine,
  reactivateRoutine,
  listWeightLogsWithContext,
  type Profile,
  type ProfileBasic,
  type RoutineWithCounts,
  type WeightLogEntry,
} from "../services/profile.service";

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

// Un visitante sin sesion no tiene "su" perfil al que volver ni por que "salir".
if (!myId) {
  document.getElementById("navPerfil")?.remove();
  document.getElementById("navSalir")?.remove();
  document.getElementById("footerPerfil")?.remove();
  document.getElementById("footerSalir")?.remove();
}

const USER_TYPE_LABELS: Record<string, string> = {
  admin: "Admin",
  gimnasio: "Gimnasio",
  entrenador: "Entrenador",
  usuario: "Usuario",
};

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

function renderProfileBadges(profile: Profile | ProfileBasic) {
  const badges = document.getElementById("profileBadges");
  if (!badges) return;
  badges.innerHTML = `
    <span class="profile-badge">${escapeHtml(USER_TYPE_LABELS[profile.user_type ?? "usuario"] ?? "Usuario")}</span>
    <span class="profile-badge">${calcularEdad(profile.fecha_nacimiento!)} años</span>
    ${profile.nacionalidad ? `<span class="profile-badge">${escapeHtml(profile.nacionalidad)}</span>` : ""}
    <span class="profile-badge">@${escapeHtml(profile.username ?? "")}</span>
  `;
}

function renderBasicBadges(profile: ProfileBasic) {
  const badges = document.getElementById("profileBadges");
  if (!badges) return;
  badges.innerHTML = `
    <span class="profile-badge">${calcularEdad(profile.fecha_nacimiento!)} años</span>
    <span class="profile-badge">@${escapeHtml(profile.username ?? "")}</span>
  `;
}

function renderProfileActions(username: string, ownerView: boolean, viewerLoggedIn: boolean) {
  const actions = document.getElementById("profileActions");
  if (!actions) return;
  actions.innerHTML = `
    <button class="btn btn-outline" id="shareBtn" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5"/></svg>
      Compartir perfil
    </button>
    ${ownerView || !viewerLoggedIn ? "" : `<button class="btn btn-primary" id="addFriendBtn" type="button">+ Seguir</button>`}
  `;
  initShare(username);
  if (!ownerView && viewerLoggedIn) {
    const btn = document.getElementById("addFriendBtn");
    btn?.addEventListener("click", () => {
      btn.textContent = "Función en camino";
      setTimeout(() => {
        btn.textContent = "+ Seguir";
      }, 2000);
    });
  }
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

// ---------- Configuracion (owner) ----------

function configMenu(profile: Profile) {
  const config = document.getElementById("config");
  if (!config) return;

  config.addEventListener("click", (e) => {
    e.preventDefault();
    const loaderBody = document.getElementById("loaderBody");
    if (!loaderBody) return;
    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card">
          <h2>Configuración</h2>
          <p class="subtitle">Dejá vacío lo que no quieras cambiar.</p>
          <div class="field"><label for="userName">Nombre</label><input type="text" placeholder="${escapeHtml(profile.nombre)}" id="userName"></div>
          <div class="field"><label for="sname">Apellido</label><input type="text" placeholder="${escapeHtml(profile.apellido)}" id="sname"></div>
          <div class="field"><label for="birthdateField">Fecha de nacimiento</label><input type="date" id="birthdateField" value="${profile.fecha_nacimiento}"></div>
          <div class="field">
            <label for="nationalityField">Nacionalidad</label>
            <select id="nationalityField">
              ${COUNTRIES.map((country) => `<option value="${escapeHtml(country)}" ${country === profile.nacionalidad ? "selected" : ""}>${escapeHtml(country)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="visibilityField">Visibilidad del perfil</label>
            <select id="visibilityField">
              <option value="true" ${profile.is_public ? "selected" : ""}>Público (se ven tus rutinas y estadísticas)</option>
              <option value="false" ${!profile.is_public ? "selected" : ""}>Privado (solo se ve tu información básica)</option>
            </select>
          </div>
          <div class="field"><label for="mailField">Mail</label><input type="email" placeholder="${escapeHtml(profile.email)}" id="mailField"></div>
          <div class="field"><label for="pswd">Contraseña nueva</label><input type="password" placeholder="••••••••••••" id="pswd"></div>
          <div class="alert_message" id="configAlert"></div>
          <div class="modal-actions">
            <button class="btn btn-primary" id="saveChanges">Guardar</button>
            <button class="btn btn-outline" id="closeConfig">Cerrar</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("closeConfig")?.addEventListener("click", closeOverlay);
    document.getElementById("saveChanges")?.addEventListener("click", async () => {
      const alertBox = document.getElementById("configAlert")!;
      alertBox.innerHTML = "";

      const nombre = (document.getElementById("userName") as HTMLInputElement).value.trim();
      const apellido = (document.getElementById("sname") as HTMLInputElement).value.trim();
      const fechaNacimiento = (document.getElementById("birthdateField") as HTMLInputElement).value;
      const nacionalidad = (document.getElementById("nationalityField") as HTMLSelectElement).value;
      const isPublic = (document.getElementById("visibilityField") as HTMLSelectElement).value === "true";
      const mail = (document.getElementById("mailField") as HTMLInputElement).value.trim();
      const pass = (document.getElementById("pswd") as HTMLInputElement).value;

      if (
        !nombre &&
        !apellido &&
        !mail &&
        !pass &&
        fechaNacimiento === profile.fecha_nacimiento &&
        nacionalidad === profile.nacionalidad &&
        isPublic === profile.is_public
      ) {
        alertBox.innerHTML = "<p>Ingresá al menos un valor para cambiar.</p>";
        return;
      }

      const fields: Partial<Pick<Profile, "nombre" | "apellido" | "fecha_nacimiento" | "nacionalidad" | "is_public">> = {};
      if (nombre) {
        if (nombre.length < 2 || !Number.isNaN(Number(nombre))) {
          alertBox.innerHTML = "<p>Ingresaste un nombre incorrecto.</p>";
          return;
        }
        fields.nombre = nombre;
      }
      if (apellido) {
        if (apellido.length < 2 || !Number.isNaN(Number(apellido))) {
          alertBox.innerHTML = "<p>Ingresaste un apellido incorrecto.</p>";
          return;
        }
        fields.apellido = apellido;
      }
      if (fechaNacimiento && fechaNacimiento !== profile.fecha_nacimiento) {
        if (calcularEdad(fechaNacimiento) < 12 || calcularEdad(fechaNacimiento) > 100) {
          alertBox.innerHTML = "<p>Ingresaste una fecha de nacimiento incorrecta.</p>";
          return;
        }
        fields.fecha_nacimiento = fechaNacimiento;
      }
      if (nacionalidad && nacionalidad !== profile.nacionalidad) {
        fields.nacionalidad = nacionalidad;
      }
      if (isPublic !== profile.is_public) {
        fields.is_public = isPublic;
      }

      try {
        if (Object.keys(fields).length > 0) await updateProfileFields(profile.id, fields);
        if (mail) {
          const { error } = await updateEmail(mail);
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
        }
        if (pass) {
          const { error } = await updatePassword(pass);
          if (error) {
            alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
        }
      } catch {
        alertBox.innerHTML = "<p>Error al guardar cambios.</p>";
        return;
      }

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
          <p>¡Cambios guardados con éxito! Espere será redirigido.</p>
        </div>
      `;
      setTimeout(() => window.location.reload(), 2000);
    });
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
    const profileName = document.getElementById("profileName");
    if (profileName) profileName.textContent = "Este perfil no existe";
    return;
  }

  const isOwner = displayProfile.id === myId;
  const nombre = displayProfile.nombre ?? "Este usuario";

  const profileName = document.getElementById("profileName");
  if (profileName) {
    profileName.textContent = isOwner ? `Hola, ${escapeHtml(nombre)}` : `${escapeHtml(nombre)} ${escapeHtml(displayProfile.apellido ?? "")}`;
  }

  if (!isOwner) {
    document.getElementById("avatarEditWrap")?.remove();
    document.getElementById("config")?.remove();
    document.getElementById("adminLink")?.remove();
  } else if (profile && profile.user_type !== "admin") {
    document.getElementById("adminLink")?.remove();
  }

  const avatarImg = document.getElementById("avatarImg") as HTMLImageElement | null;
  if (avatarImg && displayProfile.avatar_url) avatarImg.src = displayProfile.avatar_url;
  if (isOwner && profile) initAvatar(profile);

  renderProfileActions(displayProfile.username ?? "", isOwner, myId !== null);

  const isPrivateForViewer = !profile && !basicProfile?.is_public;

  if (isPrivateForViewer) {
    renderBasicBadges(basicProfile!);
    renderPrivateNotice(nombre);
    return;
  }

  // El resto de la pagina habla en tercera persona cuando no es el dueño.
  const statsEyebrow = document.getElementById("statsEyebrow");
  const statsSubtitle = document.getElementById("statsSubtitle");
  const rutinasEyebrow = document.getElementById("rutinasEyebrow");
  if (!isOwner) {
    if (statsEyebrow) statsEyebrow.textContent = "Su actividad";
    if (statsSubtitle) statsSubtitle.textContent = `Un resumen de cómo entrena ${nombre}.`;
    if (rutinasEyebrow) rutinasEyebrow.textContent = `Rutinas de ${nombre}`;
  }

  renderProfileBadges(displayProfile);
  if (isOwner) {
    renderQuickActions(displayProfile.id!);
  } else {
    document.getElementById("quickActionsSection")?.remove();
  }

  const logs = await listWeightLogsWithContext(displayProfile.id!);
  const activeCount = await renderRoutines(displayProfile.id!, isOwner, logs);
  renderStats(logs, activeCount ?? 0, isOwner);

  if (isOwner && profile) configMenu(profile);
}

main();
