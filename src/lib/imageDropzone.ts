import { escapeHtml } from "./dom";
import { uploadExerciseImage } from "../services/exercise.service";

// Selector de fotos/videos de un ejercicio -- hasta 3 archivos, cada uno opcional imagen o
// video. Antes eran 2 dropzones fijas (principio/ejecución) copiadas en los 3 formularios
// (addExc.ts, admin.ts, createExerciseModal.ts); ahora es una sola lista dinámica de slots
// reutilizada por los tres.

export const EXERCISE_MEDIA_MAX = 3;

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v)$/i;

/** Detecta por extensión si una URL ya subida (exercises.media_urls) es un video. */
export function isVideoUrl(url: string): boolean {
  return VIDEO_EXTENSIONS.test(url);
}

/** Miniatura de catálogo (exc-pick-thumb/exc-admin-card): el primer archivo, o el ícono de fallback si no hay ninguno. */
export function exerciseThumbMediaHtml(mediaUrls: string[] | null | undefined, fallbackHtml: string): string {
  const url = mediaUrls?.[0];
  if (!url) return fallbackHtml;
  return isVideoUrl(url) ? `<video src="${escapeHtml(url)}" muted loop playsinline autoplay></video>` : `<img src="${escapeHtml(url)}" alt="" loading="lazy">`;
}

function slotMediaPreviewHtml(url: string): string {
  return isVideoUrl(url)
    ? `<video src="${escapeHtml(url)}" muted loop playsinline autoplay></video>`
    : `<img alt="" src="${escapeHtml(url)}">`;
}

export interface ExerciseMediaPickerOptions {
  /** Prefijo unico para los ids del DOM -- necesario para poder tener mas de un picker en el mismo formulario. */
  idPrefix: string;
  label: string;
  /** URLs ya guardadas (modo edición) -- se muestran como slots iniciales. */
  currentUrls?: string[];
}

