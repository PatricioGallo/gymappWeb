import type { ViewModule } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { requireAuth } from "../lib/nav";
import {
  listGymClasses,
  createGymClass,
  updateGymClass,
  deleteGymClass,
  uploadClassImage,
  type GymClassRow,
  type ClassSession,
  type ClassFormInput,
} from "../services/gymClass.service";
import {
  listGymTrainers,
  getGymTrainerHandleStatus,
  type GymTrainerRow,
  type GymTrainerHandleStatus,
  type HandleInitiatedBy,
} from "../services/gymTrainer.service";
import { getGymMembershipStatus } from "../services/gymMember.service";
import { getProfileBasicByUsername } from "../services/profile.service";
import { CLASS_DAY_LABELS, CLASS_DAY_ABBR, classFormatTime, classImageHtml } from "../lib/gymClassMarkup";
import { openClassDetailModal } from "../lib/gymClassEnrollModal";

// ---------------------------------------------------------------------------
// clases.html: calendario semanal de un gimnasio, compartido por dueño y visitante.
// La diferencia entre roles es puramente de interaccion (ver mountClasesView mas abajo):
// el dueño ve "+ Nueva clase" y al tocar una clase gestiona (Editar/Eliminar) en vez de
// inscribirse -- misma pagina, mismo componente de calendario para los dos.
// ---------------------------------------------------------------------------

const CALENDAR_VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <a href="#" class="back-link" id="clasesBackLink"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Volver al perfil</a>
      <span class="eyebrow">Gimnasio</span>
      <h1 id="clasesTitle">Clases</h1>
      <p id="clasesSubtitle" hidden>Armá las clases de tu gimnasio: horarios, profesor e inscripción de socios.</p>
    </div>
  </section>
  <section class="features">
    <div class="container">
      <div class="routines-header-actions" id="clasesHeaderActions" hidden>
        <button class="btn btn-primary btn-sm" id="newClassBtn" type="button">+ Nueva clase</button>
      </div>
      <p class="chart-sub" id="clasesSummary">Cargando...</p>
      <div class="class-calendar" id="clasesCalendar" hidden>
        <div class="class-calendar-scroll">
          <div class="class-calendar-grid" id="clasesGrid"></div>
        </div>
      </div>
      <div id="clasesNoScheduleWrap" hidden>
        <h3 class="gym-subsection-title">Sin horario asignado</h3>
        <div class="search-page-list" id="clasesNoScheduleList"></div>
      </div>
    </div>
  </section>
