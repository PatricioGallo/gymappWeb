import { escapeHtml } from "./dom";

// Dropzone de un solo archivo (imagen o video) con click + arrastrar/soltar, mismo look que
// el .dropzone de addExc.ts / gymClassManageModal.ts. Lo usan los modales de publicidad del
// panel admin (creativo de campaña y logo de anunciante), que antes tenian un <input type=file>
// pelado. La subida la resuelve un callback que pasa quien lo usa (uploadAdMedia, etc).

export interface MediaDropzoneOptions {
  /** Prefijo unico para los ids del DOM. */
  idPrefix: string;
  label: string;
  /** Texto chico bajo el icono (formatos y limites). */
  hint: string;
  /** accept del <input type=file>. Default: imagen y video. */
  accept?: string;
  currentUrl?: string | null;
  currentType?: "image" | "video" | null;
}

export function mediaDropzoneMarkup(opts: MediaDropzoneOptions): string {
  const { idPrefix, label, hint, accept = "image/*,video/*", currentUrl = null, currentType = null } = opts;
  const has = !!currentUrl;
  const mediaHtml = has
    ? currentType === "video"
      ? `<video src="${escapeHtml(currentUrl!)}" muted></video>`
      : `<img src="${escapeHtml(currentUrl!)}" alt="">`
    : "";
  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <div class="dropzone ${has ? "has-file" : ""}" id="${idPrefix}Dz">
        <input type="file" id="${idPrefix}DzInput" accept="${accept}" class="dropzone-input" aria-label="${escapeHtml(label)}">
        <div class="dropzone-empty" id="${idPrefix}DzEmpty" ${has ? "hidden" : ""}>
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
          <p><strong>Hacé clic para subir</strong> o arrastrá un archivo acá</p>
          <span class="field-hint">${escapeHtml(hint)}</span>
        </div>
        <div class="dropzone-preview" id="${idPrefix}DzPreview" ${has ? "" : "hidden"}>
          <div class="dropzone-preview-media" id="${idPrefix}DzMedia">${mediaHtml}</div>
          <span class="dropzone-filename" id="${idPrefix}DzName">${has ? "Archivo actual" : ""}</span>
          <button type="button" class="dropzone-remove" id="${idPrefix}DzRemove" title="Quitar archivo">×</button>
        </div>
      </div>
    </div>
  `;
}

export interface MediaDropzoneHandle {
  /** Valor actual: url ya subida (o null) y su tipo. */
  getValue(): { url: string | null; mediaType: "image" | "video" | null };
}

export interface WireMediaDropzoneOptions {
  idPrefix: string;
  upload: (file: File) => Promise<{ url?: string; mediaType?: "image" | "video"; error?: string }>;
  onUploading?: () => void;
  onError?: (message: string) => void;
  onDone?: () => void;
  currentUrl?: string | null;
  currentType?: "image" | "video" | null;
}

/** Engancha un dropzone ya insertado en el DOM (ver mediaDropzoneMarkup, mismo idPrefix). */
export function wireMediaDropzone(root: ParentNode, opts: WireMediaDropzoneOptions): MediaDropzoneHandle {
  const { idPrefix, upload, onUploading, onError, onDone } = opts;
  let url: string | null = opts.currentUrl ?? null;
  let mediaType: "image" | "video" | null = opts.currentType ?? null;

  const dz = root.querySelector<HTMLElement>(`#${idPrefix}Dz`)!;
  const input = root.querySelector<HTMLInputElement>(`#${idPrefix}DzInput`)!;
  const empty = root.querySelector<HTMLElement>(`#${idPrefix}DzEmpty`)!;
  const preview = root.querySelector<HTMLElement>(`#${idPrefix}DzPreview`)!;
  const media = root.querySelector<HTMLElement>(`#${idPrefix}DzMedia`)!;
  const nameEl = root.querySelector<HTMLElement>(`#${idPrefix}DzName`)!;

  async function handle(file: File): Promise<void> {
    onUploading?.();
    const res = await upload(file);
    if (res.error || !res.url) {
      onError?.(res.error || "No se pudo subir el archivo.");
      return;
    }
    url = res.url;
    mediaType = res.mediaType ?? "image";
    media.innerHTML =
      mediaType === "video" ? `<video src="${escapeHtml(url)}" muted></video>` : `<img src="${escapeHtml(url)}" alt="">`;
    nameEl.textContent = file.name;
    dz.classList.add("has-file");
    empty.hidden = true;
    preview.hidden = false;
    onDone?.();
  }

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void handle(file);
  });
  dz.addEventListener("dragover", (event) => {
    event.preventDefault();
    dz.classList.add("dragover");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", (event) => {
    event.preventDefault();
    dz.classList.remove("dragover");
    const file = (event as DragEvent).dataTransfer?.files?.[0];
    if (file) void handle(file);
  });
  root.querySelector<HTMLButtonElement>(`#${idPrefix}DzRemove`)?.addEventListener("click", (event) => {
    event.stopPropagation();
    url = null;
    mediaType = null;
    input.value = "";
    media.innerHTML = "";
    nameEl.textContent = "";
    dz.classList.remove("has-file");
    preview.hidden = true;
    empty.hidden = false;
  });

  return { getValue: () => ({ url, mediaType }) };
}
