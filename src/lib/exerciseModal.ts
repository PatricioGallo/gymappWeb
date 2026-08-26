import { escapeHtml } from "./dom";
import { CATEGORY_LABELS, type ExerciseCategory } from "../services/exercise.service";
import { getExerciseStats, type ExerciseStats, type WeightUnit } from "../services/weightLog.service";
import { isVideoUrl } from "./imageDropzone";

const UNIT_SUFFIX: Record<WeightUnit, string> = { kg: "kg", lb: "lb", bloques: "bloques" };

function formatPeso(peso: number, unidad: WeightUnit): string {
  const rounded = Math.round(peso * 10) / 10;
  return `${rounded} ${UNIT_SUFFIX[unidad]}`;
}

// fecha es un "YYYY-MM-DD" sin hora/timezone (ver TODAY en pesos.ts) -- parsearlo con
// `new Date(string)` lo interpreta como medianoche UTC y en Argentina (UTC-3) muestra un
// dia menos. new Date(y, m, d) arma una fecha local de verdad, sin ese corrimiento.
function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function statsHtml(stats: ExerciseStats | null): string {
  if (!stats) return `<p class="exc-modal-stat-empty">Todavía no cargaste pesos para este ejercicio.</p>`;
  return `
    <div class="exc-modal-stat">
      <span class="exc-modal-stat-label">Peso promedio</span>
      <span class="exc-modal-stat-value">${formatPeso(stats.avgPeso, stats.unidad)}</span>
    </div>
    <div class="exc-modal-stat">
      <span class="exc-modal-stat-label">Peso máximo</span>
      <span class="exc-modal-stat-value">${formatPeso(stats.maxPeso, stats.unidad)} <span class="exc-modal-stat-date">(${formatFecha(stats.maxFecha)})</span></span>
    </div>
  `;
}

/**
 * userId/exerciseId son opcionales: solo la pantalla de carga de pesos (pesos.ts) los tiene
 * a mano con sentido (el usuario dueño de esa carga puntual, no necesariamente quien mira
 * la pantalla si un entrenador está cargando por un alumno) y muestra el promedio/máximo
 * histórico. El visor de rutina de solo lectura (showExc.ts) no los pasa -- puede mostrarse
 * sin sesión iniciada, o mirando la rutina de otra persona vía link compartido, así que ni
 * corresponde mostrar "tu" historial ahí -- y el modal simplemente no muestra esa sección.
 */
const DEFAULT_EXERCISE_IMAGE = "/images/icon-512.png";

function exerciseImagesHtml(nombre: string, mediaUrls: string[] | null | undefined): string {
  // Sin ningun archivo subido: se usa el logo de Gym Social como imagen generica en vez de
  // dejar el modal sin foto.
  const urls = mediaUrls && mediaUrls.length > 0 ? mediaUrls : [DEFAULT_EXERCISE_IMAGE];

  return `
    <div class="exc-modal-images">
      ${urls
        .map(
          (url) => `
        <div class="exc-modal-image-item">
          ${
            url !== DEFAULT_EXERCISE_IMAGE && isVideoUrl(url)
              ? `<video class="exc-modal-image" src="${escapeHtml(url)}" controls playsinline loop></video>`
              : `<img class="exc-modal-image${url === DEFAULT_EXERCISE_IMAGE ? " exc-modal-image-default" : ""}" src="${escapeHtml(url)}" alt="${escapeHtml(nombre)}" loading="lazy">`
          }
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

export function openExerciseModal(
  nombre: string,
  info: string,
  nota: string | null,
  authorLabel: string,
  category: string | null | undefined,
  mediaUrls: string[] | null | undefined,
  userId?: string,
  exerciseId?: string
): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  const categoryLabel = category ? CATEGORY_LABELS[category as ExerciseCategory] : null;
  loaderBody.innerHTML = `
    <div class="success-check-container exc-modal-overlay">
      <div class="modal-card exc-modal-card">
        <h2>${escapeHtml(nombre)}</h2>
        ${categoryLabel ? `<span class="hero-badge">${escapeHtml(categoryLabel)}</span>` : ""}
        ${exerciseImagesHtml(nombre, mediaUrls)}
        <p class="subtitle">${escapeHtml(info || "Sin descripción cargada.")}</p>
        ${
          nota
            ? `<div class="notice"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div><div><strong>Nota del entrenador</strong><p>${escapeHtml(nota)}</p></div></div>`
            : ""
        }
        <p class="auth-foot" style="text-align:left;margin-top:16px;">Ejercicio de ${escapeHtml(authorLabel)}</p>
        ${userId && exerciseId ? `<div class="exc-modal-stats" id="excModalStats"><div class="modern-spinner"></div></div>` : ""}
        <div class="modal-actions"><button class="btn btn-outline" id="closeExcModal">Cerrar</button></div>
      </div>
    </div>
  `;
  document.getElementById("closeExcModal")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });

  if (!userId || !exerciseId) return;
  const statsEl = document.getElementById("excModalStats");
  getExerciseStats(userId, exerciseId)
    .then((stats) => {
      if (statsEl?.isConnected) statsEl.innerHTML = statsHtml(stats);
    })
    .catch(() => {
      if (statsEl?.isConnected) statsEl.innerHTML = "";
    });
}
