import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { listExercises, type Exercise } from "../services/exercise.service";
import { createRoutine, getRoutineDetail, type NewDayInput } from "../services/routine.service";
import { listRoutines, type RoutineWithCounts } from "../services/profile.service";
import { escapeHtml } from "../lib/dom";
import { DIA_LABELS, diaLabel, formatFechaCorta } from "../lib/dias";
import { openExercisePicker } from "../lib/exercisePicker";
import { ROUTINE_TEMPLATES, LEVEL_LABELS, type RoutineTemplate } from "../lib/routineTemplates";

setupNavToggle();
setupRevealObserver();
const myId = await requireAuth();

const params = new URLSearchParams(window.location.search);
const targetUserId = params.get("uid") ?? myId;

const container = document.getElementById("container") as HTMLElement;
let excCatalog: Exercise[] = [];

const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;

// ---------- Paso 0: elegir cómo armar la rutina ----------

function renderChooser() {
  container.innerHTML = `
    <div class="section-head reveal">
      <span class="eyebrow">Nueva rutina</span>
      <h1>¿Cómo querés armarla?</h1>
      <p>Podés empezar de cero o elegir una rutina ya armada como base.</p>
    </div>
    <div class="quick-grid reveal">
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

  document.getElementById("chooseScratch")?.addEventListener("click", () => renderSetupForm());
  document.getElementById("chooseBrowse")?.addEventListener("click", () => renderBrowseRoutines());
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

function renderBrowseRoutines() {
  container.innerHTML = `
    <a href="#" class="back-link" id="backToChooser">${BACK_ICON}Volver</a>
    <div class="section-head reveal">
      <span class="eyebrow">Nueva rutina</span>
      <h1>Ver rutinas</h1>
      <p>Elegí una rutina como base. Después vas a poder ajustarla a tu gusto.</p>
    </div>
    ${browseTabsMarkup()}
    <div id="browseContent"></div>
  `;

  document.getElementById("backToChooser")?.addEventListener("click", (event) => {
    event.preventDefault();
    renderChooser();
  });

  document.getElementById("browseTabs")?.querySelectorAll<HTMLButtonElement>(".routine-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      browseTab = btn.dataset.tab as BrowseTab;
      document.getElementById("browseTabs")!.querySelectorAll(".routine-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderBrowseContent();
    });
  });

  renderBrowseContent();
}

async function renderBrowseContent() {
  const content = document.getElementById("browseContent");
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
    content.innerHTML = `
      <div class="empty-state reveal">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <h3>Próximamente</h3>
        <p>Vas a poder ver acá las rutinas de la gente que seguís y de tu gimnasio.</p>
      </div>
    `;
    return;
  }

  content.innerHTML = `<p class="subtitle">Cargando tus rutinas...</p>`;
  const [active, historic] = await Promise.all([listRoutines(targetUserId, true), listRoutines(targetUserId, false)]);
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
      const routine = mine.find((r) => r.id === btn.dataset.id);
      if (routine) openClonePreview(routine);
    });
  });
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

function tplDaysPreviewMarkup(days: { dia_semana: number; titulo?: string; items: { nombre: string; serie: number; repe: number }[] }[]): string {
  return `
    <div class="tpl-days">
      ${days
        .map(
          (d) => `
        <div class="tpl-day">
          <h4>${escapeHtml(diaLabel(d.dia_semana))}${d.titulo ? ` · ${escapeHtml(d.titulo)}` : ""}</h4>
          <ul>${d.items.map((e) => `<li>${escapeHtml(e.nombre)}<span>${e.serie}x${e.repe}</span></li>`).join("")}</ul>
        </div>
      `
        )
        .join("")}
    </div>
  `;
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
        nota: item.nota ?? "",
        es_medible: item.es_medible ?? true,
        orden,
      });
    });
    if (ejercicios.length === 0) return null;
    dias.push({ dia_semana: day.dia_semana, ejercicios });
  }
  return dias;
}

function openTemplatePreview(t: RoutineTemplate) {
  const loaderBody = document.getElementById("loaderBody")!;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <span class="hero-badge">${escapeHtml(LEVEL_LABELS[t.level])}</span>
        <h2>${escapeHtml(t.label)}</h2>
        <p class="subtitle">${escapeHtml(t.description)}</p>
        ${tplDaysPreviewMarkup(t.dias.map((d) => ({ dia_semana: d.dia_semana, titulo: d.titulo, items: d.ejercicios.map((e) => ({ nombre: e.name, serie: e.serie, repe: e.repe })) })))}
        <form id="tplUseForm" novalidate>
          <div class="field"><label for="tplName">Nombre de la rutina</label><input type="text" id="tplName" value="${escapeHtml(t.label)}"></div>
          <div class="field"><label for="tplWeeks">Semanas</label><input type="number" id="tplWeeks" min="1" max="10" value="${t.semanasSugeridas}"></div>
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

    const error = await createAndFinish(name, weeks, dias);
    if (error) alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
  });
}

async function openClonePreview(r: RoutineWithCounts) {
  const loaderBody = document.getElementById("loaderBody")!;
  loaderBody.innerHTML = `<div class="loader-container"><div class="modern-spinner"></div><p>Cargando rutina...</p></div>`;

  const detail = await getRoutineDetail(r.id);
  if (!detail || detail.semanas.length === 0) {
    loaderBody.innerHTML = "";
    return;
  }

  const baseWeek = detail.semanas[0];

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>${escapeHtml(detail.nombre)}</h2>
        <p class="subtitle">Se va a crear una rutina nueva con los mismos ejercicios, para que empieces de cero.</p>
        ${tplDaysPreviewMarkup(baseWeek.dias.map((d) => ({ dia_semana: d.dia_semana, items: d.ejercicios.map((e) => ({ nombre: e.nombre_snapshot, serie: e.serie, repe: e.repe })) })))}
        <form id="cloneForm" novalidate>
          <div class="field"><label for="cloneName">Nombre de la rutina</label><input type="text" id="cloneName" value="${escapeHtml(detail.nombre)}"></div>
          <div class="field"><label for="cloneWeeks">Semanas</label><input type="number" id="cloneWeeks" min="1" max="10" value="${baseWeek ? detail.semanas.length : 4}"></div>
          <div class="alert_message" id="cloneAlert"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="cloneCancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">Crear rutina</button>
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
      ejercicios: d.ejercicios.map((e, orden) => ({
        exercise_id: e.exercise_id,
        nombre_snapshot: e.nombre_snapshot,
        info_snapshot: e.info_snapshot,
        serie: e.serie,
        repe: e.repe,
        nota: e.nota ?? "",
        es_medible: e.es_medible,
        orden,
      })),
    }));

    const error = await createAndFinish(name, weeks, dias);
    if (error) alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
  });
}

// ---------- Crear desde cero ----------

function excBlockMarkup(): string {
  return `
    <div class="exc-block">
      <div class="exc-edit-row">
        <button type="button" class="exc-picker-btn">Elegir ejercicio</button>
        <input type="hidden" class="excSelectInput" value="">
        <input type="number" class="mini-input serieInput" placeholder="Series" min="1" max="10">
        <input type="number" class="mini-input repeInput" placeholder="Repes" min="1" max="30">
        <button class="exc-remove" type="button" title="Quitar ejercicio">×</button>
      </div>
      <div class="exc-extra">
        <label><input type="checkbox" class="noWeightCheck"> Sin peso</label>
        <input type="text" class="notaInput" placeholder="Nota para este ejercicio (opcional)" maxlength="140">
      </div>
    </div>
  `;
}

function dayCardMarkup(dayIndex: number): string {
  return `
    <div class="day-card reveal" data-day="${dayIndex}">
      <select class="day-name-select">
        ${DIA_LABELS.map((name, i) => `<option value="${i + 1}" ${i === dayIndex % 7 ? "selected" : ""}>${name}</option>`).join("")}
      </select>
      <div class="exc-list">${excBlockMarkup()}</div>
      <button class="day-add-btn" type="button">+ Agregar ejercicio</button>
    </div>
  `;
}

function renderSetupForm() {
  container.innerHTML = `
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
        <div class="alert_message" id="setupAlert"></div>
        <button type="submit" class="btn btn-primary btn-block">Continuar</button>
      </form>
    </div>
  `;

  document.getElementById("backToChooser")?.addEventListener("click", (event) => {
    event.preventDefault();
    renderChooser();
  });

  document.getElementById("setupForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = (document.getElementById("rutinName") as HTMLInputElement).value.trim();
    const weeks = parseInt((document.getElementById("weeksInput") as HTMLInputElement).value, 10);
    const days = parseInt((document.getElementById("daysInput") as HTMLInputElement).value, 10);
    const alertEl = document.getElementById("setupAlert")!;

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
    renderBuilder(name, weeks, days);
  });
}

function renderBuilder(name: string, weeks: number, days: number) {
  const dayCards = Array.from({ length: days }, (_, i) => dayCardMarkup(i)).join("");

  container.innerHTML = `
    <div class="section-head reveal">
      <span class="eyebrow">${escapeHtml(name)}</span>
      <h2>Cargá los ejercicios de cada día</h2>
      <p>Se van a repetir en las ${weeks} semana${weeks > 1 ? "s" : ""} de la rutina.</p>
    </div>
    <div id="dayCards">${dayCards}</div>
    <div class="alert_message" id="builderAlert"></div>
    <div class="auth-trust"><button class="btn btn-primary" id="createRoutine" type="button">Crear rutina</button></div>
  `;

  document.getElementById("dayCards")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("day-add-btn")) {
      target.previousElementSibling?.insertAdjacentHTML("beforeend", excBlockMarkup());
    }
    if (target.classList.contains("exc-remove")) {
      const block = target.closest(".exc-block");
      const list = block?.parentElement;
      if (list && list.children.length > 1) block?.remove();
    }
    if (target.classList.contains("exc-picker-btn")) {
      const block = target.closest<HTMLElement>(".exc-block")!;
      openExercisePicker(excCatalog, (exc) => {
        target.textContent = exc.name;
        block.querySelector<HTMLInputElement>(".excSelectInput")!.value = exc.id;
      });
    }
  });

  document.getElementById("createRoutine")?.addEventListener("click", () => submitRoutine(name, weeks));
}

async function submitRoutine(name: string, weeks: number) {
  const alertEl = document.getElementById("builderAlert")!;
  const dayCardsEls = document.querySelectorAll<HTMLElement>("#dayCards .day-card");
  const diasArray: NewDayInput[] = [];
  let error = "";

  dayCardsEls.forEach((dayCard) => {
    const diaSemana = Number((dayCard.querySelector(".day-name-select") as HTMLSelectElement).value);
    const ejercicios: NewDayInput["ejercicios"] = [];

    dayCard.querySelectorAll(".exc-block").forEach((block, orden) => {
      const excId = (block.querySelector(".excSelectInput") as HTMLInputElement).value;
      const serie = parseInt((block.querySelector(".serieInput") as HTMLInputElement).value, 10);
      const repe = parseInt((block.querySelector(".repeInput") as HTMLInputElement).value, 10);
      const noWeight = (block.querySelector(".noWeightCheck") as HTMLInputElement).checked;
      const nota = (block.querySelector(".notaInput") as HTMLInputElement).value.trim();

      if (!excId) {
        error = "Elegí un ejercicio en cada fila.";
        return;
      }
      if (!serie || serie < 1 || serie > 10) {
        error = "Las series tienen que ser entre 1 y 10.";
        return;
      }
      if (!repe || repe < 1 || repe > 30) {
        error = "Las repeticiones tienen que ser entre 1 y 30.";
        return;
      }
      if (nota.length > 140) {
        error = "Las notas tienen un máximo de 140 caracteres.";
        return;
      }

      const excDef = excCatalog.find((exc) => exc.id === excId)!;
      ejercicios.push({
        exercise_id: excDef.id,
        nombre_snapshot: excDef.name,
        info_snapshot: excDef.info,
        serie,
        repe,
        nota,
        es_medible: !noWeight,
        orden,
      });
    });

    if (!error && ejercicios.length === 0) error = "Agregá al menos un ejercicio en cada día.";
    diasArray.push({ dia_semana: diaSemana, ejercicios });
  });

  if (error) {
    alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
    return;
  }

  alertEl.innerHTML = "";
  const createError = await createAndFinish(name, weeks, diasArray);
  if (createError) alertEl.innerHTML = `<p>${escapeHtml(createError)}</p>`;
}

// ---------- Compartido: creación final + redirección ----------

async function createAndFinish(name: string, weeks: number, dias: NewDayInput[]): Promise<string | null> {
  const loaderBody = document.getElementById("loaderBody")!;
  loaderBody.innerHTML = `
    <div class="loader-container"><div class="modern-spinner"></div><p>Creando rutina...</p></div>
  `;

  const { error: createError } = await createRoutine(targetUserId, name, weeks, dias);

  if (createError) {
    loaderBody.innerHTML = "";
    return createError;
  }

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
      <p>¡Rutina creada con éxito! Espere, será redirigido.</p>
    </div>
  `;
  setTimeout(() => {
    window.location.href = "profile.html";
  }, 2000);

  return null;
}

async function init() {
  excCatalog = await listExercises();
  excCatalog.sort((a, b) => a.name.localeCompare(b.name));
  renderChooser();
}

init();