export function exerciseMediaPickerMarkup(opts: ExerciseMediaPickerOptions): string {
  const { idPrefix, label } = opts;
  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <div class="exc-media-slots" id="${idPrefix}Slots"></div>
      <button type="button" class="btn btn-outline btn-sm exc-media-add" id="${idPrefix}AddBtn">+ Agregar foto o video</button>
      <p class="field-hint">JPG, PNG, WEBP, GIF o video · hasta 20MB (video hasta 2 min) · máximo ${EXERCISE_MEDIA_MAX} archivos</p>
    </div>
  `;
}

export interface ExerciseMediaSlotResult {
  /** Archivo nuevo elegido en este slot, a subir. */
  file: File | null;
  /** URL ya guardada que el usuario no tocó (solo si file es null). */
  currentUrl: string | null;
}

export interface ExerciseMediaPickerHandle {
  /** Un resultado por slot que quedó en pantalla, en orden -- los que el usuario quitó ya no aparecen. */
  getSlots(): ExerciseMediaSlotResult[];
  /** Libera los object URLs de preview creados -- llamar al cerrar/desmontar el formulario. */
  cleanup(): void;
}

interface Slot {
  key: string;
  currentUrl: string | null;
  file: File | null;
  objectUrl: string | null;
}

/** Engancha un picker ya insertado en el DOM (ver exerciseMediaPickerMarkup). */
export function wireExerciseMediaPicker(root: ParentNode, idPrefix: string, currentUrls: string[] = []): ExerciseMediaPickerHandle {
  const slotsEl = root.querySelector<HTMLElement>(`#${idPrefix}Slots`);
  const addBtn = root.querySelector<HTMLButtonElement>(`#${idPrefix}AddBtn`);

  let slots: Slot[] = currentUrls.map((url, i) => ({ key: `${idPrefix}-${i}`, currentUrl: url, file: null, objectUrl: null }));
  let seq = slots.length;

  function render(): void {
    if (!slotsEl) return;
    slotsEl.innerHTML = slots
      .map((slot) => {
        const hasMedia = !!(slot.objectUrl || slot.currentUrl);
        const mediaHtml = slot.objectUrl
          ? slot.file!.type.startsWith("video/")
            ? `<video src="${slot.objectUrl}" muted loop playsinline autoplay></video>`
            : `<img alt="" src="${slot.objectUrl}">`
          : slot.currentUrl
            ? slotMediaPreviewHtml(slot.currentUrl)
            : "";
        return `
        <div class="dropzone exc-media-slot ${hasMedia ? "has-file" : ""}" data-key="${slot.key}">
          <input type="file" accept="image/*,video/*" class="dropzone-input" data-key="${slot.key}" aria-label="Archivo">
          <div class="dropzone-empty" ${hasMedia ? "hidden" : ""}>
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
            <p><strong>Hacé clic para subir</strong> o arrastrá un archivo acá</p>
          </div>
          <div class="dropzone-preview" ${hasMedia ? "" : "hidden"}>
            <div class="dropzone-preview-media">${mediaHtml}</div>
            <span class="dropzone-filename">${slot.file ? escapeHtml(slot.file.name) : slot.currentUrl ? "Archivo actual" : ""}</span>
            <button type="button" class="dropzone-remove" data-key="${slot.key}" title="Quitar archivo">×</button>
          </div>
        </div>`;
      })
      .join("");

    wireSlotEvents();
    updateAddBtn();
  }

  function wireSlotEvents(): void {
    slotsEl?.querySelectorAll<HTMLInputElement>(".dropzone-input").forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) setSlotFile(input.dataset.key!, file);
      });
    });
    slotsEl?.querySelectorAll<HTMLElement>(".exc-media-slot").forEach((zone) => {
      const key = zone.dataset.key!;
      zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        zone.classList.add("dragover");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("dragover");
        const file = (event as DragEvent).dataTransfer?.files?.[0];
        if (file) setSlotFile(key, file);
      });
    });
    slotsEl?.querySelectorAll<HTMLButtonElement>(".dropzone-remove").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        removeSlot(btn.dataset.key!);
      });
    });
  }

  function setSlotFile(key: string, file: File): void {
    const slot = slots.find((s) => s.key === key);
    if (!slot) return;
    if (slot.objectUrl) URL.revokeObjectURL(slot.objectUrl);
    slot.file = file;
    slot.currentUrl = null;
    slot.objectUrl = URL.createObjectURL(file);
    render();
  }

  function removeSlot(key: string): void {
    const slot = slots.find((s) => s.key === key);
    if (slot?.objectUrl) URL.revokeObjectURL(slot.objectUrl);
    slots = slots.filter((s) => s.key !== key);
    render();
  }

  function updateAddBtn(): void {
    if (!addBtn) return;
    addBtn.hidden = slots.length >= EXERCISE_MEDIA_MAX;
    addBtn.textContent = slots.length === 0 ? "+ Agregar foto o video" : "+ Agregar otra foto o video";
  }

  addBtn?.addEventListener("click", () => {
    if (slots.length >= EXERCISE_MEDIA_MAX) return;
    slots.push({ key: `${idPrefix}-${seq++}`, currentUrl: null, file: null, objectUrl: null });
    render();
  });

  render();

  return {
    getSlots: () => slots.map((s) => ({ file: s.file, currentUrl: s.currentUrl })),
    cleanup: () => slots.forEach((s) => { if (s.objectUrl) URL.revokeObjectURL(s.objectUrl); }),
  };
}

/** Sube los archivos nuevos de un picker ya wireado y arma la lista final de URLs (nuevas + las que ya estaban y no se tocaron), en orden. */
export async function resolveExerciseMediaUrls(authorId: string, handle: ExerciseMediaPickerHandle): Promise<{ urls?: string[]; error?: string }> {
  const urls: string[] = [];
  for (const slot of handle.getSlots()) {
    if (slot.file) {
      const { url, error } = await uploadExerciseImage(authorId, slot.file);
      if (error) return { error };
      urls.push(url!);
    } else if (slot.currentUrl) {
      urls.push(slot.currentUrl);
    }
  }
  return { urls };
}
