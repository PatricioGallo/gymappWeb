import type { ViewModule } from "../shell/router";
import { escapeHtml } from "../lib/dom";
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
import { listGymTrainers, type GymTrainerRow } from "../services/gymTrainer.service";

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <a href="profile.html" class="back-link"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Volver al perfil</a>
      <span class="eyebrow">Gimnasio</span>
      <h1>Tus clases</h1>
      <p>Armá las clases de tu gimnasio: horarios, profesor e inscripción de socios.</p>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="routines-header-actions">
        <button class="btn btn-primary btn-sm" id="newClassBtn" type="button">+ Nueva clase</button>
      </div>
      <p class="chart-sub" id="clasesSummary">Cargando...</p>
      <div class="search-page-list" id="clasesList"></div>
    </div>
  </section>
`;

const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_ABBR = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const MENU_GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;

function formatTime(t: string): string {
  return t.slice(0, 5);
}

function sessionsSummary(sessions: ClassSession[]): string {
  if (sessions.length === 0) return "Sin horario definido";
  return sessions.map((s) => `${DAY_ABBR[s.dayOfWeek]} ${formatTime(s.startTime)}-${formatTime(s.endTime)}`).join(", ");
}

function classCardMarkup(c: GymClassRow): string {
  const instructorName = c.instructorId ? `${c.instructorNombre ?? ""} ${c.instructorApellido ?? ""}`.trim() || c.instructorUsername : null;
  return `
    <div class="routine-card reveal routine-card-has-menu" data-id="${c.id}">
      <div class="profile-menu-wrap routine-menu-wrap">
        <button type="button" class="profile-menu-btn routine-menu-btn" aria-label="Más opciones" aria-expanded="false">${MENU_GEAR_ICON}</button>
        <div class="profile-menu-panel routine-menu-panel" hidden>
          <button type="button" class="profile-menu-item editClassBtn" data-id="${c.id}">Editar</button>
          <button type="button" class="profile-menu-item profile-menu-item-danger deleteClassBtn" data-id="${c.id}" data-nombre="${escapeHtml(c.name)}">Eliminar</button>
        </div>
      </div>
      ${c.imageUrl ? `<img src="${escapeHtml(c.imageUrl)}" alt="" class="gym-class-image">` : ""}
      <h3>${escapeHtml(c.name)}</h3>
      ${c.description ? `<p>${escapeHtml(c.description)}</p>` : ""}
      <div class="routine-stats">
        <div><span>Profesor</span><strong>${instructorName ? escapeHtml(instructorName) : "Sin asignar"}</strong></div>
        <div><span>Horarios</span><strong>${escapeHtml(sessionsSummary(c.sessions))}</strong></div>
        <div><span>Inscripción</span><strong>${c.allowEnrollment ? "Habilitada" : "Deshabilitada"}</strong></div>
        <div><span>Inscriptos</span><strong>${c.enrolledCount}</strong></div>
      </div>
    </div>
  `;
}

export const clasesView: ViewModule = {
  async mount(container, _params, ctx, authUserId) {
    const myId = authUserId!; // la ruta se registra con auth: "required"
    container.innerHTML = VIEW_MARKUP;

    const summaryEl = container.querySelector("#clasesSummary")!;
    const listEl = container.querySelector("#clasesList")!;
    const newClassBtn = container.querySelector("#newClassBtn") as HTMLButtonElement;

    let trainers: GymTrainerRow[] = [];

    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".routine-menu-wrap")) return;
        container.querySelectorAll<HTMLElement>(".routine-menu-panel").forEach((p) => (p.hidden = true));
        container.querySelectorAll<HTMLButtonElement>(".routine-menu-btn").forEach((b) => {
          b.classList.remove("open");
          b.setAttribute("aria-expanded", "false");
        });
      },
      { signal: ctx.signal }
    );

    function wireClassMenus(root: HTMLElement): void {
      root.querySelectorAll<HTMLButtonElement>(".routine-menu-btn").forEach((btn) => {
        const panel = btn.nextElementSibling as HTMLElement | null;
        if (!panel) return;
        btn.addEventListener("click", () => {
          const willOpen = panel.hidden;
          root.querySelectorAll<HTMLElement>(".routine-menu-panel").forEach((p) => (p.hidden = true));
          root.querySelectorAll<HTMLButtonElement>(".routine-menu-btn").forEach((b) => {
            b.classList.remove("open");
            b.setAttribute("aria-expanded", "false");
          });
          panel.hidden = !willOpen;
          btn.classList.toggle("open", willOpen);
          btn.setAttribute("aria-expanded", String(willOpen));
        });
      });
    }

    function closeOverlay(): void {
      const loaderBody = document.getElementById("loaderBody");
      if (loaderBody) loaderBody.innerHTML = "";
    }

    async function refresh(): Promise<void> {
      summaryEl.textContent = "Cargando...";
      try {
        const [classes, trainerRows] = await Promise.all([listGymClasses(myId), listGymTrainers(myId, { statusFilter: "all" })]);
        trainers = trainerRows;
        summaryEl.textContent = classes.length === 0 ? "Todavía no armaste ninguna clase." : `${classes.length} clase${classes.length === 1 ? "" : "s"}.`;
        listEl.innerHTML = classes.map(classCardMarkup).join("");
        wireClassMenus(listEl as HTMLElement);
        listEl.querySelectorAll<HTMLButtonElement>(".editClassBtn").forEach((btn) => {
          const c = classes.find((x) => x.id === btn.dataset.id);
          if (c) btn.addEventListener("click", () => openClassForm(c));
        });
        listEl.querySelectorAll<HTMLButtonElement>(".deleteClassBtn").forEach((btn) => {
          btn.addEventListener("click", () => confirmDeleteClass(btn.dataset.id!, btn.dataset.nombre!));
        });
      } catch {
        summaryEl.textContent = "No se pudieron cargar las clases. Probá de nuevo.";
        listEl.innerHTML = "";
      }
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
                    <select id="sessionDay">${DAY_LABELS.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select>
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

              <div class="modal-actions">
                <button class="btn btn-primary" id="submitClassBtn" type="submit">${isEdit ? "Guardar cambios" : "Crear clase"}</button>
                <button class="btn btn-outline" id="cancelClassBtn" type="button">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.getElementById("cancelClassBtn")?.addEventListener("click", closeOverlay);

      function renderSessionChips(): void {
        const chipsEl = document.getElementById("classSessionChips")!;
        chipsEl.innerHTML = sessions
          .map(
            (s, i) => `
          <span class="class-session-chip" data-i="${i}">
            ${DAY_ABBR[s.dayOfWeek]} ${formatTime(s.startTime)}-${formatTime(s.endTime)}
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
        const submitBtn = document.getElementById("submitClassBtn") as HTMLButtonElement;
        submitBtn.disabled = true;

        let finalImageUrl = imageUrl;
        if (pendingFile) {
          const { url, error } = await uploadClassImage(myId, pendingFile);
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
          sessions,
        };

        const { error } = isEdit ? await updateGymClass(existing!.id, input) : await createGymClass(myId, input);
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

    newClassBtn.addEventListener("click", () => openClassForm(), { signal: ctx.signal });

    void refresh();
  },
};
