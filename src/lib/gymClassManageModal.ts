import { escapeHtml } from "./dom";
import { CLASS_DAY_LABELS, CLASS_DAY_ABBR, classFormatTime } from "./gymClassMarkup";
import type { ViewContext } from "../shell/viewContext";
import {
  createGymClass,
  updateGymClass,
  deleteGymClass,
  uploadClassImage,
  type GymClassRow,
  type ClassSessionInput,
  type ClassFormInput,
} from "../services/gymClass.service";
import type { GymTrainerRow } from "../services/gymTrainer.service";

// ---------------------------------------------------------------------------
// Gestion (crear/editar/borrar) de una clase de gimnasio -- compartido entre clases.ts
// (calendario propio, boton "+ Nueva clase") y profile.ts (click en una clase del propio
// slider del perfil). Ambas vistas dejan al dueño gestionar sus clases desde el mismo lugar
// que ya usaban, sin duplicar este formulario.
// ---------------------------------------------------------------------------

function closeOverlay(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (loaderBody) loaderBody.innerHTML = "";
}

export function confirmDeleteGymClass(classId: string, nombre: string, onDeleted: () => void): void {
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
    onDeleted();
  });
}

export interface ClassManageFormOpts {
  gymId: string;
  trainers: GymTrainerRow[];
  ctx: ViewContext;
  existing?: GymClassRow;
  onSaved: () => void;
}

export function openClassManageForm(opts: ClassManageFormOpts): void {
  const { gymId, trainers, ctx, existing, onSaved } = opts;
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  const isEdit = !!existing;
  let sessions: ClassSessionInput[] = existing ? [...existing.sessions] : [];
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
    document.getElementById("deleteClassInFormBtn")?.addEventListener("click", () => confirmDeleteGymClass(existing!.id, existing!.name, onSaved));
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
    onSaved();
  });

  ctx.addCleanup(() => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  });
}
