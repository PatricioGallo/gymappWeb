import type { ViewModule } from "../shell/router";
import { navigate } from "../shell/router";
import { validateNewExercise, addExercise, uploadExerciseImage, type ExerciseCategory } from "../services/exercise.service";
import { escapeHtml } from "../lib/dom";

const ERROR_LABELS: Record<string, string> = {
  name_short: "Nombre del ejercicio muy corto.",
  name_long: "Nombre del ejercicio muy largo.",
  info_short: "Descripción del ejercicio muy corta (mínimo 100 caracteres).",
  info_long: "Descripción del ejercicio muy larga (máximo 600 caracteres).",
  category_missing: "Elegí una categoría para el ejercicio.",
};

const VIEW_MARKUP = `
  <section class="auth-section">
    <div class="container">
      <div class="auth-card reveal">
        <span class="eyebrow">Catálogo de ejercicios</span>
        <h1>Agregar un ejercicio</h1>
        <p class="subtitle">Se guarda con tu nombre como autor. Elegís si lo pueden usar todos o solo vos.</p>

        <form id="myForm" novalidate>
          <div class="field">
            <label for="excName">Nombre del ejercicio</label>
            <input type="text" id="excName" name="excName" placeholder="Ej: Press inclinado con mancuernas">
          </div>

          <div class="field">
            <label for="description">Descripción</label>
            <textarea id="description" name="description" rows="5" placeholder="Cómo se hace, en qué fijarse (mínimo 100 caracteres)"></textarea>
          </div>

          <div class="field">
            <label for="category">Categoría</label>
            <select id="category" name="category">
              <option value="">Elegí una categoría</option>
              <option value="hombros">Hombros</option>
              <option value="pectorales">Pectorales</option>
              <option value="espalda">Espalda</option>
              <option value="brazos">Brazos</option>
              <option value="abdominales">Abdominales</option>
              <option value="piernas">Piernas</option>
              <option value="estiramiento">Estiramiento</option>
            </select>
          </div>

          <div class="field">
            <label for="imageFile">Imagen ilustrativa (opcional)</label>
            <div class="dropzone" id="dropzone">
              <input type="file" id="imageFile" name="imageFile" accept="image/*" class="dropzone-input" aria-label="Imagen ilustrativa del ejercicio">
              <div class="dropzone-empty" id="dropzoneEmpty">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                <p><strong>Hacé clic para subir</strong> o arrastrá una imagen acá</p>
                <span class="field-hint">JPG, PNG o WEBP · hasta 2MB</span>
              </div>
              <div class="dropzone-preview" id="dropzonePreview" hidden>
                <img id="dropzonePreviewImg" alt="">
                <span class="dropzone-filename" id="dropzoneFileName"></span>
                <button type="button" class="dropzone-remove" id="dropzoneRemove" title="Quitar imagen">×</button>
              </div>
            </div>
            <p class="field-hint">Si no subís nada, se usa una imagen genérica.</p>
          </div>

          <div class="field">
            <label for="visibility">Visibilidad</label>
            <select id="visibility" name="visibility">
              <option value="false" selected>Privado (solo vos lo vas a poder agregar a tus rutinas)</option>
              <option value="true">Público (cualquiera lo puede agregar a las suyas)</option>
            </select>
          </div>

          <div class="alert_message" id="alert_message"></div>

          <button type="submit" class="btn btn-primary btn-block">Agregar ejercicio</button>
        </form>
      </div>
    </div>
  </section>
`;

