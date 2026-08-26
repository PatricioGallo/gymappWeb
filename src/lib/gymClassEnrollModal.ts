import { escapeHtml } from "./dom";
import { CLASS_DAY_LABELS, classFormatTime, classImageHtml, classCapacityBadgeHtml } from "./gymClassMarkup";
import { enrollInSession, unenrollFromSession, getClassCapacityStatus, type GymClassRow, type ClassSession } from "../services/gymClass.service";

function closeOverlay(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

export interface ClassViewerCtx {
  myId: string | null;
  isActiveSocio: boolean;
  isOwner?: boolean;
}

export interface ClassDetailActions {
  onEdit?: (c: GymClassRow) => void;
  onDelete?: (c: GymClassRow) => void;
}

function instructorLineHtml(c: GymClassRow): string {
  if (!c.instructorId) return "Sin profesor asignado";
  const nombre = `${c.instructorNombre ?? ""} ${c.instructorApellido ?? ""}`.trim() || c.instructorUsername;
  return c.instructorUsername
    ? `<a href="profile.html?u=${encodeURIComponent(c.instructorUsername)}">${escapeHtml(nombre ?? "")}</a>`
    : escapeHtml(nombre ?? "");
}

/** Cada horario tiene su propio cupo, su propia lista de inscriptos y su propio boton --
 * inscribirse a un dia de la semana no inscribe a los demas dias de la misma clase, y cada uno
 * "resetea" (vuelve a habilitar inscripcion) por su cuenta despues de que ese horario puntual ya
 * paso (ver next_session_occurrence en la base). */
function sessionRowHtml(c: GymClassRow, s: ClassSession, showEnrollAction: boolean): string {
  const dayTime = `${escapeHtml(CLASS_DAY_LABELS[s.dayOfWeek])} · ${escapeHtml(classFormatTime(s.startTime))}-${escapeHtml(classFormatTime(s.endTime))}`;
  const countLine =
    c.capacity != null ? `${s.enrolledCount}/${c.capacity} ${classCapacityBadgeHtml(s.enrolledCount, c.capacity)}` : `${s.enrolledCount} inscripto${s.enrolledCount === 1 ? "" : "s"}`;

  let actionHtml = "";
  if (showEnrollAction) {
    if (s.isEnrolled) {
      actionHtml = `<button class="btn btn-outline btn-sm classSessionEnrollBtn" data-session-id="${s.id}" type="button">Cancelar inscripción</button>`;
    } else if (getClassCapacityStatus(s.enrolledCount, c.capacity) === "lleno") {
      actionHtml = `<button class="btn btn-outline btn-sm" type="button" disabled>Completo</button>`;
    } else {
      actionHtml = `<button class="btn btn-primary btn-sm classSessionEnrollBtn" data-session-id="${s.id}" type="button">Inscribirme</button>`;
    }
  }

  return `
    <li class="class-session-row">
      <div class="class-session-row-info">
        <span class="class-session-row-time">${dayTime}</span>
        <span class="class-session-row-count">${countLine}</span>
      </div>
      ${actionHtml}
    </li>
  `;
}

/** Modal compartido de detalle, usado por el slider del perfil y por la grilla-calendario de
 * clases.html. Con viewerCtx.isOwner muestra Editar/Eliminar (delega a `actions`) en vez del
 * flujo de inscripcion -- misma pieza de UI para dueño y socio, ver clases.ts. */
export function openClassDetailModal(
  classRow: GymClassRow,
  viewerCtx: ClassViewerCtx,
  onChanged?: () => void,
  actions?: ClassDetailActions
): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  let c = { ...classRow };

  function render(): void {
    const showEnrollAction = !viewerCtx.isOwner && c.allowEnrollment && viewerCtx.isActiveSocio;
    const gatedNote =
      !viewerCtx.isOwner && c.allowEnrollment && !viewerCtx.isActiveSocio
        ? `<p class="gym-class-enroll-note">Hacete socio del gimnasio para inscribirte.</p>`
        : "";
    const sessionsHtml =
      c.sessions.length === 0
        ? `<p class="chart-sub">Sin horario definido</p>`
        : `<ul class="class-detail-sessions-rows">${c.sessions.map((s) => sessionRowHtml(c, s, showEnrollAction)).join("")}</ul>`;

    loaderBody!.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card">
          ${classImageHtml(c.imageUrl, "class-detail-image")}
          <h2>${escapeHtml(c.name)}</h2>
          ${c.description ? `<p class="subtitle">${escapeHtml(c.description)}</p>` : ""}
          <p class="class-detail-instructor">Profesor <span>${instructorLineHtml(c)}</span></p>
          ${sessionsHtml}
          ${gatedNote}
          ${
            viewerCtx.isOwner
              ? `<div class="modal-actions"><button class="btn btn-primary" id="classDetailEditBtn" type="button">Editar</button><button class="btn btn-outline" id="classDetailDeleteBtn" type="button">Eliminar</button></div>`
              : ""
          }
        </div>
      </div>
    `;
    document.getElementById("classDetailEditBtn")?.addEventListener("click", () => actions?.onEdit?.(c));
    document.getElementById("classDetailDeleteBtn")?.addEventListener("click", () => actions?.onDelete?.(c));
    // Tocar el fondo oscuro (no algo adentro de .modal-card, que burbujea hasta aca) cierra el
    // modal -- mismo patron que confirmDialog.ts/mediaLightbox.ts.
    loaderBody!.querySelector(".success-check-container")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeOverlay();
    });

    loaderBody!.querySelectorAll<HTMLButtonElement>(".classSessionEnrollBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!viewerCtx.myId) return;
        const sessionId = btn.dataset.sessionId!;
        const session = c.sessions.find((s) => s.id === sessionId);
        if (!session) return;
        btn.disabled = true;
        const { error } = session.isEnrolled
          ? await unenrollFromSession(sessionId, viewerCtx.myId)
          : await enrollInSession(sessionId, c.id, viewerCtx.myId);
        if (error) {
          alert(error);
          btn.disabled = false;
          return;
        }
        c = {
          ...c,
          sessions: c.sessions.map((s) => (s.id === sessionId ? { ...s, isEnrolled: !s.isEnrolled, enrolledCount: s.enrolledCount + (s.isEnrolled ? -1 : 1) } : s)),
        };
        render();
        onChanged?.();
      });
    });
  }

  render();
}
