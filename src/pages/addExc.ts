import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { validateNewExercise, addExercise } from "../services/exercise.service";
import { escapeHtml } from "../lib/dom";

setupNavToggle();
setupRevealObserver();
const userId = await requireAuth();

const form = document.getElementById("myForm") as HTMLFormElement | null;
const alertMessage = document.getElementById("alert_message");
const loaderBody = document.getElementById("loaderBody");

const ERROR_LABELS: Record<string, string> = {
  name_short: "Nombre del ejercicio muy corto.",
  name_long: "Nombre del ejercicio muy largo.",
  info_short: "Descripción del ejercicio muy corta (mínimo 100 caracteres).",
  info_long: "Descripción del ejercicio muy larga (máximo 600 caracteres).",
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = (document.getElementById("excName") as HTMLInputElement).value.trim();
  const info = (document.getElementById("description") as HTMLTextAreaElement).value.trim();

  if (alertMessage) alertMessage.innerHTML = "";

  const validationError = validateNewExercise(name, info);
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

  const { error } = await addExercise(userId, name, info);
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
  setTimeout(() => {
    window.location.href = "profile.html";
  }, 2000);
});
