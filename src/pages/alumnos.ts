import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta } from "../lib/dias";
import { listRoutines, getLastTrainedDate, type RoutineWithCounts } from "../services/profile.service";
import { listSubscribers, removeSubscriber, type SubscriberListRow } from "../services/subscription.service";
import { listRecentComments, type RecentCommentRow } from "../services/comment.service";
import { renderVerifiedBadge } from "../lib/verifiedBadge";

setupNavToggle();
setupRevealObserver();
const myId = await requireAuth();

const summaryEl = document.getElementById("alumnosSummary")!;
const listEl = document.getElementById("alumnosList")!;
const searchForm = document.getElementById("alumnosSearchForm") as HTMLFormElement;
const searchInput = document.getElementById("alumnosSearchInput") as HTMLInputElement;

interface StudentRow extends SubscriberListRow {
  activeRoutine: RoutineWithCounts | null;
  lastTrained: string | null;
  recentComments: RecentCommentRow[];
}

const DEBOUNCE_MS = 250;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

async function loadStudent(s: SubscriberListRow): Promise<StudentRow> {
  const [activeRoutines, lastTrained, recentComments] = await Promise.all([
    listRoutines(s.id, "active").catch(() => []),
    getLastTrainedDate(s.id).catch(() => null),
    listRecentComments(s.id, 3).catch(() => []),
  ]);
  return { ...s, activeRoutine: activeRoutines[0] ?? null, lastTrained, recentComments };
}

function studentCardMarkup(s: StudentRow): string {
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
    <div class="routine-card reveal student-card" data-id="${s.id}">
      <div class="student-card-head">
        <a class="follow-request-user" href="profile.html?u=${encodeURIComponent(s.username)}">
          <img src="${escapeHtml(s.avatarUrl || "/images/avatars/default.svg")}" alt="" class="search-result-avatar">
          <span class="search-result-body">
            <span class="search-result-name">${escapeHtml(`${s.nombre} ${s.apellido}`.trim())}${renderVerifiedBadge(s.userType, s.isVerified)}</span>
            <span class="search-result-username">@${escapeHtml(s.username)}</span>
          </span>
        </a>
      </div>
      <div class="routine-stats">
        <div><span>Rutina activa</span><strong>${s.activeRoutine ? `<a href="showExc.html?rid=${s.activeRoutine.id}">${escapeHtml(s.activeRoutine.nombre)}</a>` : "Sin rutina activa"}</strong></div>
        <div><span>Último entreno</span><strong>${s.lastTrained ? escapeHtml(formatFechaCorta(s.lastTrained)) : "Nunca entrenó"}</strong></div>
      </div>
      ${commentsMarkup}
      <div class="routine-actions">
        ${
          s.activeRoutine
            ? `<button class="btn btn-primary btn-sm logWeightsBtn" data-rid="${s.activeRoutine.id}" data-uid="${s.id}" type="button">Cargar pesos</button>`
            : `<button class="btn btn-primary btn-sm" type="button" disabled title="Este alumno todavía no tiene una rutina activa">Cargar pesos</button>`
        }
        <a class="btn btn-outline btn-sm" href="progress.html?uid=${s.id}">Ver progreso</a>
        <button class="btn btn-danger btn-sm cancelSubBtn" data-id="${s.id}" data-nombre="${escapeHtml(`${s.nombre} ${s.apellido}`.trim())}" type="button">Cancelar suscripción</button>
      </div>
    </div>
  `;
}

function renderList(students: StudentRow[], query: string) {
  summaryEl.textContent =
    students.length === 0
      ? query
        ? `Sin resultados para "${query}".`
        : "Todavía no tenés alumnos. Cuando alguien se suscriba y lo aceptes, va a aparecer acá."
      : `${students.length} alumno${students.length === 1 ? "" : "s"}.`;

  listEl.innerHTML = students.map(studentCardMarkup).join("");

  listEl.querySelectorAll<HTMLButtonElement>(".logWeightsBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `pesos.html?rid=${encodeURIComponent(btn.dataset.rid!)}&uid=${encodeURIComponent(btn.dataset.uid!)}`;
    });
  });
  listEl.querySelectorAll<HTMLButtonElement>(".cancelSubBtn").forEach((btn) => {
    btn.addEventListener("click", () => confirmCancelSubscription(btn.dataset.id!, btn.dataset.nombre!));
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
    const { error } = await removeSubscriber(myId, studentId);
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
    const subscribers = await listSubscribers(myId, query);
    const students = await Promise.all(subscribers.map(loadStudent));
    if (myRequestId !== requestId) return;
    renderList(students, query);
  } catch {
    if (myRequestId !== requestId) return;
    summaryEl.textContent = "No se pudo cargar la lista. Probá de nuevo.";
    listEl.innerHTML = "";
  }
}

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
