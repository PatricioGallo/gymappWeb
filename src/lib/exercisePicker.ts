import { escapeHtml } from "./dom";
import { CATEGORY_LABELS, EXERCISE_CATEGORIES, listExercises, type Exercise, type ExerciseCategory } from "../services/exercise.service";
import type { ViewContext } from "../shell/viewContext";

const DUMBBELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7v10M18 7v10M2 9v6M22 9v6M6 12h12"/></svg>`;

/**
 * ctx es opcional (llamadores no migrados al shell todavia no lo tienen), pero si se pasa,
 * los listeners globales de focus/visibilitychange se atan a ctx.signal -- si la vista que
 * abrio el picker se desmonta/oculta sin que el usuario lo cierre, no quedan escuchando
 * indefinidamente en segundo plano (ademas el router ya limpia visualmente #loaderBody al
 * navegar, asi que esto es solo para no dejar el listener colgado).
 */
export function openExercisePicker(catalog: Exercise[], onSelect: (exc: Exercise) => void, ctx?: ViewContext): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  let search = "";
  let activeCategory: ExerciseCategory | "" = "";
  let items = catalog;

  loaderBody.innerHTML = `
    <div class="success-check-container exc-pick-overlay">
      <div class="modal-card modal-card-lg exc-pick-modal-card">
        <h2>Elegir ejercicio</h2>
        <p class="subtitle">Buscá por nombre o filtrá por categoría.</p>
        <div class="exc-pick-search-row">
          <input type="search" id="excPickerSearch" class="exc-picker-search" placeholder="Buscar ejercicio...">
          <button type="button" class="exc-pick-refresh" id="excPickerRefresh" title="Actualizar catálogo">↻</button>
        </div>
        <div class="exc-pick-chips" id="excPickerChips">
          <button type="button" class="exc-pick-chip active" data-cat="">Todos</button>
          ${EXERCISE_CATEGORIES.map((cat) => `<button type="button" class="exc-pick-chip" data-cat="${cat}">${escapeHtml(CATEGORY_LABELS[cat])}</button>`).join("")}
        </div>
        <div class="exc-pick-results" id="excPickerResults"></div>
        <div class="modal-actions">
          <a href="addExc.html" target="_blank" rel="noopener" class="btn btn-outline" id="excPickerCreate">+ Crear ejercicio nuevo</a>
          <button class="btn btn-outline" id="excPickerClose" type="button">Cerrar</button>
        </div>
      </div>
    </div>
  `;

  const resultsEl = document.getElementById("excPickerResults")!;

  function render(): void {
    const term = search.trim().toLowerCase();
    const categories = activeCategory ? [activeCategory] : EXERCISE_CATEGORIES;

    const sections = categories
      .map((cat) => {
        const catItems = items.filter((exc) => exc.category === cat && exc.name.toLowerCase().includes(term));
        if (catItems.length === 0) return "";
        return `
          <div class="exc-pick-section">
            <h4>${escapeHtml(CATEGORY_LABELS[cat])}</h4>
            <div class="exc-pick-grid">
              ${catItems
                .map(
                  (exc) => `
                <button type="button" class="exc-pick-card" data-id="${exc.id}">
                  <span class="exc-pick-thumb">${exc.image_url ? `<img src="${escapeHtml(exc.image_url)}" alt="" loading="lazy">` : DUMBBELL_ICON}</span>
                  <span class="exc-pick-name">${escapeHtml(exc.name)}</span>
                </button>
              `
                )
                .join("")}
            </div>
          </div>
        `;
      })
      .filter(Boolean)
      .join("");

    resultsEl.innerHTML = sections || `<p class="exc-pick-empty">No encontramos ejercicios con ese nombre.</p>`;
  }

  render();

  document.getElementById("excPickerSearch")?.addEventListener("input", (event) => {
    search = (event.target as HTMLInputElement).value;
    render();
  });

  document.getElementById("excPickerChips")?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-chip");
    if (!btn) return;
    activeCategory = (btn.dataset.cat as ExerciseCategory) || "";
    document.querySelectorAll("#excPickerChips .exc-pick-chip").forEach((chip) => chip.classList.remove("active"));
    btn.classList.add("active");
    render();
  });

  resultsEl.addEventListener("click", (event) => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-card");
    if (!card) return;
    const exc = items.find((item) => item.id === card.dataset.id);
    if (!exc) return;
    onSelect(exc);
    closePicker();
  });

  // El "+ Crear ejercicio nuevo" abre addExc.html en una pestaña aparte para no
  // perder la rutina que se esta armando; al volver el foco a esta pestaña,
  // refrescamos el catalogo para que el ejercicio recien creado ya aparezca.
  function refreshCatalog(): void {
    listExercises()
      .then((fresh) => {
        items = fresh.sort((a, b) => a.name.localeCompare(b.name));
        render();
      })
      .catch(() => {
        // si falla el refresco seguimos mostrando el catalogo que ya teniamos
      });
  }
  function onVisible(): void {
    if (document.visibilityState === "visible") refreshCatalog();
  }
  // "focus"/"visibilitychange" cubren la vuelta desde la pestaña de creación,
  // pero no son 100% consistentes entre navegadores: el botón de al lado del
  // buscador es el respaldo manual.
  window.addEventListener("focus", refreshCatalog, ctx ? { signal: ctx.signal } : undefined);
  document.addEventListener("visibilitychange", onVisible, ctx ? { signal: ctx.signal } : undefined);
  document.getElementById("excPickerRefresh")?.addEventListener("click", refreshCatalog);

  function closePicker(): void {
    window.removeEventListener("focus", refreshCatalog);
    document.removeEventListener("visibilitychange", onVisible);
    loaderBody!.innerHTML = "";
  }

  document.getElementById("excPickerClose")?.addEventListener("click", closePicker);
}