export const addExcView: ViewModule = {
  async mount(container, _params, ctx, authUserId) {
    const userId = authUserId!; // la ruta se registra con requiresAuth:true
    container.innerHTML = VIEW_MARKUP;

    const form = container.querySelector("#myForm") as HTMLFormElement;
    const alertMessage = container.querySelector("#alert_message");
    // #loaderBody vive en el chrome persistente del shell, fuera del container de esta vista.
    const loaderBody = document.getElementById("loaderBody");

    // ---------- Dropzone de imagen ----------

    const dropzone = container.querySelector("#dropzone");
    const imageInput = container.querySelector("#imageFile") as HTMLInputElement | null;
    const dropzoneEmpty = container.querySelector("#dropzoneEmpty");
    const dropzonePreview = container.querySelector("#dropzonePreview");
    const dropzonePreviewImg = container.querySelector("#dropzonePreviewImg") as HTMLImageElement | null;
    const dropzoneFileName = container.querySelector("#dropzoneFileName");
    let previewUrl: string | null = null;

    function showPreview(file: File): void {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      if (dropzonePreviewImg) dropzonePreviewImg.src = previewUrl;
      if (dropzoneFileName) dropzoneFileName.textContent = file.name;
      dropzone?.classList.add("has-file");
      dropzoneEmpty?.setAttribute("hidden", "");
      dropzonePreview?.removeAttribute("hidden");
    }

    function clearPreview(): void {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }
      if (imageInput) imageInput.value = "";
      dropzone?.classList.remove("has-file");
      dropzonePreview?.setAttribute("hidden", "");
      dropzoneEmpty?.removeAttribute("hidden");
    }

    ctx.addCleanup(() => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    });

    imageInput?.addEventListener(
      "change",
      () => {
        const file = imageInput.files?.[0];
        if (file) showPreview(file);
      },
      { signal: ctx.signal }
    );

    container.querySelector("#dropzoneRemove")?.addEventListener("click", clearPreview, { signal: ctx.signal });

    dropzone?.addEventListener(
      "dragover",
      (event) => {
        event.preventDefault();
        dropzone.classList.add("dragover");
      },
      { signal: ctx.signal }
    );
    dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dragover"), { signal: ctx.signal });
    dropzone?.addEventListener(
      "drop",
      (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragover");
        const file = (event as DragEvent).dataTransfer?.files?.[0];
        if (file && imageInput) {
          imageInput.files = (event as DragEvent).dataTransfer!.files;
          showPreview(file);
        }
      },
      { signal: ctx.signal }
    );

    form?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const name = (container.querySelector("#excName") as HTMLInputElement).value.trim();
        const info = (container.querySelector("#description") as HTMLTextAreaElement).value.trim();
        const category = (container.querySelector("#category") as HTMLSelectElement).value;
        const isPublic = (container.querySelector("#visibility") as HTMLSelectElement).value === "true";
        const imageFile = (container.querySelector("#imageFile") as HTMLInputElement).files?.[0];

        if (alertMessage) alertMessage.innerHTML = "";

        const validationError = validateNewExercise(name, info, category);
        if (validationError) {
          if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(ERROR_LABELS[validationError])}</p>`;
          return;
        }

        if (loaderBody) {
          loaderBody.innerHTML = `
            <div id="loading" class="loader-container">
              <div class="modern-spinner"></div>
              <p>Subiendo ejercicio nuevo...</p>
            </div>
          `;
        }

        let imageUrl: string | undefined;
        if (imageFile) {
          const { url, error: uploadError } = await uploadExerciseImage(userId, imageFile);
          if (uploadError) {
            if (loaderBody) loaderBody.innerHTML = "";
            if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(uploadError)}</p>`;
            return;
          }
          imageUrl = url;
        }

        const { error } = await addExercise(userId, name, info, category as ExerciseCategory, isPublic, imageUrl);
        if (error) {
          if (loaderBody) loaderBody.innerHTML = "";
          if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }

        if (loaderBody) {
          loaderBody.innerHTML = `
            <div id="success-check" class="success-check-container">
              <div class="success-icon">
                <svg viewBox="0 0 52 52" class="success-svg">
                  <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                  <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
                </svg>
              </div>
              <p>¡Ejercicio subido con éxito! Espere será redirigido.</p>
            </div>
          `;
        }
        const t = setTimeout(() => navigate("profile.html"), 2000);
        ctx.addCleanup(() => clearTimeout(t));
      },
      { signal: ctx.signal }
    );
  },
};
