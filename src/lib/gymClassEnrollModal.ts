import { escapeHtml } from "./dom";
import { CLASS_DAY_LABELS, classFormatTime, classImageHtml, classCapacityBadgeHtml } from "./gymClassMarkup";
import { enrollInClass, unenrollFromClass, getClassCapacityStatus, type GymClassRow } from "../services/gymClass.service";

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

function sessionsListHtml(c: GymClassRow): string {
  if (c.sessions.length === 0) return `<p class="chart-sub">Sin horario definido</p>`;
  return `<ul class="class-detail-sessions">${c.sessions
    .map((s) => `<li>${escapeHtml(CLASS_DAY_LABELS[s.dayOfWeek])} · ${escapeHtml(classFormatTime(s.startTime))}-${escapeHtml(classFormatTime(s.endTime))}</li>`)
    .join("")}</ul>`;
}

function instructorLineHtml(c: GymClassRow): string {
  if (!c.instructorId) return "Sin profesor asignado";
  const nombre = `${c.instructorNombre ?? ""} ${c.instructorApellido ?? ""}`.trim() || c.instructorUsername;
  return c.instructorUsername
    ? `<a href="profile.html?u=${encodeURIComponent(c.instructorUsername)}">${escapeHtml(nombre ?? "")}</a>`
    : escapeHtml(nombre ?? "");
}

function actionAreaHtml(c: GymClassRow, ctx: ClassViewerCtx): string {
  if (ctx.isOwner) {
    return `<div class="modal-actions"><button class="btn btn-primary" id="classDetailEditBtn" type="button">Editar</button><button class="btn btn-outline" id="classDetailDeleteBtn" type="button">Eliminar</button></div>`;
  }
  if (!c.allowEnrollment) return "";
  if (!ctx.isActiveSocio) return `<p class="gym-class-enroll-note">Hacete socio del gimnasio para inscribirte.</p>`;
  if (c.isEnrolled) {
    return `<div class="modal-actions"><button class="btn btn-outline" id="classDetailEnrollBtn" type="button">Cancelar inscripción</button></div>`;
  }
  if (getClassCapacityStatus(c.enrolledCount, c.capacity) === "lleno") {
    return `<div class="modal-actions"><button class="btn btn-outline" type="button" disabled>Clase llena</button></div>`;
  }
  return `<div class="modal-actions"><button class="btn btn-primary" id="classDetailEnrollBtn" type="button">Inscribirme</button></div>`;
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
    loaderBody!.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card">
          ${classImageHtml(c.imageUrl, "class-detail-image")}
          <h2>${escapeHtml(c.name)}</h2>
          ${c.description ? `<p class="subtitle">${escapeHtml(c.description)}</p>` : ""}
          <p class="chart-sub">Profesor: ${instructorLineHtml(c)}</p>
          ${sessionsListHtml(c)}
          <p class="chart-sub">${c.enrolledCount} inscripto${c.enrolledCount === 1 ? "" : "s"}${c.capacity != null ? ` de ${c.capacity}` : ""} ${classCapacityBadgeHtml(c.enrolledCount, c.capacity)}</p>
          ${actionAreaHtml(c, viewerCtx)}
          <div class="modal-actions"><button class="btn btn-outline" id="classDetailClose" type="button">Cerrar</button></div>
        </div>
      </div>
    `;
    document.getElementById("classDetailClose")?.addEventListener("click", closeOverlay);
    document.getElementById("classDetailEditBtn")?.addEventListener("click", () => actions?.onEdit?.(c));
    document.getElementById("classDetailDeleteBtn")?.addEventListener("click", () => actions?.onDelete?.(c));

    const enrollBtn = document.getElementById("classDetailEnrollBtn") as HTMLButtonElement | null;
    enrollBtn?.addEventListener("click", async () => {
      if (!viewerCtx.myId) return;
      enrollBtn.disabled = true;
      const { error } = c.isEnrolled
        ? await unenrollFromClass(c.id, viewerCtx.myId)
        : await enrollInClass(c.id, viewerCtx.myId);
      if (error) {
        alert(error);
        enrollBtn.disabled = false;
        return;
      }
      c = { ...c, isEnrolled: !c.isEnrolled, enrolledCount: c.enrolledCount + (c.isEnrolled ? -1 : 1) };
      render();
      onChanged?.();
    });
  }

  render();
}
