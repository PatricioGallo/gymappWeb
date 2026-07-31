import { escapeHtml } from "./dom";
import { CATEGORY_LABELS, type ExerciseCategory } from "../services/exercise.service";

export function openExerciseModal(
  nombre: string,
  info: string,
  nota: string | null,
  authorLabel: string,
  category?: string | null,
  imageUrl?: string | null
): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  const categoryLabel = category ? CATEGORY_LABELS[category as ExerciseCategory] : null;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>${escapeHtml(nombre)}</h2>
        ${categoryLabel ? `<span class="hero-badge">${escapeHtml(categoryLabel)}</span>` : ""}
        ${imageUrl ? `<img class="exc-modal-image" src="${escapeHtml(imageUrl)}" alt="Ejecución de ${escapeHtml(nombre)}" loading="lazy">` : ""}
        <p class="subtitle">${escapeHtml(info || "Sin descripción cargada.")}</p>
        ${
          nota
            ? `<div class="notice"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div><div><strong>Nota del entrenador</strong><p>${escapeHtml(nota)}</p></div></div>`
            : ""
        }
        <p class="auth-foot" style="text-align:left;margin-top:16px;">Ejercicio de ${escapeHtml(authorLabel)}</p>
        <div class="modal-actions"><button class="btn btn-outline" id="closeExcModal">Cerrar</button></div>
      </div>
    </div>
  `;
  document.getElementById("closeExcModal")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });
}
