import { escapeHtml } from "./dom";

export interface ConfirmDialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo del botón de confirmar: rojo (acción destructiva) en vez del acento normal. */
  danger?: boolean;
}

/**
 * Reemplazo del confirm() nativo del navegador (feo, sin el diseño de la web) usando el mismo
 * overlay .success-check-container + .modal-card que ya usan el resto de los modales de la
 * app. Se monta en un <div> propio directo en <body> (no dentro de #loaderBody) para poder
 * abrirse arriba de un modal que ya esté abierto (ej. "Info del grupo") sin pisar su estado.
 */
export function confirmDialog(message: string, opts: ConfirmDialogOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "success-check-container";
    overlay.innerHTML = `
      <div class="modal-card">
        ${opts.title ? `<h2>${escapeHtml(opts.title)}</h2>` : ""}
        <p class="subtitle">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="confirmDialogCancel">${escapeHtml(opts.cancelLabel ?? "Cancelar")}</button>
          <button type="button" class="btn ${opts.danger ? "btn-danger" : "btn-primary"}" id="confirmDialogConfirm">${escapeHtml(opts.confirmLabel ?? "Aceptar")}</button>
        </div>
      </div>
    `;
    overlay.style.zIndex = "1100";
    document.body.appendChild(overlay);

    function close(result: boolean): void {
      overlay.remove();
      resolve(result);
    }

    overlay.querySelector("#confirmDialogCancel")?.addEventListener("click", () => close(false));
    overlay.querySelector("#confirmDialogConfirm")?.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
  });
}
