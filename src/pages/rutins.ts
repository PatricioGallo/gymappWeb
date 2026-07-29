import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { listExercises, CATEGORY_LABELS, EXERCISE_CATEGORIES, type Exercise } from "../services/exercise.service";
import { createRoutine, type NewDayInput } from "../services/routine.service";
import { escapeHtml } from "../lib/dom";
import { DIA_LABELS } from "../lib/dias";

setupNavToggle();
setupRevealObserver();
const myId = await requireAuth();

const params = new URLSearchParams(window.location.search);
const targetUserId = params.get("uid") ?? myId;

const container = document.getElementById("container") as HTMLElement;
let excCatalog: Exercise[] = [];

function excOptions(): string {
  return EXERCISE_CATEGORIES.map((cat) => {
    const items = excCatalog.filter((exc) => exc.category === cat);
    if (items.length === 0) return "";
    const opts = items.map((exc) => `<option value="${exc.id}">${escapeHtml(exc.name)}</option>`).join("");
    return `<optgroup label="${escapeHtml(CATEGORY_LABELS[cat])}">${opts}</optgroup>`;
  }).join("");
}

function excBlockMarkup(): string {
  return `
    <div class="exc-block">
      <div class="exc-edit-row">
        <select class="excSelectInput">
          <option value="">Elegir ejercicio</option>
          ${excOptions()}
        </select>
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
      const excId = (block.querySelector(".excSelectInput") as HTMLSelectElement).value;
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
  const loaderBody = document.getElementById("loaderBody")!;
  loaderBody.innerHTML = `
    <div class="loader-container"><div class="modern-spinner"></div><p>Creando rutina...</p></div>
  `;

  const { error: createError } = await createRoutine(targetUserId, name, weeks, diasArray);

  if (createError) {
    loaderBody.innerHTML = "";
    alertEl.innerHTML = `<p>${escapeHtml(createError)}</p>`;
    return;
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
}

async function init() {
  excCatalog = await listExercises();
  excCatalog.sort((a, b) => a.name.localeCompare(b.name));
  renderSetupForm();
}

init();
