import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta } from "../lib/dias";
import {
  listRoutines,
  getLastTrainedDate,
  getRoutineProgressPct,
  countAssignedRoutines,
  finishRoutine,
  type RoutineWithCounts,
} from "../services/profile.service";
import {
  listSubscribers,
  removeSubscriber,
  listHistoricSubscribers,
  deleteHistoricSubscription,
  type SubscriberListRow,
  type HistoricSubscriberRow,
} from "../services/subscription.service";
import { listRecentComments, type RecentCommentRow } from "../services/comment.service";
import { renderVerifiedBadge } from "../lib/verifiedBadge";

setupNavToggle();
setupRevealObserver();
setupStudentMenuOutsideClick();
const myId = await requireAuth();

const summaryEl = document.getElementById("alumnosSummary")!;
const listEl = document.getElementById("alumnosList")!;
const tabsWrap = document.getElementById("alumnosTabs")!;
const searchForm = document.getElementById("alumnosSearchForm") as HTMLFormElement;
const searchInput = document.getElementById("alumnosSearchInput") as HTMLInputElement;

interface StudentRow extends SubscriberListRow {
  activeRoutine: RoutineWithCounts | null;
  activeRoutinePct: number;
  lastTrained: string | null;
  recentComments: RecentCommentRow[];
  assignedRoutinesCount: number;
}

type AlumnosTab = "current" | "historic";
let activeTab: AlumnosTab = "current";

const DEBOUNCE_MS = 250;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

async function loadStudent(s: SubscriberListRow): Promise<StudentRow> {
  const [activeRoutines, lastTrained, recentComments, assignedRoutinesCount] = await Promise.all([
    listRoutines(s.id, "active").catch(() => []),
    getLastTrainedDate(s.id).catch(() => null),
    listRecentComments(s.id, 3).catch(() => []),
    countAssignedRoutines(myId, s.id).catch(() => 0),
  ]);
  const activeRoutine = activeRoutines[0] ?? null;
  const activeRoutinePct = activeRoutine ? await getRoutineProgressPct(s.id, activeRoutine.totalRoutineExerciseIds).catch(() => 0) : 0;
  return { ...s, activeRoutine, activeRoutinePct, lastTrained, recentComments, assignedRoutinesCount };
}

// ---------- Menu de tuerca por alumno (Ver progreso / Asignar / Finalizar / Historicas / Cancelar) ----------

const STUDENT_MENU_GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;

