import { escapeHtml } from "./dom";
import {
  EXERCISE_CATEGORIES,
  CATEGORY_LABELS,
  validateNewExercise,
  addExercise,
  updateExercise,
  uploadExerciseImage,
  type Exercise,
  type ExerciseCategory,
} from "../services/exercise.service";
import { imageDropzoneMarkup, wireImageDropzone } from "./imageDropzone";
import type { ViewContext } from "../shell/viewContext";

const ERROR_LABELS: Record<string, string> = {
  name_short: "Nombre del ejercicio muy corto.",
  name_long: "Nombre del ejercicio muy largo.",
  info_short: "Descripción del ejercicio muy corta (mínimo 100 caracteres).",
  info_long: "Descripción del ejercicio muy larga (máximo 600 caracteres).",
  category_missing: "Elegí una categoría para el ejercicio.",
};

/**
 * Modal para crear o editar un ejercicio propio sin salir de la pantalla actual (ver
 * addExc.ts para la version de pagina completa, usada solo para crear). Pasar `existing`
 * lo pone en modo edicion: precarga los campos y llama a updateExercise en vez de addExercise.
 */
export function openCreateExerciseModal(userId: string, existing: Exercise | null, ctx?: ViewContext, onSaved?: () => void): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  const currentImageStartUrl = existing?.image_start_url ?? null;
  const currentImageExecutionUrl = existing?.image_execution_url ?? null;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>${existing ? "Editar ejercicio" : "Crear un ejercicio"}</h2>
        <p class="subtitle">Se guarda con tu nombre como autor. Elegís si lo pueden usar todos o solo vos.</p>

        <div class="field"><label for="createExcName">Nombre del ejercicio</label><input type="text" id="createExcName" placeholder="Ej: Press inclinado con mancuernas" value="${escapeHtml(existing?.name ?? "")}"></div>
        <div class="field"><label for="createExcInfo">Descripción</label><textarea id="createExcInfo" rows="5" placeholder="Cómo se hace, en qué fijarse (mínimo 100 caracteres)">${escapeHtml(existing?.info ?? "")}</textarea></div>
        <div class="field">
          <label for="createExcCategory">Categoría</label>
          <select id="createExcCategory">
            <option value="">Elegí una categoría</option>
            ${EXERCISE_CATEGORIES.map((c) => `<option value="${c}" ${existing?.category === c ? "selected" : ""}>${escapeHtml(CATEGORY_LABELS[c])}</option>`).join("")}
          </select>
        </div>

        ${imageDropzoneMarkup({ idPrefix: "createExcImgStart", label: "Foto: principio del ejercicio (opcional)", currentUrl: currentImageStartUrl })}
        ${imageDropzoneMarkup({ idPrefix: "createExcImgExec", label: "Foto: ejecución del ejercicio (opcional)", currentUrl: currentImageExecutionUrl })}
        <p class="field-hint">Si no subís ninguna de las dos, se usa el logo de Gym Social.</p>

        <div class="field">
          <label for="createExcVisibility">Visibilidad</label>
          <select id="createExcVisibility">
            <option value="false" ${existing?.is_public === false || !existing ? "selected" : ""}>Privado (solo vos lo vas a poder agregar a tus rutinas)</option>
            <option value="true" ${existing?.is_public === true ? "selected" : ""}>Público (cualquiera lo puede agregar a las suyas)</option>
          </select>
        </div>

        <div class="alert_message" id="createExcAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="createExcSave" type="button">${existing ? "Guardar cambios" : "Crear ejercicio"}</button>
          <button class="btn btn-outline" id="createExcClose" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  const startDropzone = wireImageDropzone(document, "createExcImgStart");
  const execDropzone = wireImageDropzone(document, "createExcImgExec");

  function close(): void {
    startDropzone.cleanup();
    execDropzone.cleanup();
    loaderBody!.innerHTML = "";
  }

  document.getElementById("createExcClose")?.addEventListener("click", close, { signal: ctx?.signal });
  ctx?.addCleanup(close);

  document.getElementById("createExcSave")?.addEventListener(
    "click",
    async () => {
      const alertBox = document.getElementById("createExcAlert")!;
      alertBox.innerHTML = "";

      const name = (document.getElementById("createExcName") as HTMLInputElement).value.trim();
      const info = (document.getElementById("createExcInfo") as HTMLTextAreaElement).value.trim();
      const category = (document.getElementById("createExcCategory") as HTMLSelectElement).value;
      const isPublic = (document.getElementById("createExcVisibility") as HTMLSelectElement).value === "true";

      const validationError = validateNewExercise(name, info, category);
      if (validationError) {
        alertBox.innerHTML = `<p>${escapeHtml(ERROR_LABELS[validationError])}</p>`;
        return;
      }

      const saveBtn = document.getElementById("createExcSave") as HTMLButtonElement;
      saveBtn.disabled = true;

      let imageStartUrl: string | null | undefined = currentImageStartUrl;
      const startFile = startDropzone.getFile();
      if (startFile) {
        const { url, error: uploadError } = await uploadExerciseImage(userId, startFile);
        if (uploadError) {
          alertBox.innerHTML = `<p>${escapeHtml(uploadError)}</p>`;
          saveBtn.disabled = false;
          return;
        }
        imageStartUrl = url ?? null;
      } else if (startDropzone.wasRemoved()) {
        imageStartUrl = null;
      }

      let imageExecutionUrl: string | null | undefined = currentImageExecutionUrl;
      const execFile = execDropzone.getFile();
      if (execFile) {
        const { url, error: uploadError } = await uploadExerciseImage(userId, execFile);
        if (uploadError) {
          alertBox.innerHTML = `<p>${escapeHtml(uploadError)}</p>`;
          saveBtn.disabled = false;
          return;
        }
        imageExecutionUrl = url ?? null;
      } else if (execDropzone.wasRemoved()) {
        imageExecutionUrl = null;
      }

      const { error } = existing
        ? await updateExercise(existing.id, {
            name,
            info,
            category: category as ExerciseCategory,
            image_start_url: imageStartUrl,
            image_execution_url: imageExecutionUrl,
            is_public: isPublic,
          })
        : await addExercise(userId, name, info, category as ExerciseCategory, isPublic, imageStartUrl ?? undefined, imageExecutionUrl ?? undefined);
      if (error) {
        alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
        saveBtn.disabled = false;
        return;
      }

      startDropzone.cleanup();
      execDropzone.cleanup();
      loaderBody!.innerHTML = `
        <div class="success-check-container">
          <div class="success-icon">
            <svg viewBox="0 0 52 52" class="success-svg">
              <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
              <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
            </svg>
          </div>
          <p>${existing ? "¡Cambios guardados!" : "¡Ejercicio creado con éxito!"}</p>
        </div>
      `;
      const t = setTimeout(() => {
        loaderBody!.innerHTML = "";
        onSaved?.();
      }, 1400);
      ctx?.addCleanup(() => clearTimeout(t));
    },
    { signal: ctx?.signal }
  );
}
