import { escapeHtml } from "./dom";

// Dropzone de imagen reutilizable -- antes esta misma pieza (input file + preview +
// drag&drop + boton de quitar) estaba duplicada entera en addExc.ts y en el modal de
// admin.ts. Con el ejercicio pidiendo ahora DOS fotos opcionales (principio/ejecución) en
// ambos formularios, mantenerla copiada hubiera significado 4 copias casi identicas.

export interface ImageDropzoneOptions {
  /** Prefijo unico para los ids del DOM -- necesario para poder tener mas de un dropzone en el mismo formulario. */
  idPrefix: string;
  label: string;
  hint?: string;
  /** URL ya guardada (modo edición) -- se muestra como preview inicial. */
  currentUrl?: string | null;
}

export function imageDropzoneMarkup(opts: ImageDropzoneOptions): string {
  const { idPrefix, label, hint = "JPG, PNG o WEBP · hasta 2MB", currentUrl } = opts;
  const hasCurrent = !!currentUrl;
  return `
    <div class="field">
      <label for="${idPrefix}Input">${escapeHtml(label)}</label>
      <div class="dropzone ${hasCurrent ? "has-file" : ""}" id="${idPrefix}Zone">
        <input type="file" id="${idPrefix}Input" accept="image/*" class="dropzone-input" aria-label="${escapeHtml(label)}">
        <div class="dropzone-empty" id="${idPrefix}Empty" ${hasCurrent ? "hidden" : ""}>
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
          <p><strong>Hacé clic para subir</strong> o arrastrá una imagen acá</p>
          <span class="field-hint">${escapeHtml(hint)}</span>
        </div>
        <div class="dropzone-preview" id="${idPrefix}Preview" ${hasCurrent ? "" : "hidden"}>
          <img id="${idPrefix}PreviewImg" alt="" src="${hasCurrent ? escapeHtml(currentUrl!) : ""}">
          <span class="dropzone-filename" id="${idPrefix}FileName">${hasCurrent ? "Imagen actual" : ""}</span>
          <button type="button" class="dropzone-remove" id="${idPrefix}Remove" title="Quitar imagen">×</button>
        </div>
      </div>
    </div>
  `;
}

export interface ImageDropzoneHandle {
  /** El archivo nuevo elegido, o null si no se tocó nada o se quitó. */
  getFile(): File | null;
  /** true si había una imagen ya guardada (currentUrl) y el usuario la quitó sin elegir una nueva. */
  wasRemoved(): boolean;
  /** Libera el object URL de preview creado, si hay uno -- llamar al cerrar/desmontar el formulario. */
  cleanup(): void;
}

/** Engancha los listeners de un dropzone ya insertado en el DOM (ver imageDropzoneMarkup). */
export function wireImageDropzone(root: ParentNode, idPrefix: string): ImageDropzoneHandle {
  let selectedFile: File | null = null;
  let removed = false;
  let objectUrl: string | null = null;

  const zone = root.querySelector<HTMLElement>(`#${idPrefix}Zone`);
  const input = root.querySelector<HTMLInputElement>(`#${idPrefix}Input`);
  const empty = root.querySelector<HTMLElement>(`#${idPrefix}Empty`);
  const preview = root.querySelector<HTMLElement>(`#${idPrefix}Preview`);
  const previewImg = root.querySelector<HTMLImageElement>(`#${idPrefix}PreviewImg`);
  const fileName = root.querySelector<HTMLElement>(`#${idPrefix}FileName`);
  const removeBtn = root.querySelector<HTMLElement>(`#${idPrefix}Remove`);

  function showPreview(file: File): void {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    if (previewImg) previewImg.src = objectUrl;
    if (fileName) fileName.textContent = file.name;
    zone?.classList.add("has-file");
    empty?.setAttribute("hidden", "");
    preview?.removeAttribute("hidden");
    selectedFile = file;
    removed = false;
  }

  function clearPreview(): void {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    if (input) input.value = "";
    zone?.classList.remove("has-file");
    preview?.setAttribute("hidden", "");
    empty?.removeAttribute("hidden");
    selectedFile = null;
    removed = true;
  }

  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) showPreview(file);
  });
  removeBtn?.addEventListener("click", clearPreview);
  zone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("dragover");
  });
  zone?.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone?.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragover");
    const file = (event as DragEvent).dataTransfer?.files?.[0];
    if (file && input) {
      input.files = (event as DragEvent).dataTransfer!.files;
      showPreview(file);
    }
  });

  return {
    getFile: () => selectedFile,
    wasRemoved: () => removed,
    cleanup: () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
  };
}