function setupStudentMenuOutsideClick() {
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

function wireStudentMenus(container: HTMLElement) {
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

function studentCardMarkup(s: StudentRow): string {
  const nombreCompleto = `${s.nombre} ${s.apellido}`.trim();

  const commentsMarkup =
    s.recentComments.length === 0
      ? ""
      : `
    <div class="student-comments">
      <span class="student-comments-title">Comentarios recientes</span>
      ${s.recentComments
        .map(
          (c) => `
        <div class="student-comment-item">
          <div class="student-comment-meta">${escapeHtml(c.exerciseNombre)} · ${escapeHtml(formatFechaCorta(c.fecha))}</div>
          <p>${escapeHtml(c.comment)}</p>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  return `
    <div class="routine-card reveal student-card routine-card-has-menu" data-id="${s.id}">
      <div class="profile-menu-wrap routine-menu-wrap">
        <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${STUDENT_MENU_GEAR_ICON}</button>
        <div class="profile-menu-panel routine-menu-panel" hidden>
          <a class="profile-menu-item" href="progress.html?uid=${s.id}">Ver progreso</a>
          ${
            s.activeRoutine
              ? `<a class="profile-menu-item" href="pesos.html?rid=${s.activeRoutine.id}&uid=${s.id}">Empezar entrenamiento</a>`
              : ""
          }
          <button type="button" class="profile-menu-item assignRoutineBtn" data-id="${s.id}" data-nombre="${escapeHtml(nombreCompleto)}">Asignarle una rutina</button>
          ${
            s.activeRoutine
              ? `<button type="button" class="profile-menu-item finishActiveBtn" data-rid="${s.activeRoutine.id}" data-nombre="${escapeHtml(s.activeRoutine.nombre)}">Finalizar su rutina actual</button>`
              : ""
          }
          <button type="button" class="profile-menu-item historicRoutinesBtn" data-id="${s.id}" data-nombre="${escapeHtml(nombreCompleto)}">Rutinas históricas asignadas</button>
          <button type="button" class="profile-menu-item profile-menu-item-danger cancelSubBtn" data-id="${s.id}" data-nombre="${escapeHtml(nombreCompleto)}">Cancelar suscripción</button>
        </div>
      </div>
      <div class="student-card-head">
        <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(s.username)}">
          <img src="${escapeHtml(s.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
          <span class="search-result-body">
            <span class="search-result-name">${escapeHtml(nombreCompleto)}${renderVerifiedBadge(s.userType, s.isVerified)}</span>
            <span class="search-result-username">@${escapeHtml(s.username)}</span>
          </span>
        </a>
      </div>
      <div class="routine-stats">
        <div><span>Rutina activa</span><strong>${s.activeRoutine ? `<a href="showExc.html?rid=${s.activeRoutine.id}">${escapeHtml(s.activeRoutine.nombre)}</a>` : "Sin rutina activa"}</strong></div>
        ${
          s.activeRoutine
            ? `<div><span>Progreso rutina activa</span><strong class="mini-progress-value"><span class="mini-progress-track"><span class="mini-progress-fill" style="width:${s.activeRoutinePct}%"></span></span>${s.activeRoutinePct}%</strong></div>`
            : ""
        }
        <div><span>Último entreno</span><strong>${s.lastTrained ? escapeHtml(formatFechaCorta(s.lastTrained)) : "Nunca entrenó"}</strong></div>
        <div><span>Rutinas asignadas</span><strong>${s.assignedRoutinesCount}</strong></div>
        <div><span>Alumno desde</span><strong>${escapeHtml(formatFechaCorta(s.subscribedAt))}</strong></div>
      </div>
      ${commentsMarkup}
      ${
        s.activeRoutine
          ? ""
          : `<div class="routine-actions">
        <button class="btn btn-primary btn-sm assignRoutineBtn" data-id="${s.id}" data-nombre="${escapeHtml(nombreCompleto)}" type="button">Asignar rutina</button>
      </div>`
      }
    </div>
  `;
}

function renderCurrentList(students: StudentRow[], query: string) {
  summaryEl.textContent =
    students.length === 0
      ? query
        ? `Sin resultados para "${query}".`
        : "Todavía no tenés alumnos. Cuando alguien se suscriba y lo aceptes, va a aparecer acá."
      : `${students.length} alumno${students.length === 1 ? "" : "s"}.`;

  listEl.innerHTML = students.map(studentCardMarkup).join("");

  wireStudentMenus(listEl);

  listEl.querySelectorAll<HTMLButtonElement>(".cancelSubBtn").forEach((btn) => {
    btn.addEventListener("click", () => confirmCancelSubscription(btn.dataset.id!, btn.dataset.nombre!));
  });
  listEl.querySelectorAll<HTMLButtonElement>(".assignRoutineBtn").forEach((btn) => {
    btn.addEventListener("click", () => openAssignRoutineModal(btn.dataset.id!, btn.dataset.nombre!));
  });
  listEl.querySelectorAll<HTMLButtonElement>(".finishActiveBtn").forEach((btn) => {
    btn.addEventListener("click", () => confirmFinishActiveRoutine(btn.dataset.rid!, btn.dataset.nombre!));
  });
  listEl.querySelectorAll<HTMLButtonElement>(".historicRoutinesBtn").forEach((btn) => {
    btn.addEventListener("click", () => openHistoricRoutinesModal(btn.dataset.id!, btn.dataset.nombre!));
  });
}

function closeOverlay() {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

function confirmCancelSubscription(studentId: string, nombre: string) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Cancelar suscripción</h2>
        <p class="subtitle">${escapeHtml(nombre)} va a dejar de ser tu alumno. Va a poder volver a suscribirse cuando quiera.</p>
        <div class="modal-actions">
          <button class="btn btn-danger" id="confirmCancelSub" type="button">Cancelar suscripción</button>
          <button class="btn btn-outline" id="cancelCancelSub" type="button">Volver</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("cancelCancelSub")?.addEventListener("click", closeOverlay);
  document.getElementById("confirmCancelSub")?.addEventListener("click", async () => {
    const confirmBtn = document.getElementById("confirmCancelSub") as HTMLButtonElement;
    confirmBtn.disabled = true;
    const { error } = await removeSubscriber(myId, studentId);
    if (error) {
      alert(error);
      closeOverlay();
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
        <p>Suscripción cancelada. Pasó a Históricas.</p>
      </div>
    `;
    setTimeout(() => {
      closeOverlay();
      void runSearch(searchInput.value.trim());
    }, 1600);
  });
}

function confirmFinishActiveRoutine(routineId: string, routineNombre: string) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Finalizar rutina</h2>
        <p class="subtitle">"${escapeHtml(routineNombre)}" va a pasar a Históricas. Van a poder reactivarla desde el perfil del alumno cuando quieran.</p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="confirmFinishActive" type="button">Finalizar</button>
          <button class="btn btn-outline" id="cancelFinishActive" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("cancelFinishActive")?.addEventListener("click", closeOverlay);
  document.getElementById("confirmFinishActive")?.addEventListener("click", async () => {
    const confirmBtn = document.getElementById("confirmFinishActive") as HTMLButtonElement;
    confirmBtn.disabled = true;
    try {
      await finishRoutine(routineId);
    } catch {
      alert("No se pudo finalizar la rutina. Probá de nuevo.");
      closeOverlay();
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
      void runSearch(searchInput.value.trim());
    }, 1600);
  });
}

function templateRowMarkup(r: RoutineWithCounts): string {
  return `
    <div class="follow-request-item" data-id="${r.id}">
      <span class="follow-request-user">
        <span class="search-result-body">
          <span class="search-result-name">${escapeHtml(r.nombre)}</span>
          <span class="search-result-username">${r.semanasCount} semana${r.semanasCount === 1 ? "" : "s"} · ${r.diasPorSemana} día${r.diasPorSemana === 1 ? "" : "s"}/semana</span>
        </span>
      </span>
      <div class="follow-request-actions">
        <button class="btn btn-primary btn-sm assignTemplateBtn" data-id="${r.id}" type="button">Asignar</button>
      </div>
    </div>
  `;
}

function openAssignRoutineModal(studentId: string, nombre: string) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Asignarle una rutina a ${escapeHtml(nombre)}</h2>
        <p class="subtitle">Elegí una de tus rutinas guardadas. Se crea una rutina nueva para ${escapeHtml(nombre)}; la plantilla queda igual para volver a usarla.</p>
        <div id="assignRoutineModalBody"><p class="chart-sub">Cargando tus rutinas guardadas...</p></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="assignRoutineCancel">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("assignRoutineCancel")?.addEventListener("click", closeOverlay);

  const bodyEl = document.getElementById("assignRoutineModalBody");
  if (!bodyEl) return;

  void (async () => {
    const templates = await listRoutines(myId, "saved").catch(() => []);
    bodyEl.innerHTML =
      templates.length === 0
        ? `<p class="chart-sub">Todavía no tenés rutinas guardadas. Creá una plantilla desde tu perfil, pestaña "Guardadas".</p>`
        : templates.map(templateRowMarkup).join("");
    bodyEl.querySelectorAll<HTMLButtonElement>(".assignTemplateBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.href = `rutinsView.html?uid=${encodeURIComponent(studentId)}&cloneFrom=${encodeURIComponent(btn.dataset.id!)}`;
      });
    });
  })();
}

function historicRoutineRowMarkup(r: RoutineWithCounts, studentId: string, canReassign: boolean): string {
  return `
    <div class="follow-request-item" data-id="${r.id}">
      <span class="follow-request-user">
        <span class="search-result-body">
          <span class="search-result-name">${escapeHtml(r.nombre)}</span>
          <span class="search-result-username">Finalizada el ${r.finalizada_at ? escapeHtml(formatFechaCorta(r.finalizada_at)) : "—"}</span>
        </span>
      </span>
      <div class="follow-request-actions">
        <a class="btn btn-outline btn-sm" href="showExc.html?rid=${r.id}">Mostrar</a>
        ${
          canReassign
            ? `<button class="btn btn-primary btn-sm reassignHistoricBtn" data-id="${r.id}" data-uid="${studentId}" type="button">Volver a asignar</button>`
            : ""
        }
      </div>
    </div>
  `;
}

// canReassign: solo tiene sentido si el alumno sigue siendo suscriptor aceptado
// hoy -- create_routine exige esa relacion para poder asignar. Para un ex
// alumno (pestaña Historicas) el modal es de solo lectura.
function openHistoricRoutinesModal(studentId: string, nombre: string, canReassign = true) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Rutinas históricas de ${escapeHtml(nombre)}</h2>
        <p class="subtitle">${canReassign ? "Rutinas que le asignaste y ya finalizó. Podés volver a asignarle cualquiera." : "Rutinas que le asignaste mientras fue tu alumno."}</p>
        <div id="historicRoutinesModalBody"><p class="chart-sub">Cargando...</p></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="historicRoutinesCancel">Cerrar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("historicRoutinesCancel")?.addEventListener("click", closeOverlay);

  const bodyEl = document.getElementById("historicRoutinesModalBody");
  if (!bodyEl) return;

  void (async () => {
    const historic = await listRoutines(studentId, "historic").catch(() => []);
    const assignedByMe = historic.filter((r) => r.assigned_by === myId);
    bodyEl.innerHTML =
      assignedByMe.length === 0
        ? `<p class="chart-sub">Todavía no le asignaste ninguna rutina que haya finalizado.</p>`
        : assignedByMe.map((r) => historicRoutineRowMarkup(r, studentId, canReassign)).join("");
    bodyEl.querySelectorAll<HTMLButtonElement>(".reassignHistoricBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.href = `rutinsView.html?uid=${encodeURIComponent(btn.dataset.uid!)}&cloneFrom=${encodeURIComponent(btn.dataset.id!)}`;
      });
    });
  })();
}

// ---------- Pestaña Historicas: ex alumnos, solo datos basicos + ver rutinas/eliminar ----------

function historicStudentCardMarkup(s: HistoricSubscriberRow): string {
  const nombreCompleto = `${s.nombre} ${s.apellido}`.trim();

  return `
    <div class="routine-card reveal student-card is-historic routine-card-has-menu" data-id="${s.id}">
      <div class="profile-menu-wrap routine-menu-wrap">
        <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${STUDENT_MENU_GEAR_ICON}</button>
        <div class="profile-menu-panel routine-menu-panel" hidden>
          <button type="button" class="profile-menu-item historicRoutinesBtn" data-id="${s.id}" data-nombre="${escapeHtml(nombreCompleto)}">Ver rutinas históricas</button>
          <button type="button" class="profile-menu-item profile-menu-item-danger deleteHistoricBtn" data-id="${s.id}" data-nombre="${escapeHtml(nombreCompleto)}">Eliminar</button>
        </div>
      </div>
      <div class="student-card-head">
        <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(s.username)}">
          <img src="${escapeHtml(s.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
          <span class="search-result-body">
            <span class="search-result-name">${escapeHtml(nombreCompleto)}${renderVerifiedBadge(s.userType, s.isVerified)}</span>
            <span class="search-result-username">@${escapeHtml(s.username)}</span>
          </span>
        </a>
      </div>
      <div class="routine-stats">
        <div><span>Alumno desde</span><strong>${escapeHtml(formatFechaCorta(s.subscribedAt))}</strong></div>
        <div><span>Finalizó</span><strong>${escapeHtml(formatFechaCorta(s.endedAt))}</strong></div>
      </div>
    </div>
  `;
}

function renderHistoricList(students: HistoricSubscriberRow[], query: string) {
  summaryEl.textContent =
    students.length === 0
      ? query
        ? `Sin resultados para "${query}".`
        : "Todavía no tenés alumnos históricos. Cuando termine una suscripción, va a aparecer acá."
      : `${students.length} ex alumno${students.length === 1 ? "" : "s"}.`;

  listEl.innerHTML = students.map(historicStudentCardMarkup).join("");

  wireStudentMenus(listEl);

  listEl.querySelectorAll<HTMLButtonElement>(".historicRoutinesBtn").forEach((btn) => {
    btn.addEventListener("click", () => openHistoricRoutinesModal(btn.dataset.id!, btn.dataset.nombre!, false));
  });
  listEl.querySelectorAll<HTMLButtonElement>(".deleteHistoricBtn").forEach((btn) => {
    btn.addEventListener("click", () => confirmDeleteHistoricStudent(btn.dataset.id!, btn.dataset.nombre!));
  });
}

function confirmDeleteHistoricStudent(studentId: string, nombre: string) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Eliminar del historial</h2>
        <p class="subtitle">Se borra el registro de ${escapeHtml(nombre)} como ex alumno. Si vuelve a suscribirse más adelante, va a quedar como una relación nueva, sin la fecha de alta original.</p>
        <div class="modal-actions">
          <button class="btn btn-danger" id="confirmDeleteHistoric" type="button">Eliminar</button>
          <button class="btn btn-outline" id="cancelDeleteHistoric" type="button">Volver</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("cancelDeleteHistoric")?.addEventListener("click", closeOverlay);
  document.getElementById("confirmDeleteHistoric")?.addEventListener("click", async () => {
    const { error } = await deleteHistoricSubscription(myId, studentId);
    if (error) {
      alert(error);
      closeOverlay();
      return;
    }
    closeOverlay();
    void runSearch(searchInput.value.trim());
  });
}

async function runSearch(query: string) {
  const myRequestId = ++requestId;
  summaryEl.textContent = "Cargando...";
  try {
    if (activeTab === "current") {
      const subscribers = await listSubscribers(myId, query);
      const students = await Promise.all(subscribers.map(loadStudent));
      if (myRequestId !== requestId) return;
      renderCurrentList(students, query);
    } else {
      const historic = await listHistoricSubscribers(myId, query);
      if (myRequestId !== requestId) return;
      renderHistoricList(historic, query);
    }
  } catch {
    if (myRequestId !== requestId) return;
    summaryEl.textContent = "No se pudo cargar la lista. Probá de nuevo.";
    listEl.innerHTML = "";
  }
}

tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab as AlumnosTab;
    if (tab === activeTab) return;
    activeTab = tab;
    tabsWrap.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
    searchInput.value = "";
    void runSearch("");
  });
});

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void runSearch(searchInput.value.trim()), DEBOUNCE_MS);
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(debounceTimer);
  void runSearch(searchInput.value.trim());
});

void runSearch("");
