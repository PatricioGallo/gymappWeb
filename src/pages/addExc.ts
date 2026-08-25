import type { ViewModule } from "../shell/router";
import { navigate } from "../shell/router";
import { validateNewExercise, addExercise, uploadExerciseImage, type ExerciseCategory } from "../services/exercise.service";
import { escapeHtml } from "../lib/dom";
import { imageDropzoneMarkup, wireImageDropzone } from "../lib/imageDropzone";

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

          ${imageDropzoneMarkup({ idPrefix: "excImgStart", label: "Foto: principio del ejercicio (opcional)" })}
          ${imageDropzoneMarkup({ idPrefix: "excImgExec", label: "Foto: ejecución del ejercicio (opcional)" })}
          <p class="field-hint">Si no subís ninguna de las dos, se usa el logo de Gym Social.</p>

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

    // ---------- Dropzones de imagen (principio del ejercicio / ejecución) ----------

    const startDropzone = wireImageDropzone(container, "excImgStart");
    const execDropzone = wireImageDropzone(container, "excImgExec");
    ctx.addCleanup(() => {
      startDropzone.cleanup();
      execDropzone.cleanup();
    });

    form?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const name = (container.querySelector("#excName") as HTMLInputElement).value.trim();
        const info = (container.querySelector("#description") as HTMLTextAreaElement).value.trim();
        const category = (container.querySelector("#category") as HTMLSelectElement).value;
        const isPublic = (container.querySelector("#visibility") as HTMLSelectElement).value === "true";
        const startFile = startDropzone.getFile();
        const execFile = execDropzone.getFile();

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

        let imageStartUrl: string | undefined;
        if (startFile) {
          const { url, error: uploadError } = await uploadExerciseImage(userId, startFile);
          if (uploadError) {
            if (loaderBody) loaderBody.innerHTML = "";
            if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(uploadError)}</p>`;
            return;
          }
          imageStartUrl = url;
        }

        let imageExecutionUrl: string | undefined;
        if (execFile) {
          const { url, error: uploadError } = await uploadExerciseImage(userId, execFile);
          if (uploadError) {
            if (loaderBody) loaderBody.innerHTML = "";
            if (alertMessage) alertMessage.innerHTML = `<p>${escapeHtml(uploadError)}</p>`;
            return;
          }
          imageExecutionUrl = url;
        }

        const { error } = await addExercise(userId, name, info, category as ExerciseCategory, isPublic, imageStartUrl, imageExecutionUrl);
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
