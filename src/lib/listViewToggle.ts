// Toggle "Filas / Retrato" compartido por las listas de personas (Tus alumnos, Tus socios,
// Tus entrenadores). "Filas" es la vista de siempre: tarjetas de ancho completo con todo el
// detalle. "Retrato" pinta la misma lista como una grilla de tarjetas verticales con los datos
// clave -- es puro CSS (una clase `is-portrait` sobre el contenedor de la lista), asi que
// cambiar de modo no re-renderiza nada y la clase sobrevive a los innerHTML de cada re-búsqueda.
// La preferencia se guarda por lista en localStorage.

export type ListView = "rows" | "portrait";

const STORAGE_PREFIX = "gymapp:listView:";

function readStored(key: string): ListView {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === "portrait" ? "portrait" : "rows";
  } catch {
    return "rows";
  }
}

function writeStored(key: string, view: ListView): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, view);
  } catch {
    // Modo incógnito / storage bloqueado: el toggle sigue funcionando, solo no se recuerda.
  }
}

const ROWS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
const PORTRAIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="7" height="9" rx="1.5"/><rect x="13" y="3" width="7" height="9" rx="1.5"/><rect x="4" y="14" width="7" height="7" rx="1.5"/><rect x="13" y="14" width="7" height="7" rx="1.5"/></svg>`;

interface ListViewToggleOptions {
  /** Sufijo de la clave de localStorage, único por lista (ej. "alumnos", "socios"). */
  storageKey: string;
  /** El `.search-page-list` sobre el que se agrega/saca la clase `is-portrait`. */
  listEl: HTMLElement;
  /** Contenedor vacío donde se dibuja el control. */
  mountEl: HTMLElement;
  signal?: AbortSignal;
  onChange?: (view: ListView) => void;
}

export interface ListViewToggleHandle {
  get: () => ListView;
  /** Re-aplica la clase y el estado de los botones (por si algo pisó el DOM). */
  apply: () => void;
}

export function initListViewToggle(opts: ListViewToggleOptions): ListViewToggleHandle {
  const { storageKey, listEl, mountEl, signal, onChange } = opts;
  let view = readStored(storageKey);

  mountEl.classList.add("list-view-toggle");
  mountEl.setAttribute("role", "group");
  mountEl.setAttribute("aria-label", "Cómo ver la lista");
  mountEl.innerHTML = `
    <button type="button" data-view="rows" aria-label="Ver como filas">${ROWS_ICON}<span>Filas</span></button>
    <button type="button" data-view="portrait" aria-label="Ver como retrato">${PORTRAIT_ICON}<span>Retrato</span></button>
  `;

  const buttons = [...mountEl.querySelectorAll<HTMLButtonElement>("button[data-view]")];

  function apply(): void {
    listEl.classList.toggle("is-portrait", view === "portrait");
    buttons.forEach((b) => {
      const active = b.dataset.view === view;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
  }

  buttons.forEach((b) => {
    b.addEventListener(
      "click",
      () => {
        const next = b.dataset.view as ListView;
        if (next === view) return;
        view = next;
        writeStored(storageKey, view);
        apply();
        onChange?.(view);
      },
      signal ? { signal } : undefined
    );
  });

  apply();
  return { get: () => view, apply };
}
