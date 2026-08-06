import { escapeHtml } from "./dom";

interface UploaderItem {
  id: string;
  kind: "existing" | "new";
  file?: File;
  path?: string;
  previewUrl: string;
}

/** HTML de un selector multi-imagen (hasta `maxFiles`), con grilla de miniaturas y botón "+". Wirealo con `MultiImageUploader`. */
export function renderMultiImageUploader(containerId: string, maxFiles: number): string {
  return `
    <div class="verify-doc-uploader" id="${containerId}">
      <input type="file" id="${containerId}Input" class="verify-doc-input" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <div class="verify-doc-grid" id="${containerId}Grid"></div>
      <p class="field-hint">JPG, PNG o WEBP · hasta 5MB cada una · máximo ${maxFiles} fotos</p>
    </div>
  `;
}

export class MultiImageUploader {
  private items: UploaderItem[] = [];
  private grid: HTMLElement;
  private input: HTMLInputElement;

  constructor(
    private containerId: string,
    private maxFiles: number
  ) {
    this.grid = document.getElementById(`${containerId}Grid`)!;
    this.input = document.getElementById(`${containerId}Input`) as HTMLInputElement;

    this.input.addEventListener("change", () => {
      const files = Array.from(this.input.files ?? []);
      for (const file of files) {
        if (this.items.length >= this.maxFiles) break;
        this.items.push({ id: crypto.randomUUID(), kind: "new", file, previewUrl: URL.createObjectURL(file) });
      }
      this.input.value = "";
      this.render();
    });

    this.render();
  }

  /** Precarga documentos ya subidos (para reenvío tras rechazo), con su URL firmada ya resuelta. */
  seedExisting(items: { path: string; url: string }[]): void {
    for (const { path, url } of items) {
      if (this.items.length >= this.maxFiles) break;
      this.items.push({ id: crypto.randomUUID(), kind: "existing", path, previewUrl: url });
    }
    this.render();
  }

  getNewFiles(): File[] {
    return this.items.filter((i) => i.kind === "new").map((i) => i.file!);
  }

  getExistingPaths(): string[] {
    return this.items.filter((i) => i.kind === "existing").map((i) => i.path!);
  }

  get count(): number {
    return this.items.length;
  }

  private render(): void {
    const canAddMore = this.items.length < this.maxFiles;
    this.grid.innerHTML =
      this.items
        .map(
          (item) => `
        <div class="verify-doc-item" data-id="${item.id}">
          <img src="${escapeHtml(item.previewUrl)}" alt="">
          <button type="button" class="verify-doc-remove" data-id="${item.id}" title="Quitar" aria-label="Quitar foto">×</button>
        </div>
      `
        )
        .join("") +
      (canAddMore
        ? `<button type="button" class="verify-doc-add-tile" id="${this.containerId}AddTile" aria-label="Agregar foto">
             <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
           </button>`
        : "");

    this.grid.querySelectorAll<HTMLButtonElement>(".verify-doc-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = this.items.find((i) => i.id === btn.dataset.id);
        if (item?.kind === "new") URL.revokeObjectURL(item.previewUrl);
        this.items = this.items.filter((i) => i.id !== btn.dataset.id);
        this.render();
      });
    });

    document.getElementById(`${this.containerId}AddTile`)?.addEventListener("click", () => this.input.click());
  }
}
