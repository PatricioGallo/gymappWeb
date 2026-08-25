import { escapeHtml } from "./dom";
import { CATEGORY_LABELS, EXERCISE_CATEGORIES, listExercises, type Exercise, type ExerciseCategory } from "../services/exercise.service";
import { openCreateExerciseModal } from "./createExerciseModal";
import type { ViewContext } from "../shell/viewContext";

const DUMBBELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7v10M18 7v10M2 9v6M22 9v6M6 12h12"/></svg>`;

/**
 * ctx es opcional (llamadores no migrados al shell todavia no lo tienen), pero si se pasa,
 * el listener de "Cerrar" se ata a ctx.signal.
 */
export function openExercisePicker(catalog: Exercise[], onSelect: (exc: Exercise) => void, userId: string, ctx?: ViewContext): void {
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
        </div>
        <div class="exc-pick-chips" id="excPickerChips">
          <button type="button" class="exc-pick-chip active" data-cat="">Todos</button>
          ${EXERCISE_CATEGORIES.map((cat) => `<button type="button" class="exc-pick-chip" data-cat="${cat}">${escapeHtml(CATEGORY_LABELS[cat])}</button>`).join("")}
        </div>
        <div class="exc-pick-results" id="excPickerResults"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="excPickerCreate">+ Crear ejercicio nuevo</button>
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
                  <span class="exc-pick-thumb">${exc.image_start_url || exc.image_execution_url ? `<img src="${escapeHtml(exc.image_start_url || exc.image_execution_url!)}" alt="" loading="lazy">` : DUMBBELL_ICON}</span>
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

  // Crear un ejercicio nuevo abre un modal en el lugar (openCreateExerciseModal), no una
  // pagina aparte -- antes esto navegaba a addExc.html en una pestaña nueva, pero en PWA/mobile
  // el target="_blank" no siempre abre una pestaña de verdad: a veces navega en la misma vista
  // y se perdia la rutina que se estaba armando. El modal comparte #loaderBody con este picker,
  // asi que al crear el ejercicio lo re-abrimos con el catalogo actualizado.
  document.getElementById("excPickerCreate")?.addEventListener("click", () => {
    openCreateExerciseModal(userId, null, ctx, () => {
      listExercises()
        .then((fresh) => {
          openExercisePicker(fresh, onSelect, userId, ctx);
        })
        .catch(() => {
          openExercisePicker(items, onSelect, userId, ctx);
        });
    });
  });

  function closePicker(): void {
    loaderBody!.innerHTML = "";
  }

  document.getElementById("excPickerClose")?.addEventListener("click", closePicker);
}
