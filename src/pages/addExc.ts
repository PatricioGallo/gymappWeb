import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { validateNewExercise, addExercise, uploadExerciseImage, type ExerciseCategory } from "../services/exercise.service";
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
  category_missing: "Elegí una categoría para el ejercicio.",
};

// ---------- Dropzone de imagen ----------

const dropzone = document.getElementById("dropzone");
const imageInput = document.getElementById("imageFile") as HTMLInputElement | null;
const dropzoneEmpty = document.getElementById("dropzoneEmpty");
const dropzonePreview = document.getElementById("dropzonePreview");
const dropzonePreviewImg = document.getElementById("dropzonePreviewImg") as HTMLImageElement | null;
const dropzoneFileName = document.getElementById("dropzoneFileName");
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

imageInput?.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) showPreview(file);
});

document.getElementById("dropzoneRemove")?.addEventListener("click", clearPreview);

dropzone?.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone?.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  const file = event.dataTransfer?.files?.[0];
  if (file && imageInput) {
    imageInput.files = event.dataTransfer!.files;
    showPreview(file);
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = (document.getElementById("excName") as HTMLInputElement).value.trim();
  const info = (document.getElementById("description") as HTMLTextAreaElement).value.trim();
  const category = (document.getElementById("category") as HTMLSelectElement).value;
  const isPublic = (document.getElementById("visibility") as HTMLSelectElement).value === "true";
  const imageFile = (document.getElementById("imageFile") as HTMLInputElement).files?.[0];

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
  setTimeout(() => {
    window.location.href = "profile.html";
  }, 2000);
});
