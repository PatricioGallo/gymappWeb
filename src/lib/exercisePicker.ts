import { escapeHtml } from "./dom";
import {
  CATEGORY_LABELS,
  EXERCISE_CATEGORIES,
  listBuiltinExercises,
  listMyExercises,
  listExercisesByAuthorIds,
  listGlobalPublicExercises,
  type Exercise,
  type ExerciseCategory,
} from "../services/exercise.service";
import { openCreateExerciseModal } from "./createExerciseModal";
import { listFollowing } from "../services/follow.service";
import { listMyTrainers } from "../services/subscription.service";
import { listMyActiveGyms } from "../services/gymMember.service";
import type { ViewContext } from "../shell/viewContext";

const DUMBBELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7v10M18 7v10M2 9v6M22 9v6M6 12h12"/></svg>`;

type PickerTab = "gymsocial" | "propios" | "seguidos" | "global";
type PickerItem = Exercise & { authorName?: string | null };

const TAB_LABELS: Record<PickerTab, string> = {
  gymsocial: "Gym Social",
  propios: "Propios",
  seguidos: "Seguidos",
  global: "Global",
};
const TAB_ORDER: PickerTab[] = ["gymsocial", "propios", "seguidos", "global"];

const TAB_EMPTY_MESSAGES: Record<PickerTab, string> = {
  gymsocial: "No encontramos ejercicios del catálogo con ese criterio.",
  propios: "Todavía no creaste ningún ejercicio propio.",
  seguidos: "Tus seguidos, entrenadores y gimnasio todavía no compartieron ejercicios públicos.",
  global: "No encontramos ejercicios con ese criterio.",
};

/**
 * ctx es opcional (llamadores no migrados al shell todavia no lo tienen), pero si se pasa,
 * el listener de "Cerrar" se ata a ctx.signal.
 */
export function openExercisePicker(onSelect: (exc: Exercise) => void, userId: string, ctx?: ViewContext): void {
  // Cache por pestaña + set de "red" (seguidos/entrenadores/gimnasio) -- vive en este closure
  // para sobrevivir a un reopen() (ej. despues de crear un ejercicio nuevo desde el picker).
  const cache: Partial<Record<PickerTab, PickerItem[]>> = {};
  let networkIds: string[] | null = null;

  async function getNetworkIds(): Promise<string[]> {
    if (networkIds) return networkIds;
    const [following, trainers, gyms] = await Promise.all([
      listFollowing(userId).catch(() => []),
      listMyTrainers(userId).catch(() => []),
      listMyActiveGyms(userId).catch(() => []),
    ]);
    const ids = new Set<string>();
    following.forEach((f) => ids.add(f.id));
    trainers.forEach((t) => ids.add(t.id));
    gyms.forEach((g) => ids.add(g.id));
    ids.delete(userId);
    networkIds = [...ids];
    return networkIds;
  }

  async function loadTab(tab: PickerTab): Promise<PickerItem[]> {
    if (cache[tab]) return cache[tab]!;
    let data: PickerItem[];
    if (tab === "gymsocial") data = await listBuiltinExercises();
    else if (tab === "propios") data = await listMyExercises(userId);
    else if (tab === "global") data = await listGlobalPublicExercises();
    else {
      const ids = await getNetworkIds();
      data = ids.length ? await listExercisesByAuthorIds(ids) : [];
    }
    cache[tab] = data;
    return data;
  }

  function open(initialTab: PickerTab): void {
    const loaderBody = document.getElementById("loaderBody");
    if (!loaderBody) return;

    let activeTab = initialTab;
    let search = "";
    let activeCategory: ExerciseCategory | "" = "";
    let items: PickerItem[] = [];

    loaderBody.innerHTML = `
      <div class="success-check-container exc-pick-overlay">
        <div class="modal-card modal-card-lg exc-pick-modal-card">
          <h2>Elegir ejercicio</h2>
          <p class="subtitle">Buscá por nombre, filtrá por categoría, o mirá otra fuente.</p>
          <div class="exc-pick-tabs" id="excPickerTabs">
            ${TAB_ORDER.map((tab) => `<button type="button" class="exc-pick-tab${tab === activeTab ? " active" : ""}" data-tab="${tab}">${escapeHtml(TAB_LABELS[tab])}</button>`).join("")}
          </div>
          <div class="exc-pick-search-row">
            <input type="search" id="excPickerSearch" class="exc-picker-search" placeholder="Buscar ejercicio...">
          </div>
          <select id="excPickerCategory" class="exc-pick-category-select">
            <option value="">Todas las categorías</option>
            ${EXERCISE_CATEGORIES.map((cat) => `<option value="${cat}">${escapeHtml(CATEGORY_LABELS[cat])}</option>`).join("")}
          </select>
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
                    ${exc.authorName ? `<span class="exc-pick-author">${escapeHtml(exc.authorName)}</span>` : ""}
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

      resultsEl.innerHTML = sections || `<p class="exc-pick-empty">${escapeHtml(TAB_EMPTY_MESSAGES[activeTab])}</p>`;
    }

    async function switchTab(tab: PickerTab): Promise<void> {
      activeTab = tab;
      document.querySelectorAll("#excPickerTabs .exc-pick-tab").forEach((btn) => btn.classList.toggle("active", (btn as HTMLElement).dataset.tab === tab));
      resultsEl.innerHTML = `<div class="inline-loader"><div class="modern-spinner"></div><p>Cargando...</p></div>`;
      items = await loadTab(tab);
      render();
    }

    void switchTab(activeTab);

    document.getElementById("excPickerTabs")?.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".exc-pick-tab");
      if (!btn) return;
      void switchTab(btn.dataset.tab as PickerTab);
    });

    document.getElementById("excPickerSearch")?.addEventListener("input", (event) => {
      search = (event.target as HTMLInputElement).value;
      render();
    });

    document.getElementById("excPickerCategory")?.addEventListener("change", (event) => {
      activeCategory = (event.target as HTMLSelectElement).value as ExerciseCategory | "";
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

    // Crear un ejercicio nuevo abre un modal en el lugar (comparte #loaderBody con este picker,
    // asi que lo pisa) -- al guardar, reabrimos el picker ya en la pestaña "Propios" con el
    // catalogo de esa pestaña invalidado para que el ejercicio recien creado aparezca.
    document.getElementById("excPickerCreate")?.addEventListener("click", () => {
      openCreateExerciseModal(userId, null, ctx, () => {
        delete cache.propios;
        open("propios");
      });
    });

    function closePicker(): void {
      loaderBody!.innerHTML = "";
    }

    document.getElementById("excPickerClose")?.addEventListener("click", closePicker);
  }

  open("gymsocial");
}
