import type { ViewModule } from "../shell/router";
import { navigate } from "../shell/router";
import { listExercises, type Exercise } from "../services/exercise.service";
import { createRoutine, getRoutineDetail, type NewDayInput } from "../services/routine.service";
import { listRoutines, listPublicRoutinesForUsers, getProfileBasicById, type RoutineWithCounts } from "../services/profile.service";
import { listFollowing } from "../services/follow.service";
import { listMyTrainers } from "../services/subscription.service";
import { escapeHtml } from "../lib/dom";
import { DIA_LABELS, diaLabel, formatFechaCorta } from "../lib/dias";
import { openExercisePicker } from "../lib/exercisePicker";
import { ROUTINE_TEMPLATES, LEVEL_LABELS, type RoutineTemplate } from "../lib/routineTemplates";
import { formatRepe } from "../lib/reps";

const VIEW_MARKUP = `
  <section class="auth-section">
    <div class="container">
      <div class="auth-card reveal">
        <span class="eyebrow">Nueva rutina</span>
        <h1>Cargando...</h1>
      </div>
    </div>
  </section>
`;

const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;

function visibilityFieldMarkup(id: string): string {
  return `
    <div class="field">
      <label for="${id}">Visibilidad de la rutina</label>
      <select id="${id}">
        <option value="true">Pública</option>
        <option value="false" selected>Privada</option>
      </select>
    </div>`;
}

function readVisibilityField(id: string, root: ParentNode = document): boolean {
  return (root.querySelector(`#${id}`) as HTMLSelectElement).value === "true";
}