`;

function noScheduleCardMarkup(c: GymClassRow): string {
  const instructorName = c.instructorId ? `${c.instructorNombre ?? ""} ${c.instructorApellido ?? ""}`.trim() || c.instructorUsername : null;
  return `
    <div class="routine-card reveal" data-id="${c.id}">
      ${classImageHtml(c.imageUrl)}
      <h3>${escapeHtml(c.name)}</h3>
      <div class="routine-stats">
        <div><span>Profesor</span><strong>${instructorName ? escapeHtml(instructorName) : "Sin asignar"}</strong></div>
        <div><span>Inscripción</span><strong>${c.allowEnrollment ? "Habilitada" : "Deshabilitada"}</strong></div>
      </div>
      <div class="routine-actions">
        <button type="button" class="btn btn-outline btn-sm manageClassBtn" data-id="${c.id}">Gestionar</button>
      </div>
    </div>
  `;
}

const PX_PER_HOUR = 60;
const FALLBACK_AXIS_START = 8 * 60; // 08:00
const FALLBACK_AXIS_END = 21 * 60; // 21:00

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToLabel(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

interface ClassBlock {
  classRow: GymClassRow;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  lane: number;
  laneCount: number;
}

function buildCalendarBlocks(classes: GymClassRow[]): ClassBlock[] {
  const blocks: ClassBlock[] = [];
  for (const c of classes) {
    for (const s of c.sessions) {
      blocks.push({ classRow: c, dayOfWeek: s.dayOfWeek, startMin: timeToMinutes(s.startTime), endMin: timeToMinutes(s.endTime), lane: 0, laneCount: 1 });
    }
  }
  // Asignacion de "carriles" (lanes) lado a lado por dia, greedy por orden de inicio -- el
  // algoritmo clasico de "minimo de salas de reunion". Suficiente para horarios de gimnasio
  // (pocos solapamientos), no busca minimizar carriles por cluster de solapamiento individual.
  for (let day = 0; day < 7; day++) {
    const dayBlocks = blocks.filter((b) => b.dayOfWeek === day).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const laneEnds: number[] = [];
    for (const b of dayBlocks) {
      let lane = laneEnds.findIndex((end) => end <= b.startMin);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = b.endMin;
      b.lane = lane;
    }
    const laneCount = laneEnds.length || 1;
    for (const b of dayBlocks) b.laneCount = laneCount;
  }
  return blocks;
}

function calendarGridHtml(blocks: ClassBlock[]): string {
  const allTimes = blocks.flatMap((b) => [b.startMin, b.endMin]);
  const axisStart = allTimes.length ? Math.floor((Math.min(...allTimes) - 30) / 60) * 60 : FALLBACK_AXIS_START;
  const axisEnd = allTimes.length ? Math.ceil((Math.max(...allTimes) + 30) / 60) * 60 : FALLBACK_AXIS_END;
  const totalPx = ((axisEnd - axisStart) / 60) * PX_PER_HOUR;

  const hourLabels: string[] = [];
  for (let m = axisStart; m <= axisEnd; m += 60) {
    hourLabels.push(`<span class="class-calendar-hour-label" style="top:${((m - axisStart) / 60) * PX_PER_HOUR}px">${String(Math.floor(m / 60)).padStart(2, "0")}:00</span>`);
  }

  const dayCols = CLASS_DAY_LABELS.map((_label, day) => {
    const dayBlocks = blocks.filter((b) => b.dayOfWeek === day);
    const blocksHtml = dayBlocks
      .map((b) => {
        const top = ((b.startMin - axisStart) / 60) * PX_PER_HOUR;
        const height = Math.max(((b.endMin - b.startMin) / 60) * PX_PER_HOUR, 24);
        const widthPct = 100 / b.laneCount;
        const leftPct = b.lane * widthPct;
        return `
          <button type="button" class="class-calendar-block" data-id="${b.classRow.id}"
            style="top:${top}px; height:${height}px; left:${leftPct}%; width:calc(${widthPct}% - 4px);">
            <strong>${escapeHtml(b.classRow.name)}</strong>
            <span>${minutesToLabel(b.startMin)}-${minutesToLabel(b.endMin)}</span>
          </button>`;
      })
      .join("");
    return `<div class="class-calendar-day-col" style="height:${totalPx}px">${blocksHtml}</div>`;
  }).join("");

  return `
    <div class="class-calendar-corner"></div>
    ${CLASS_DAY_LABELS.map((l) => `<div class="class-calendar-day-head">${l.slice(0, 3)}</div>`).join("")}
    <div class="class-calendar-time-axis" style="height:${totalPx}px">${hourLabels.join("")}</div>
    ${dayCols}
  `;
}

async function mountClasesView(
  container: HTMLElement,
  gymId: string,
  gymUsername: string | null,
  ctx: Parameters<ViewModule["mount"]>[2],
  authUserId: string | null,
  isOwner: boolean
): Promise<void> {
  container.innerHTML = CALENDAR_VIEW_MARKUP;

  const backLink = container.querySelector<HTMLAnchorElement>("#clasesBackLink")!;
  const titleEl = container.querySelector("#clasesTitle")!;
  const subtitleEl = container.querySelector<HTMLElement>("#clasesSubtitle")!;
  const headerActions = container.querySelector<HTMLElement>("#clasesHeaderActions")!;
  const newClassBtn = container.querySelector("#newClassBtn") as HTMLButtonElement;
  const summaryEl = container.querySelector("#clasesSummary")!;
  const calendarWrap = container.querySelector("#clasesCalendar") as HTMLElement;
  const gridEl = container.querySelector("#clasesGrid")!;
  const noScheduleWrap = container.querySelector<HTMLElement>("#clasesNoScheduleWrap")!;
  const noScheduleList = container.querySelector("#clasesNoScheduleList")!;

  backLink.href = isOwner ? "profile.html" : `profile.html?u=${encodeURIComponent(gymUsername ?? "")}`;
  titleEl.textContent = isOwner ? "Tus clases" : `Clases de ${gymUsername}`;
  if (isOwner) {
    subtitleEl.hidden = false;
    headerActions.hidden = false;
  }

  let trainers: GymTrainerRow[] = [];
  // Un entrenador que es handle activo de este gimnasio tiene los mismos beneficios que un
  // socio activo para inscribirse a clases -- ver el mismo comentario en profile.ts.
  const isActiveSocio =
    !isOwner && authUserId
      ? await Promise.all([
          getGymMembershipStatus(gymId).catch(() => "none" as const),
          getGymTrainerHandleStatus(gymId).catch(() => ({ status: "none" as GymTrainerHandleStatus, initiatedBy: null as HandleInitiatedBy })),
        ]).then(([socioStatus, handle]) => socioStatus === "active" || handle.status === "active")
      : false;

  function closeOverlay(): void {
    const loaderBody = document.getElementById("loaderBody");
    if (loaderBody) loaderBody.innerHTML = "";
  }

  async function refresh(): Promise<void> {
    summaryEl.textContent = "Cargando...";
    calendarWrap.hidden = true;
    noScheduleWrap.hidden = true;

    let classes: GymClassRow[];
    try {
      if (isOwner) {
        const [classRows, trainerRows] = await Promise.all([listGymClasses(gymId), listGymTrainers(gymId, { statusFilter: "all" })]);
        classes = classRows;
        trainers = trainerRows;
      } else {
        classes = await listGymClasses(gymId);
      }
    } catch {
      summaryEl.textContent = "No se pudieron cargar las clases. Probá de nuevo.";
      return;
    }

    if (classes.length === 0) {
      summaryEl.textContent = isOwner ? "Todavía no armaste ninguna clase." : "Este gimnasio todavía no cargó clases.";
      return;
    }

    const withSchedule = classes.filter((c) => c.sessions.length > 0);
    const withoutSchedule = isOwner ? classes.filter((c) => c.sessions.length === 0) : [];

    if (withSchedule.length > 0) {
      summaryEl.textContent = "";
      calendarWrap.hidden = false;
      const blocks = buildCalendarBlocks(withSchedule);
      gridEl.innerHTML = calendarGridHtml(blocks);
      gridEl.querySelectorAll<HTMLButtonElement>(".class-calendar-block").forEach((btn) => {
        btn.addEventListener(
          "click",
          () => {
            const c = classes.find((x) => x.id === btn.dataset.id);
            if (c) openClassDetail(c);
          },
          { signal: ctx.signal }
        );
      });
    } else {
      summaryEl.textContent = isOwner ? "" : "Todavía no se cargaron horarios para estas clases.";
    }

    if (isOwner && withoutSchedule.length > 0) {
      noScheduleWrap.hidden = false;
      noScheduleList.innerHTML = withoutSchedule.map(noScheduleCardMarkup).join("");
      noScheduleList.querySelectorAll<HTMLButtonElement>(".manageClassBtn").forEach((btn) => {
        btn.addEventListener(
          "click",
          () => {
            const c = withoutSchedule.find((x) => x.id === btn.dataset.id);
            if (c) openClassDetail(c);
          },
          { signal: ctx.signal }
        );
      });
    }
  }

  function openClassDetail(c: GymClassRow): void {
    openClassDetailModal(
      c,
      { myId: authUserId, isActiveSocio, isOwner },
      () => void refresh(),
      isOwner ? { onEdit: (row) => openClassForm(row), onDelete: (row) => confirmDeleteClass(row.id, row.name) } : undefined
    );
  }

  function confirmDeleteClass(classId: string, nombre: string): void {
    const loaderBody = document.getElementById("loaderBody");
    if (!loaderBody) return;
    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card">
          <h2>Eliminar clase</h2>
          <p class="subtitle">Se elimina "${escapeHtml(nombre)}" y las inscripciones de los socios a esta clase.</p>
          <div class="modal-actions">
            <button class="btn btn-danger" id="confirmDeleteClass" type="button">Eliminar</button>
            <button class="btn btn-outline" id="cancelDeleteClass" type="button">Volver</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("cancelDeleteClass")?.addEventListener("click", closeOverlay);
    document.getElementById("confirmDeleteClass")?.addEventListener("click", async () => {
      const { error } = await deleteGymClass(classId);
      if (error) {
        alert(error);
        closeOverlay();
        return;
      }
      closeOverlay();
      void refresh();
    });
  }

  // ---------- Form de crear/editar clase ----------

  function openClassForm(existing?: GymClassRow): void {
    const loaderBody = document.getElementById("loaderBody");
    if (!loaderBody) return;
    const isEdit = !!existing;
    let sessions: ClassSession[] = existing ? [...existing.sessions] : [];
    let imageUrl: string | null = existing?.imageUrl ?? null;
    let pendingFile: File | null = null;
    let previewObjectUrl: string | null = null;

    const instructorOptions = trainers
      .map((t) => `<option value="${t.trainerId}" ${existing?.instructorId === t.trainerId ? "selected" : ""}>${escapeHtml(`${t.nombre} ${t.apellido}`.trim())} (@${escapeHtml(t.username)})</option>`)
      .join("");

    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="modal-card modal-card-lg">
          <h2>${isEdit ? "Editar clase" : "Nueva clase"}</h2>
          <form id="classForm">
            <div class="field"><label for="className">Nombre</label><input type="text" id="className" maxlength="100" value="${existing ? escapeHtml(existing.name) : ""}" required></div>
            <div class="field"><label for="classDescription">Descripción (opcional)</label><textarea id="classDescription" rows="3" maxlength="500">${existing?.description ? escapeHtml(existing.description) : ""}</textarea></div>

            <div class="field">
              <label for="classImageFile">Imagen (opcional)</label>
              <div class="dropzone" id="classDropzone">
                <input type="file" id="classImageFile" accept="image/*" class="dropzone-input" aria-label="Imagen de la clase">
                <div class="dropzone-empty" id="classDropzoneEmpty" ${imageUrl ? "hidden" : ""}>
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                  <p><strong>Hacé clic para subir</strong> o arrastrá una imagen acá</p>
                  <span class="field-hint">JPG, PNG o WEBP · hasta 2MB</span>
                </div>
                <div class="dropzone-preview" id="classDropzonePreview" ${imageUrl ? "" : "hidden"}>
                  <img id="classDropzonePreviewImg" alt="" src="${imageUrl ? escapeHtml(imageUrl) : ""}">
                  <span class="dropzone-filename" id="classDropzoneFileName">${imageUrl ? "Imagen actual" : ""}</span>
                  <button type="button" class="dropzone-remove" id="classDropzoneRemove" title="Quitar imagen">×</button>
                </div>
              </div>
            </div>

            <div class="field"><label for="classInstructor">Profesor (opcional)</label>
              <select id="classInstructor">
                <option value="">Sin profesor asignado</option>
                ${instructorOptions}
              </select>
              ${trainers.length === 0 ? `<span class="field-hint">Todavía no tenés entrenadores handle. Podés asignar uno más adelante.</span>` : ""}
            </div>

            <div class="field">
              <label>Horarios</label>
              <div class="class-session-chips" id="classSessionChips"></div>
              <div class="class-session-form">
                <div class="field"><label for="sessionDay">Día</label>
                  <select id="sessionDay">${CLASS_DAY_LABELS.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select>
                </div>
                <div class="field"><label for="sessionStart">Desde</label><input type="time" id="sessionStart" value="09:00"></div>
                <div class="field"><label for="sessionEnd">Hasta</label><input type="time" id="sessionEnd" value="10:00"></div>
                <button type="button" class="btn btn-outline btn-sm" id="addSessionBtn">+ Agregar</button>
              </div>
            </div>

            <label class="member-accept-option">
              <input type="checkbox" id="classAllowEnrollment" ${existing?.allowEnrollment ? "checked" : ""}>
              Permitir que los socios se inscriban
            </label>
            <div class="field"><label for="classCapacity">Capacidad máxima (opcional)</label>
              <input type="number" id="classCapacity" min="1" step="1" value="${existing?.capacity ?? ""}">
              <span class="field-hint">Dejalo vacío para inscripción sin límite.</span>
            </div>

            <div class="modal-actions">
              <button class="btn btn-primary" id="submitClassBtn" type="submit">${isEdit ? "Guardar cambios" : "Crear clase"}</button>
              <button class="btn btn-outline" id="cancelClassBtn" type="button">Cancelar</button>
            </div>
            ${isEdit ? `<div class="modal-actions"><button class="btn btn-danger" id="deleteClassInFormBtn" type="button">Eliminar clase</button></div>` : ""}
          </form>
        </div>
      </div>
    `;

    document.getElementById("cancelClassBtn")?.addEventListener("click", closeOverlay);
    if (isEdit) {
      document.getElementById("deleteClassInFormBtn")?.addEventListener("click", () => confirmDeleteClass(existing!.id, existing!.name));
    }

    function renderSessionChips(): void {
      const chipsEl = document.getElementById("classSessionChips")!;
      chipsEl.innerHTML = sessions
        .map(
          (s, i) => `
        <span class="class-session-chip" data-i="${i}">
          ${CLASS_DAY_ABBR[s.dayOfWeek]} ${classFormatTime(s.startTime)}-${classFormatTime(s.endTime)}
          <button type="button" data-i="${i}" aria-label="Quitar horario">×</button>
        </span>
      `
        )
        .join("");
      chipsEl.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          sessions.splice(Number(btn.dataset.i), 1);
          renderSessionChips();
        });
      });
    }
    renderSessionChips();

    document.getElementById("addSessionBtn")?.addEventListener("click", () => {
      const day = Number((document.getElementById("sessionDay") as HTMLSelectElement).value);
      const start = (document.getElementById("sessionStart") as HTMLInputElement).value;
      const end = (document.getElementById("sessionEnd") as HTMLInputElement).value;
      if (!start || !end || start >= end) {
        alert("El horario de fin tiene que ser después del de inicio.");
        return;
      }
      sessions.push({ dayOfWeek: day, startTime: start, endTime: end });
      renderSessionChips();
    });

    // ---------- Dropzone de imagen (mismo patron que addExc.ts) ----------
    const dropzone = document.getElementById("classDropzone");
    const imageInput = document.getElementById("classImageFile") as HTMLInputElement | null;
    const dropzoneEmpty = document.getElementById("classDropzoneEmpty");
    const dropzonePreview = document.getElementById("classDropzonePreview");
    const dropzonePreviewImg = document.getElementById("classDropzonePreviewImg") as HTMLImageElement | null;
    const dropzoneFileName = document.getElementById("classDropzoneFileName");

    function showPreview(file: File): void {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = URL.createObjectURL(file);
      if (dropzonePreviewImg) dropzonePreviewImg.src = previewObjectUrl;
      if (dropzoneFileName) dropzoneFileName.textContent = file.name;
      dropzone?.classList.add("has-file");
      dropzoneEmpty?.setAttribute("hidden", "");
      dropzonePreview?.removeAttribute("hidden");
      pendingFile = file;
      imageUrl = null;
    }

    function clearPreview(): void {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }
      if (imageInput) imageInput.value = "";
      dropzone?.classList.remove("has-file");
      dropzonePreview?.setAttribute("hidden", "");
      dropzoneEmpty?.removeAttribute("hidden");
      pendingFile = null;
      imageUrl = null;
    }

    imageInput?.addEventListener("change", () => {
      const file = imageInput.files?.[0];
      if (file) showPreview(file);
    });
    document.getElementById("classDropzoneRemove")?.addEventListener("click", clearPreview);
    dropzone?.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone?.addEventListener("drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("dragover");
      const file = (event as DragEvent).dataTransfer?.files?.[0];
      if (file && imageInput) {
        imageInput.files = (event as DragEvent).dataTransfer!.files;
        showPreview(file);
      }
    });

    document.getElementById("classForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = (document.getElementById("className") as HTMLInputElement).value.trim();
      if (!name) return;
      const capacityRaw = (document.getElementById("classCapacity") as HTMLInputElement).value.trim();
      let capacity: number | null = null;
      if (capacityRaw) {
        capacity = parseInt(capacityRaw, 10);
        if (!Number.isInteger(capacity) || capacity < 1) {
          alert("La capacidad tiene que ser un número mayor a 0.");
          return;
        }
      }
      const submitBtn = document.getElementById("submitClassBtn") as HTMLButtonElement;
      submitBtn.disabled = true;

      let finalImageUrl = imageUrl;
      if (pendingFile) {
        const { url, error } = await uploadClassImage(gymId, pendingFile);
        if (error) {
          alert(error);
          submitBtn.disabled = false;
          return;
        }
        finalImageUrl = url ?? null;
      }

      const input: ClassFormInput = {
        name,
        description: (document.getElementById("classDescription") as HTMLTextAreaElement).value.trim(),
        imageUrl: finalImageUrl,
        instructorId: (document.getElementById("classInstructor") as HTMLSelectElement).value || null,
        allowEnrollment: (document.getElementById("classAllowEnrollment") as HTMLInputElement).checked,
        capacity,
        sessions,
      };

      const { error } = isEdit ? await updateGymClass(existing!.id, input) : await createGymClass(gymId, input);
      if (error) {
        alert(error);
        submitBtn.disabled = false;
        return;
      }
      closeOverlay();
      void refresh();
    });

    ctx.addCleanup(() => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    });
  }

  newClassBtn?.addEventListener("click", () => openClassForm(), { signal: ctx.signal });

  void refresh();
}

export const clasesView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const uParam = params.get("u");
    if (!uParam) {
      const myId = authUserId ?? (await requireAuth().catch(() => null));
      if (!myId) return; // requireAuth ya redirigio a login.html
      return mountClasesView(container, myId, null, ctx, myId, true);
    }
    const gym = await getProfileBasicByUsername(uParam).catch(() => null);
    if (!gym || !gym.id || gym.user_type !== "gimnasio") {
      container.innerHTML = `<section class="features"><div class="container"><p class="exc-pick-empty">Gimnasio no encontrado.</p></div></section>`;
      return;
    }
    const isOwner = !!authUserId && authUserId === gym.id;
    return mountClasesView(container, gym.id, gym.username ?? uParam, ctx, authUserId, isOwner);
  },
};