function tplDaysPreviewMarkup(
  days: { dia_semana: number; titulo?: string; items: { nombre: string; serie: number; repe: number; repeMax?: number | null }[] }[]
): string {
  return `
    <div class="tpl-days">
      ${days
        .map(
          (d) => `
        <div class="tpl-day">
          <h4>${escapeHtml(diaLabel(d.dia_semana))}${d.titulo ? ` · ${escapeHtml(d.titulo)}` : ""}</h4>
          <ul>${d.items.map((e) => `<li>${escapeHtml(e.nombre)}<span>${e.serie}x${formatRepe(e.repe, e.repeMax)}</span></li>`).join("")}</ul>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function templateCardMarkup(t: RoutineTemplate): string {
  return `
    <div class="routine-card reveal">
      <span class="routine-started-tag">${escapeHtml(LEVEL_LABELS[t.level])}</span>
      <h3>${escapeHtml(t.label)}</h3>
      <p class="subtitle">${escapeHtml(t.description)}</p>
      <div class="routine-stats">
        <div><span>Días por semana</span><strong>${t.dias.length}</strong></div>
        <div><span>Semanas sugeridas</span><strong>${t.semanasSugeridas}</strong></div>
      </div>
      <div class="routine-actions">
        <button type="button" class="btn btn-primary btn-sm useTemplateBtn" data-level="${t.level}">Ver y usar</button>
      </div>
    </div>
  `;
}

function ownRoutineCardMarkup(r: RoutineWithCounts): string {
  const tag = r.finalizada_at
    ? `<span class="routine-finished-tag">Finalizada el ${escapeHtml(formatFechaCorta(r.finalizada_at))}</span>`
    : `<span class="routine-started-tag">Iniciada el ${escapeHtml(formatFechaCorta(r.fecha_inicio))}</span>`;

  return `
    <div class="routine-card reveal">
      ${tag}
      <h3>${escapeHtml(r.nombre)}</h3>
      <div class="routine-stats">
        <div><span>Semanas</span><strong>${r.semanasCount}</strong></div>
        <div><span>Días por semana</span><strong>${r.diasPorSemana}</strong></div>
        <div><span>Ejercicios</span><strong>${r.ejerciciosCount}</strong></div>
      </div>
      <div class="routine-actions">
        <button type="button" class="btn btn-outline btn-sm useOwnBtn" data-id="${r.id}">Usar como base</button>
      </div>
    </div>
  `;
}

function networkRoutineCardMarkup(r: RoutineWithCounts, ownerName: string): string {
  return `
    <div class="routine-card reveal">
      <span class="routine-started-tag">Iniciada el ${escapeHtml(formatFechaCorta(r.fecha_inicio))}</span>
      <h3>${escapeHtml(r.nombre)}</h3>
      ${ownerName ? `<p class="subtitle">De ${escapeHtml(ownerName)}</p>` : ""}
      <div class="routine-stats">
        <div><span>Semanas</span><strong>${r.semanasCount}</strong></div>
        <div><span>Días por semana</span><strong>${r.diasPorSemana}</strong></div>
        <div><span>Ejercicios</span><strong>${r.ejerciciosCount}</strong></div>
      </div>
      <div class="routine-actions">
        <button type="button" class="btn btn-outline btn-sm useNetworkBtn" data-id="${r.id}" data-owner="${r.user_id}">Usar como base</button>
      </div>
    </div>
  `;
}

function excBlockMarkup(): string {
  return `
    <div class="exc-block exc-block-create">
      <div class="exc-top-row">
        <div class="exc-reorder">
          <button type="button" class="exc-move-up" title="Subir">▲</button>
          <button type="button" class="exc-move-down" title="Bajar">▼</button>
        </div>
        <button type="button" class="exc-picker-btn">Elegir ejercicio</button>
        <input type="hidden" class="excSelectInput" value="">
        <button class="exc-remove" type="button" title="Quitar ejercicio">×</button>
      </div>
      <div class="exc-fields-row">
        <label class="exc-field exc-field-series">
          <span class="exc-field-label">Series</span>
          <input type="number" class="mini-input serieInput" placeholder="Ej: 3" min="1" max="10">
        </label>
        <span class="exc-field-sep" aria-hidden="true">x</span>
        <label class="exc-field exc-field-repe">
          <span class="exc-field-label">Repeticiones</span>
          <input type="number" class="mini-input repeInput" placeholder="Ej: 10" min="1" max="30">
        </label>
        <span class="exc-field-sep" aria-hidden="true">-</span>
        <label class="exc-field exc-field-hasta">
          <span class="exc-field-label">Hasta <em>(opcional)</em></span>
          <input type="number" class="mini-input repeMaxInput" placeholder="Rango" min="1" max="30" title="Completá esto solo si querés un rango de repeticiones (ej: 5 a 7)">
        </label>
      </div>
      <div class="exc-extra">
        <label><input type="checkbox" class="noWeightCheck"> Sin peso</label>
        <label><input type="checkbox" class="mismoPesoCheck" checked> Mismo peso en todas las series</label>
        <input type="text" class="notaInput" placeholder="Nota para este ejercicio (opcional)" maxlength="140">
      </div>
    </div>
  `;
}

function openBuilderHelp(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>¿Cómo cargo los ejercicios?</h2>
        <p class="subtitle">Guía rápida para armar el día de entrenamiento.</p>
        <div class="help-list">
          <div class="help-item">
            <strong>Nombre del día</strong>
            <p>Viene precargado como Lunes, Martes, etc. Si no entrenás en días fijos, borralo y escribí lo que quieras (por ejemplo "Día 1" o "Día de pierna").</p>
          </div>
          <div class="help-item">
            <strong>Elegir ejercicio</strong>
            <p>Tocá el botón para buscar en el catálogo por nombre o categoría.</p>
          </div>
          <div class="help-item">
            <strong>Series x Repeticiones</strong>
            <p>Cuántas series vas a hacer y cuántas repeticiones en cada una.</p>
          </div>
          <div class="help-item">
            <strong>Hasta (opcional)</strong>
            <p>Completalo solo si preferís dejar un rango de repeticiones, por ejemplo "8 a 12" en vez de un número fijo.</p>
          </div>
          <div class="help-item">
            <strong>Sin peso</strong>
            <p>Tildalo si el ejercicio no usa peso, como una elongación o un ejercicio de movilidad.</p>
          </div>
          <div class="help-item">
            <strong>Mismo peso en todas las series</strong>
            <p>Tildado, vas a cargar un solo peso para todo el ejercicio. Destildalo si querés anotar un peso distinto en cada serie.</p>
          </div>
          <div class="help-item">
            <strong>Nota</strong>
            <p>Un mensaje opcional para quien entrene con esta rutina, como una indicación de técnica.</p>
          </div>
          <div class="help-item">
            <strong>Visibilidad de la rutina</strong>
            <p>Pública: otros usuarios con perfil público la pueden ver. Privada: solo la vas a ver vos.</p>
          </div>
        </div>
        <div class="modal-actions"><button class="btn btn-outline" id="closeBuilderHelp">Entendido</button></div>
      </div>
    </div>
  `;
  document.getElementById("closeBuilderHelp")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });
}

function updateMoveButtons(list: Element): void {
  const blocks = list.querySelectorAll(".exc-block");
  blocks.forEach((block, i) => {
    block.querySelector<HTMLButtonElement>(".exc-move-up")!.disabled = i === 0;
    block.querySelector<HTMLButtonElement>(".exc-move-down")!.disabled = i === blocks.length - 1;
  });
}

function dayCardMarkup(dayIndex: number): string {
  const defaultDia = (dayIndex % 7) + 1;
  return `
    <div class="day-card reveal" data-day="${dayIndex}" data-dia-semana="${defaultDia}">
      <input type="text" class="day-name-input" value="${DIA_LABELS[dayIndex % 7]}" maxlength="40">
      <div class="exc-list">${excBlockMarkup()}</div>
      <button class="day-add-btn" type="button">+ Agregar ejercicio</button>
    </div>
  `;
}

// mount() define render() (arma el DOM entero desde cero para cada combinacion de
// ?uid=/?mode=/?cloneFrom=/?copyFrom= -- son 4 flujos de entrada distintos, no hay estado fino
// que preservar entre uno y otro) y la deja referenciada aca para que update() la reuse.
let updateHandler: ((params: URLSearchParams) => void) | null = null;

export const rutinsView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const myId = authUserId!; // la ruta se registra con requiresAuth:true

    // El router mantiene esta instancia viva (oculta) al navegar a otra vista, pero llama a
    // update() -> render() de nuevo cada vez que se vuelve. Si los params son los mismos que la
    // ultima vez, es solo "el usuario volvio a esta misma vista" (ej. entro a otra pagina y
    // aprieto atras) -- reconstruir todo de cero ahi tiraria el dia/ejercicios que ya cargo. Solo
    // reconstruimos cuando params realmente cambia (ej. otro ?cloneFrom=, otro ?uid=).
    let lastParamsKey: string | null = null;

    async function render(p: URLSearchParams): Promise<void> {
      const paramsKey = p.toString();
      if (paramsKey === lastParamsKey) return;
      lastParamsKey = paramsKey;

      container.innerHTML = VIEW_MARKUP;
      const contentEl = container.querySelector(".container") as HTMLElement;

      const targetUserId = p.get("uid") ?? myId;
      // Un entrenador arma una plantilla propia (mode=template) o clona una guardada
      // directo hacia un alumno (cloneFrom, siempre junto con ?uid=<alumno>).
      const isTemplateMode = p.get("mode") === "template";
      const cloneFromId = p.get("cloneFrom");
      // Copiar la rutina activa (publica) de otro perfil: siempre para uno mismo,
      // nunca junto a ?uid=, y siempre cae en Guardadas (nunca se activa de una) via
      // isActivating=false en openClonePreview.
      const copyFromId = p.get("copyFrom");
      const isAssigningToOther = targetUserId !== myId;

      // Nadie elige explicitamente "plantilla vs rutina" en el flujo normal: toda
      // rutina que se arma de cero (fuera de activar una guardada, o del mode=template
      // explicito del entrenador para armar una plantilla a proposito) se guarda como
      // plantilla y se pregunta si se quiere activar ya (ver createAndFinish). Aplica
      // a entrenador, usuario y admin por igual; gimnasio/colaborador no pasan por
      // este flujo de creacion de rutinas propias.
      const myProfile = await getProfileBasicById(myId).catch(() => null);
      const autoSaveAsTemplate = myProfile?.user_type === "usuario" || myProfile?.user_type === "admin" || myProfile?.user_type === "entrenador";

      let excCatalog: Exercise[] = await listExercises();
      excCatalog.sort((a, b) => a.name.localeCompare(b.name));

      let assignTargetName: string | null = null;
      if (isAssigningToOther) {
        const target = await getProfileBasicById(targetUserId).catch(() => null);
        assignTargetName = target?.nombre ?? null;
      }

      // ---------- Paso 0: elegir cómo armar la rutina ----------

      function renderChooser(): void {
        contentEl.innerHTML = `
          <div class="section-head reveal">
            <span class="eyebrow">${isTemplateMode ? "Nueva plantilla" : "Nueva rutina"}</span>
            <h1>¿Cómo querés armarla?</h1>
            <p>${
              isTemplateMode
                ? "Queda guardada en tu perfil para asignarla a tus alumnos cuando quieras."
                : "Podés empezar de cero o elegir una rutina ya armada como base."
            }</p>
          </div>
          <div class="quick-grid quick-grid-2 reveal">
            <button type="button" class="quick-card" id="chooseScratch">
              <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></div>
              <div><h3>Empezar desde cero</h3><p>Elegís vos cada ejercicio, serie y repetición</p></div>
            </button>
            <button type="button" class="quick-card" id="chooseBrowse">
              <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg></div>
              <div><h3>Ver rutinas</h3><p>Rutinas de Gym Social, de gente que seguís o tuyas propias</p></div>
            </button>
          </div>
        `;

        contentEl.querySelector("#chooseScratch")?.addEventListener("click", () => renderSetupForm());
        contentEl.querySelector("#chooseBrowse")?.addEventListener("click", () => renderBrowseRoutines());
      }

      // ---------- Ver rutinas ----------

      type BrowseTab = "social" | "mine" | "friends";
      let browseTab: BrowseTab = "social";

      function browseTabsMarkup(): string {
        const tabs: { id: BrowseTab; label: string }[] = [
          { id: "social", label: "Gym Social" },
          { id: "mine", label: "Tus rutinas" },
          { id: "friends", label: "Seguidos y gimnasio" },
        ];
        return `
          <div class="routine-tabs" id="browseTabs">
            ${tabs.map((t) => `<button type="button" class="routine-tab${t.id === browseTab ? " active" : ""}" data-tab="${t.id}">${t.label}</button>`).join("")}
          </div>
        `;
      }

      function renderBrowseRoutines(): void {
        contentEl.innerHTML = `
          <a href="#" class="back-link" id="backToChooser">${BACK_ICON}Volver</a>
          <div class="section-head reveal">
            <span class="eyebrow">Nueva rutina</span>
            <h1>Ver rutinas</h1>
            <p>Elegí una rutina como base. Después vas a poder ajustarla a tu gusto.</p>
          </div>
          ${browseTabsMarkup()}
          <div id="browseContent"></div>
        `;

        contentEl.querySelector("#backToChooser")?.addEventListener("click", (event) => {
          event.preventDefault();
          renderChooser();
        });

        contentEl.querySelector("#browseTabs")?.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
          btn.addEventListener("click", () => {
            browseTab = btn.dataset.tab as BrowseTab;
            contentEl.querySelector("#browseTabs")!.querySelectorAll(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
            void renderBrowseContent();
          });
        });

        void renderBrowseContent();
      }

      async function renderBrowseContent(): Promise<void> {
        const content = contentEl.querySelector("#browseContent");
        if (!content) return;

        if (browseTab === "social") {
          content.innerHTML = `<div class="routine-grid">${ROUTINE_TEMPLATES.map(templateCardMarkup).join("")}</div>`;
          content.querySelectorAll<HTMLButtonElement>(".useTemplateBtn").forEach((btn) => {
            btn.addEventListener("click", () => {
              const template = ROUTINE_TEMPLATES.find((t) => t.level === btn.dataset.level);
              if (template) openTemplatePreview(template);
            });
          });
          return;
        }

        if (browseTab === "friends") {
          content.innerHTML = `<p class="subtitle">Buscando rutinas públicas de tus seguidos...</p>`;

          const [following, trainers] = await Promise.all([listFollowing(targetUserId).catch(() => []), listMyTrainers(targetUserId).catch(() => [])]);

          const ownerById = new Map<string, string>();
          following.forEach((f) => ownerById.set(f.id, `${f.nombre} ${f.apellido}`.trim()));
          trainers.forEach((t) => ownerById.set(t.id, `${t.nombre} ${t.apellido}`.trim()));

          const networkIds = [...ownerById.keys()];

          if (networkIds.length === 0) {
            content.innerHTML = `
              <div class="empty-state reveal">
                <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
                <h3>Todavía no seguís a nadie</h3>
                <p>Cuando sigas a alguien o te suscribas a un entrenador, sus rutinas públicas van a aparecer acá.</p>
              </div>
            `;
            return;
          }

          const publicRoutines = await listPublicRoutinesForUsers(networkIds).catch(() => []);

          if (publicRoutines.length === 0) {
            content.innerHTML = `
              <div class="empty-state reveal">
                <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
                <h3>Nada por acá todavía</h3>
                <p>Tus seguidos y tu entrenador no tienen rutinas públicas activas por el momento.</p>
              </div>
            `;
            return;
          }

          content.innerHTML = `<div class="routine-grid">${publicRoutines.map((r) => networkRoutineCardMarkup(r, ownerById.get(r.user_id) ?? "")).join("")}</div>`;
          content.querySelectorAll<HTMLButtonElement>(".useNetworkBtn").forEach((btn) => {
            btn.addEventListener("click", () => {
              if (btn.dataset.id) void openClonePreview(btn.dataset.id, false, btn.dataset.owner);
            });
          });
          return;
        }

        content.innerHTML = `<p class="subtitle">Cargando tus rutinas...</p>`;
        const [active, historic] = await Promise.all([listRoutines(targetUserId, "active"), listRoutines(targetUserId, "historic")]);
        const mine = [...active, ...historic];

        if (mine.length === 0) {
          content.innerHTML = `
            <div class="empty-state reveal">
              <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div>
              <h3>Todavía no tenés rutinas propias</h3>
              <p>Cuando crees tu primera rutina, la vas a poder reutilizar como base acá.</p>
            </div>
          `;
          return;
        }

        content.innerHTML = `<div class="routine-grid">${mine.map(ownRoutineCardMarkup).join("")}</div>`;
        content.querySelectorAll<HTMLButtonElement>(".useOwnBtn").forEach((btn) => {
          btn.addEventListener("click", () => {
            if (btn.dataset.id) void openClonePreview(btn.dataset.id);
          });
        });
      }

      function resolveTemplateDays(t: RoutineTemplate): NewDayInput[] | null {
        const dias: NewDayInput[] = [];
        for (const day of t.dias) {
          const ejercicios: NewDayInput["ejercicios"] = [];
          day.ejercicios.forEach((item, orden) => {
            const excDef = excCatalog.find((exc) => exc.name === item.name);
            if (!excDef) return;
            ejercicios.push({
              exercise_id: excDef.id,
              nombre_snapshot: excDef.name,
              info_snapshot: excDef.info,
              serie: item.serie,
              repe: item.repe,
              repe_max: null,
              nota: item.nota ?? "",
              es_medible: item.es_medible ?? true,
              mismo_peso: true,
              orden,
            });
          });
          if (ejercicios.length === 0) return null;
          dias.push({ dia_semana: day.dia_semana, nombre: day.titulo ?? null, ejercicios });
        }
        return dias;
      }

      function openTemplatePreview(t: RoutineTemplate): void {
        const loaderBody = document.getElementById("loaderBody")!;
        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="modal-card modal-card-lg">
              <span class="hero-badge">${escapeHtml(LEVEL_LABELS[t.level])}</span>
              <h2>${escapeHtml(t.label)}</h2>
              <p class="subtitle">${escapeHtml(t.description)}</p>
              ${tplDaysPreviewMarkup(t.dias.map((d) => ({ dia_semana: d.dia_semana, titulo: d.titulo, items: d.ejercicios.map((e) => ({ nombre: e.name, serie: e.serie, repe: e.repe, repeMax: null })) })))}
              <form id="tplUseForm" novalidate>
                <div class="field"><label for="tplName">Nombre de la rutina</label><input type="text" id="tplName" value="${escapeHtml(t.label)}"></div>
                <div class="field"><label for="tplWeeks">Semanas</label><input type="number" id="tplWeeks" min="1" max="10" value="${t.semanasSugeridas}"></div>
                ${visibilityFieldMarkup("tplVisibility")}
                <div class="alert_message" id="tplAlert"></div>
                <div class="modal-actions">
                  <button type="button" class="btn btn-outline" id="tplCancel">Cancelar</button>
                  <button type="submit" class="btn btn-primary">Crear rutina</button>
                </div>
              </form>
            </div>
          </div>
        `;

        document.getElementById("tplCancel")?.addEventListener("click", () => (loaderBody.innerHTML = ""));

        document.getElementById("tplUseForm")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          const name = (document.getElementById("tplName") as HTMLInputElement).value.trim();
          const weeks = parseInt((document.getElementById("tplWeeks") as HTMLInputElement).value, 10);
          const alertEl = document.getElementById("tplAlert")!;

          if (name.length < 2) {
            alertEl.innerHTML = "<p>Ingresá un nombre para la rutina.</p>";
            return;
          }
          if (!weeks || weeks < 1 || weeks > 10) {
            alertEl.innerHTML = "<p>La cantidad de semanas tiene que ser entre 1 y 10.</p>";
            return;
          }

          const dias = resolveTemplateDays(t);
          if (!dias) {
            alertEl.innerHTML = "<p>Hubo un problema armando esta rutina. Probá de nuevo más tarde.</p>";
            return;
          }

          const isPublic = readVisibilityField("tplVisibility");
          const error = await createAndFinish(name, weeks, dias, isPublic);
          if (error) alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
        });
      }

      async function openClonePreview(routineId: string, isActivating = false, explicitProvenanceUserId?: string): Promise<void> {
        const loaderBody = document.getElementById("loaderBody")!;
        loaderBody.innerHTML = `<div class="loader-container"><div class="modern-spinner"></div><p>Cargando rutina...</p></div>`;

        const detail = await getRoutineDetail(routineId);
        if (!detail || detail.semanas.length === 0) {
          loaderBody.innerHTML = "";
          return;
        }

        // Si la rutina de origen ya tenia procedencia (era ella misma una copia, o
        // una clonada-de-una-copia), esa autoria original se arrastra tal cual. Si
        // no, y esto vino de copyFrom (copiando la rutina activa publica de otro
        // perfil) o del tab "Seguidos y gimnasio" (explicitProvenanceUserId), el
        // dueño de la rutina de origen pasa a ser la procedencia. Un cloneFrom de
        // una rutina propia sin copia detras no lleva procedencia.
        const provenanceUserId = detail.copied_from_user_id ?? explicitProvenanceUserId ?? (copyFromId ? detail.user_id : undefined);

        const baseWeek = detail.semanas[0];
        const subtitle = isAssigningToOther
          ? `Se va a crear una rutina nueva con los mismos ejercicios${assignTargetName ? ` para ${escapeHtml(assignTargetName)}` : ""}. Tu plantilla original queda guardada tal cual.`
          : copyFromId
            ? "Se va a guardar una copia en tus rutinas guardadas, con los mismos ejercicios."
            : "Se va a crear una rutina nueva con los mismos ejercicios, para que empieces de cero.";

        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="modal-card modal-card-lg">
              <h2>${escapeHtml(detail.nombre)}</h2>
              <p class="subtitle">${subtitle}</p>
              ${tplDaysPreviewMarkup(baseWeek.dias.map((d) => ({ dia_semana: d.dia_semana, titulo: d.nombre ?? undefined, items: d.ejercicios.map((e) => ({ nombre: e.nombre_snapshot, serie: e.serie, repe: e.repe, repeMax: e.repe_max })) })))}
              <form id="cloneForm" novalidate>
                <div class="field"><label for="cloneName">Nombre de la rutina</label><input type="text" id="cloneName" value="${escapeHtml(detail.nombre)}"></div>
                <div class="field"><label for="cloneWeeks">Semanas</label><input type="number" id="cloneWeeks" min="1" max="10" value="${baseWeek ? detail.semanas.length : 4}"></div>
                ${visibilityFieldMarkup("cloneVisibility")}
                <div class="alert_message" id="cloneAlert"></div>
                <div class="modal-actions">
                  <button type="button" class="btn btn-outline" id="cloneCancel">Cancelar</button>
                  <button type="submit" class="btn btn-primary">${copyFromId ? "Guardar copia" : "Crear rutina"}</button>
                </div>
              </form>
            </div>
          </div>
        `;

        document.getElementById("cloneCancel")?.addEventListener("click", () => (loaderBody.innerHTML = ""));

        document.getElementById("cloneForm")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          const name = (document.getElementById("cloneName") as HTMLInputElement).value.trim();
          const weeks = parseInt((document.getElementById("cloneWeeks") as HTMLInputElement).value, 10);
          const alertEl = document.getElementById("cloneAlert")!;

          if (name.length < 2) {
            alertEl.innerHTML = "<p>Ingresá un nombre para la rutina.</p>";
            return;
          }
          if (!weeks || weeks < 1 || weeks > 10) {
            alertEl.innerHTML = "<p>La cantidad de semanas tiene que ser entre 1 y 10.</p>";
            return;
          }

          const dias: NewDayInput[] = baseWeek.dias.map((d) => ({
            dia_semana: d.dia_semana,
            nombre: d.nombre,
            ejercicios: d.ejercicios.map((e, orden) => ({
              exercise_id: e.exercise_id,
              nombre_snapshot: e.nombre_snapshot,
              info_snapshot: e.info_snapshot,
              serie: e.serie,
              repe: e.repe,
              repe_max: e.repe_max,
              nota: e.nota ?? "",
              es_medible: e.es_medible,
              mismo_peso: e.mismo_peso,
              orden,
            })),
          }));

          const isPublic = readVisibilityField("cloneVisibility");
          const error = await createAndFinish(name, weeks, dias, isPublic, isActivating, provenanceUserId);
          if (error) alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
        });
      }

      // ---------- Crear desde cero ----------

      function renderSetupForm(): void {
        contentEl.innerHTML = `
          <a href="#" class="back-link" id="backToChooser">${BACK_ICON}Volver</a>
          <div class="auth-card reveal">
            <span class="eyebrow">Nueva rutina</span>
            <h1>Creá tu rutina</h1>
            <p class="subtitle">Elegí el nombre y cuántas semanas y días vas a entrenar. Después cargás los ejercicios de cada día.</p>
            <form id="setupForm" novalidate>
              <div class="field"><label for="rutinName">Nombre de la rutina</label><input type="text" id="rutinName" placeholder="Ej: Full body"></div>
              <div class="field-row">
                <div class="field"><label for="weeksInput">Semanas</label><input type="number" id="weeksInput" min="1" max="10" placeholder="Ej: 4"></div>
                <div class="field"><label for="daysInput">Días por semana</label><input type="number" id="daysInput" min="1" max="7" placeholder="Ej: 3"></div>
              </div>
              ${visibilityFieldMarkup("visibilityInput")}
              <div class="alert_message" id="setupAlert"></div>
              <button type="submit" class="btn btn-primary btn-block">Continuar</button>
            </form>
          </div>
        `;

        contentEl.querySelector("#backToChooser")?.addEventListener("click", (event) => {
          event.preventDefault();
          renderChooser();
        });

        contentEl.querySelector("#setupForm")?.addEventListener("submit", (event) => {
          event.preventDefault();
          const name = (contentEl.querySelector("#rutinName") as HTMLInputElement).value.trim();
          const weeks = parseInt((contentEl.querySelector("#weeksInput") as HTMLInputElement).value, 10);
          const days = parseInt((contentEl.querySelector("#daysInput") as HTMLInputElement).value, 10);
          const alertEl = contentEl.querySelector("#setupAlert")!;

          if (name.length < 2) {
            alertEl.innerHTML = "<p>Ingresá un nombre para la rutina.</p>";
            return;
          }
          if (!weeks || weeks < 1 || weeks > 10) {
            alertEl.innerHTML = "<p>La cantidad de semanas tiene que ser entre 1 y 10.</p>";
            return;
          }
          if (!days || days < 1 || days > 7) {
            alertEl.innerHTML = "<p>La cantidad de días tiene que ser entre 1 y 7.</p>";
            return;
          }
          const isPublic = readVisibilityField("visibilityInput", contentEl);
          renderBuilder(name, weeks, days, isPublic);
        });
      }

      function renderBuilder(name: string, weeks: number, days: number, isPublic: boolean): void {
        const dayCards = Array.from({ length: days }, (_, i) => dayCardMarkup(i)).join("");

        contentEl.innerHTML = `
          <div class="section-head reveal">
            <span class="eyebrow">${escapeHtml(name)}</span>
            <h2>Cargá los ejercicios de cada día</h2>
            <p>Se van a repetir en las ${weeks} semana${weeks > 1 ? "s" : ""} de la rutina. <button type="button" class="help-link" id="builderHelpBtn">¿Cómo cargo esto?</button></p>
          </div>
          <div id="dayCards">${dayCards}</div>
          <div class="alert_message" id="builderAlert"></div>
          <div class="auth-trust">
            <button class="btn btn-outline" id="cancelRoutineBtn" type="button">Cancelar</button>
            <button class="btn btn-primary" id="createRoutine" type="button">Crear rutina</button>
          </div>
        `;

        contentEl.querySelector("#builderHelpBtn")?.addEventListener("click", openBuilderHelp);

        contentEl.querySelectorAll("#dayCards .exc-list").forEach((list) => updateMoveButtons(list));

        contentEl.querySelector("#dayCards")?.addEventListener("click", (event) => {
          const target = event.target as HTMLElement;
          if (target.classList.contains("day-add-btn")) {
            const list = target.previousElementSibling;
            list?.insertAdjacentHTML("beforeend", excBlockMarkup());
            if (list) updateMoveButtons(list);
          }
          if (target.classList.contains("exc-remove")) {
            const block = target.closest(".exc-block");
            const list = block?.parentElement;
            if (list && list.children.length > 1) {
              block?.remove();
              updateMoveButtons(list);
            }
          }
          if (target.classList.contains("exc-move-up")) {
            const block = target.closest(".exc-block");
            const prev = block?.previousElementSibling;
            if (block && prev) {
              block.parentElement!.insertBefore(block, prev);
              updateMoveButtons(block.parentElement!);
            }
          }
          if (target.classList.contains("exc-move-down")) {
            const block = target.closest(".exc-block");
            const next = block?.nextElementSibling;
            if (block && next) {
              block.parentElement!.insertBefore(next, block);
              updateMoveButtons(block.parentElement!);
            }
          }
          if (target.classList.contains("exc-picker-btn")) {
            const block = target.closest<HTMLElement>(".exc-block")!;
            openExercisePicker(
              excCatalog,
              (exc) => {
                if (!excCatalog.some((e) => e.id === exc.id)) excCatalog.push(exc);
                target.textContent = exc.name;
                block.querySelector<HTMLInputElement>(".excSelectInput")!.value = exc.id;
              },
              ctx
            );
          }
        });

        contentEl.querySelector("#createRoutine")?.addEventListener("click", () => void submitRoutine(name, weeks, isPublic));
        contentEl.querySelector("#cancelRoutineBtn")?.addEventListener("click", confirmCancelBuilder);
      }

      function confirmCancelBuilder(): void {
        const loaderBody = document.getElementById("loaderBody");
        if (!loaderBody) return;
        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="modal-card">
              <h2>¿Cancelar esta rutina?</h2>
              <p class="subtitle">Vas a perder los días y ejercicios que ya cargaste. Esto no se puede deshacer.</p>
              <div class="modal-actions">
                <button type="button" class="btn btn-outline" id="dismissCancelBuilder">Seguir cargando</button>
                <button type="button" class="btn btn-danger" id="confirmCancelBuilder">Sí, cancelar</button>
              </div>
            </div>
          </div>
        `;
        document.getElementById("dismissCancelBuilder")?.addEventListener("click", () => (loaderBody.innerHTML = ""));
        document.getElementById("confirmCancelBuilder")?.addEventListener("click", () => {
          loaderBody.innerHTML = "";
          // Deja la instancia cacheada de esta vista lista en el paso inicial: si el router
          // vuelve a mostrarla mas tarde (ver el guard de lastParamsKey arriba) no aparece la
          // rutina abandonada a medio cargar.
          renderChooser();
          navigate(isAssigningToOther ? "alumnos.html" : "profile.html");
        });
      }

      async function submitRoutine(name: string, weeks: number, isPublic: boolean): Promise<void> {
        const alertEl = contentEl.querySelector("#builderAlert")!;
        const dayCardsEls = contentEl.querySelectorAll<HTMLElement>("#dayCards .day-card");
        const diasArray: NewDayInput[] = [];
        let error = "";

        dayCardsEls.forEach((dayCard) => {
          const diaSemana = Number(dayCard.dataset.diaSemana);
          const customName = (dayCard.querySelector(".day-name-input") as HTMLInputElement).value.trim();
          const diaSemanaLabel = customName || diaLabel(diaSemana);
          const ejercicios: NewDayInput["ejercicios"] = [];

          dayCard.querySelectorAll(".exc-block").forEach((block, orden) => {
            const excId = (block.querySelector(".excSelectInput") as HTMLInputElement).value;
            const serie = parseInt((block.querySelector(".serieInput") as HTMLInputElement).value, 10);
            const repe = parseInt((block.querySelector(".repeInput") as HTMLInputElement).value, 10);
            const repeMaxRaw = (block.querySelector(".repeMaxInput") as HTMLInputElement).value;
            const repeMax = repeMaxRaw ? parseInt(repeMaxRaw, 10) : null;
            const noWeight = (block.querySelector(".noWeightCheck") as HTMLInputElement).checked;
            const mismoPeso = (block.querySelector(".mismoPesoCheck") as HTMLInputElement).checked;
            const nota = (block.querySelector(".notaInput") as HTMLInputElement).value.trim();
            const ubicacion = `${diaSemanaLabel}, ejercicio ${orden + 1}`;

            if (!excId) {
              error = `Te falta elegir un ejercicio (${ubicacion}). Tocá "Elegir ejercicio" para buscarlo en el catálogo.`;
              return;
            }
            if (!serie || serie < 1 || serie > 10) {
              error = `Revisá las series en ${ubicacion}: tienen que ser un número entre 1 y 10.`;
              return;
            }
            if (!repe || repe < 1 || repe > 30) {
              error = `Revisá las repeticiones en ${ubicacion}: tienen que ser un número entre 1 y 30.`;
              return;
            }
            if (repeMax !== null && (repeMax < 1 || repeMax > 30 || repeMax < repe)) {
              error = `Revisá el "hasta" en ${ubicacion}: tiene que ser mayor o igual a las repeticiones y como máximo 30.`;
              return;
            }
            if (nota.length > 140) {
              error = `La nota en ${ubicacion} es muy larga: dejala en 140 caracteres o menos.`;
              return;
            }

            const excDef = excCatalog.find((exc) => exc.id === excId)!;
            ejercicios.push({
              exercise_id: excDef.id,
              nombre_snapshot: excDef.name,
              info_snapshot: excDef.info,
              serie,
              repe,
              repe_max: repeMax,
              nota,
              es_medible: !noWeight,
              mismo_peso: mismoPeso,
              orden,
            });
          });

          if (!error && ejercicios.length === 0) error = `Agregá al menos un ejercicio en ${diaSemanaLabel}.`;
          diasArray.push({ dia_semana: diaSemana, nombre: customName || null, ejercicios });
        });

        if (error) {
          alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
          alertEl.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }

        alertEl.innerHTML = "";
        const createError = await createAndFinish(name, weeks, diasArray, isPublic);
        if (createError) alertEl.innerHTML = `<p>${escapeHtml(createError)}</p>`;
      }

      // ---------- Compartido: creación final + redirección ----------

      // Asignarle una rutina a otra persona siempre se entra desde "Tus alumnos" (o
      // desde el modal de asignar de Guardadas, que apunta al mismo lugar): al
      // terminar tiene mas sentido volver ahi que al propio perfil.
      function renderSuccessAndRedirect(message: string): void {
        const loaderBody = document.getElementById("loaderBody")!;
        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
            <p>${message}</p>
          </div>
        `;
        const t = setTimeout(() => {
          navigate(isAssigningToOther ? "alumnos.html" : "profile.html");
        }, 2000);
        ctx.addCleanup(() => clearTimeout(t));
      }

      async function createAndFinish(
        name: string,
        weeks: number,
        dias: NewDayInput[],
        isPublic: boolean,
        isActivating = false,
        copiedFromUserId?: string
      ): Promise<string | null> {
        const loaderBody = document.getElementById("loaderBody")!;
        loaderBody.innerHTML = `
          <div class="loader-container"><div class="modern-spinner"></div><p>Creando rutina...</p></div>
        `;

        // isActivating (venís de una guardada via cloneFrom) siempre crea activa de una.
        // Si no, crear de cero (para uno mismo) cae siempre en guardada+pregunta,
        // sea cual sea el tipo de cuenta; mode=template explicito del entrenador
        // sigue siendo guardado silencioso (sin la pregunta), y asignarle una rutina
        // a otra persona directamente (sin pasar por Guardadas) tampoco pregunta.
        const isTemplate = isActivating ? false : isTemplateMode || (autoSaveAsTemplate && !isAssigningToOther);
        const { error: createError } = await createRoutine(targetUserId, name, weeks, dias, isPublic, isTemplate, copiedFromUserId);

        if (createError) {
          loaderBody.innerHTML = "";
          return createError;
        }

        // Guardada "silenciosa" (mode=template, entrenador armando una plantilla a
        // propósito): sin pregunta, va derecho al mensaje de éxito de siempre.
        if (isTemplate && !isTemplateMode) {
          loaderBody.innerHTML = `
            <div class="success-check-container">
              <div class="modal-card">
                <h2>¡Rutina guardada!</h2>
                <p class="subtitle">Quedó en Guardadas. ¿Querés activarla ahora para empezar a entrenar?</p>
                <div class="modal-actions">
                  <button type="button" class="btn btn-primary" id="activateNowBtn">Activar ahora</button>
                  <button type="button" class="btn btn-outline" id="skipActivateBtn">Ahora no</button>
                </div>
              </div>
            </div>
          `;
          document.getElementById("skipActivateBtn")?.addEventListener("click", () => {
            renderSuccessAndRedirect("¡Rutina guardada con éxito! Espere, será redirigido.");
          });
          document.getElementById("activateNowBtn")?.addEventListener("click", async () => {
            loaderBody.innerHTML = `<div class="loader-container"><div class="modern-spinner"></div><p>Activando rutina...</p></div>`;
            const { error: activateError } = await createRoutine(targetUserId, name, weeks, dias, isPublic, false, copiedFromUserId);
            if (activateError) {
              renderSuccessAndRedirect("La rutina quedó guardada, pero no se pudo activar. Podés activarla luego desde Guardadas.");
              return;
            }
            renderSuccessAndRedirect("¡Rutina activada con éxito! Espere, será redirigido.");
          });
          return null;
        }

        const successMessage = isAssigningToOther
          ? `¡Rutina asignada${assignTargetName ? ` a ${escapeHtml(assignTargetName)}` : ""} con éxito! Espere, será redirigido.`
          : isActivating
            ? "¡Rutina activada con éxito! Espere, será redirigido."
            : "¡Rutina creada con éxito! Espere, será redirigido.";
        renderSuccessAndRedirect(successMessage);
        return null;
      }

      renderChooser();

      // Entrar con cloneFrom (siempre junto a ?uid=<alumno>) abre directo la
      // previsualizacion de clonado sobre el selector, sin que el alumno tenga que
      // elegir "cero vs. ver rutinas" para algo que ya viene decidido.
      if (cloneFromId) void openClonePreview(cloneFromId, true);
      // copyFrom (rutina activa publica de otro perfil, ver "Copiar a mis
      // guardadas" en profile.ts): isActivating=false, cae en el mismo flujo
      // "guardada, ¿la activás ya?" que cualquier creación propia.
      else if (copyFromId) void openClonePreview(copyFromId, false);
    }

    await render(params);

    updateHandler = (nextParams) => void render(nextParams);
    ctx.addCleanup(() => {
      updateHandler = null;
    });
  },
  update(params) {
    updateHandler?.(params);
  },
};
