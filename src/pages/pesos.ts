import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { diaLabel } from "../lib/dias";
import { getRoutineDetail, type RoutineDetail } from "../services/routine.service";
import { insertWeightLogs, getLatestWeights, type LatestWeightsMap } from "../services/weightLog.service";
import { formatRepe } from "../lib/reps";

setupNavToggle();
setupRevealObserver();
const userId = await requireAuth();

const params = new URLSearchParams(window.location.search);
const routineId = params.get("rid");

let routine: RoutineDetail | null = null;
let latestWeights: LatestWeightsMap = new Map();

function ringMarkup(pct: number): string {
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  return `
    <div class="day-ring">
      <svg viewBox="0 0 40 40">
        <circle class="ring-bg" cx="20" cy="20" r="${r}"></circle>
        <circle class="ring-fg" cx="20" cy="20" r="${r}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
      </svg>
      <span class="day-ring-pct">${pct}%</span>
    </div>
  `;
}

function dayProgress(dia: RoutineDetail["semanas"][number]["dias"][number]): number {
  const trackable = dia.ejercicios.filter((e) => e.es_medible);
  if (trackable.length === 0) return 100;
  const done = trackable.filter((e) => latestWeights.has(e.id)).length;
  return Math.round((done / trackable.length) * 100);
}

function routineProgress(): number {
  let total = 0;
  let done = 0;
  routine!.semanas.forEach((semana) => {
    semana.dias.forEach((dia) => {
      dia.ejercicios.forEach((e) => {
        total++;
        if (latestWeights.has(e.id)) done++;
      });
    });
  });
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function currentWeekIndex(): number {
  let found = -1;
  routine!.semanas.forEach((semana, index) => {
    semana.dias.forEach((dia) => {
      dia.ejercicios.forEach((e) => {
        if (latestWeights.has(e.id)) found = index;
      });
    });
  });
  return found === -1 ? 0 : found;
}

function renderWeekStatus(weekIndex: number) {
  const semana = routine!.semanas[weekIndex];
  const weekStatus = document.getElementById("weekStatus")!;
  weekStatus.innerHTML = `
    <span class="hero-badge">Estás en la semana ${semana.numero}</span>
    <span class="hero-badge">Progreso de la rutina: ${routineProgress()}%</span>
  `;
}

function renderWeek(weekIndex: number) {
  const semana = routine!.semanas[weekIndex];
  const weekContent = document.getElementById("weekContent")!;
  weekContent.dataset.week = String(weekIndex);
  renderWeekStatus(weekIndex);

  weekContent.innerHTML = semana.dias
    .map((dia, diaIndex) => {
      const pct = dayProgress(dia);
      const done = pct >= 100;
      const trackableCount = dia.ejercicios.filter((e) => e.es_medible).length;
      const doneCount = dia.ejercicios.filter((e) => e.es_medible && latestWeights.has(e.id)).length;
      const subtitle = trackableCount === 0 ? "Sin ejercicios con peso" : `${doneCount} de ${trackableCount} ejercicios con peso cargado`;

      return `
        <button class="day-row reveal ${done ? "done" : ""}" type="button" data-dia="${diaIndex}">
          ${ringMarkup(pct)}
          <div class="day-row-info"><h3>${escapeHtml(diaLabel(dia.dia_semana))}</h3><p>${subtitle}</p></div>
          <span class="day-row-status ${done ? "done" : "pending"}">${done ? "Completo" : "Pendiente"}</span>
          <svg class="day-row-chevron" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      `;
    })
    .join("");

  weekContent.querySelectorAll<HTMLButtonElement>(".day-row").forEach((row) => {
    row.addEventListener("click", () => openDay(weekIndex, Number(row.dataset.dia)));
  });
}

function backToWeek(weekIndex: number) {
  (document.getElementById("weekPicker") as HTMLElement).style.display = "";
  (document.getElementById("weekStatus") as HTMLElement).style.display = "";
  renderWeek(weekIndex);
}

function openDay(weekIndex: number, diaIndex: number) {
  const semana = routine!.semanas[weekIndex];
  const dia = semana.dias[diaIndex];
  const weekContent = document.getElementById("weekContent")!;
  (document.getElementById("weekPicker") as HTMLElement).style.display = "none";
  (document.getElementById("weekStatus") as HTMLElement).style.display = "none";

  const trackable = dia.ejercicios.filter((e) => e.es_medible);

  if (trackable.length === 0) {
    weekContent.innerHTML = `
      <a class="back-link" id="backToWeek" href="#"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</a>
      <div class="empty-state reveal"><h3>${escapeHtml(diaLabel(dia.dia_semana))} no tiene ejercicios con peso</h3><p>No hay nada para cargar este día.</p></div>
    `;
    document.getElementById("backToWeek")?.addEventListener("click", (e) => {
      e.preventDefault();
      backToWeek(weekIndex);
    });
    return;
  }

  weekContent.innerHTML = `
    <a class="back-link" id="backToWeek" href="#"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver a la semana</a>
    <div class="auth-card reveal">
      <span class="eyebrow">${escapeHtml(diaLabel(dia.dia_semana))}</span>
      <h1>Cargar pesos</h1>
      <p class="subtitle">${escapeHtml(routine!.nombre)} · Semana ${semana.numero}</p>
      ${trackable
        .map((exc) => {
          const last = latestWeights.get(exc.id);

          if (exc.mismo_peso) {
            const prev = last?.get(1);
            return `
        <div class="weight-field">
          <div>
            <div class="weight-field-label">${escapeHtml(exc.nombre_snapshot)}</div>
            <div class="weight-field-sub">${exc.serie}x${formatRepe(exc.repe, exc.repe_max)} · anterior: ${prev ? `${prev.peso} kg` : "sin registro"}</div>
          </div>
          <input type="number" class="mini-input weightInput" data-id="${exc.id}" data-exc-catalog="${exc.exercise_id}" data-serie="1" data-repe="${exc.repe}" placeholder="kg">
        </div>`;
          }

          const serieRows = Array.from({ length: exc.serie }, (_, i) => {
            const setIndex = i + 1;
            const prev = last?.get(setIndex);
            return `
        <div class="weight-field weight-field-serie">
          <div class="weight-field-sub">Serie ${setIndex} · anterior: ${prev ? `${prev.peso} kg` : "sin registro"}</div>
          <input type="number" class="mini-input weightInput" data-id="${exc.id}" data-exc-catalog="${exc.exercise_id}" data-serie="${setIndex}" data-repe="${exc.repe}" placeholder="kg">
        </div>`;
          }).join("");

          return `
        <div class="weight-field-group">
          <div class="weight-field-label">${escapeHtml(exc.nombre_snapshot)}</div>
          <div class="weight-field-sub weight-field-group-sub">${exc.serie}x${formatRepe(exc.repe, exc.repe_max)}</div>
          ${serieRows}
        </div>`;
        })
        .join("")}
      <div class="alert_message" id="alert_message"></div>
      <button class="btn btn-primary btn-block" id="saveWeights" type="button">Guardar</button>
    </div>
  `;

  document.getElementById("backToWeek")?.addEventListener("click", (e) => {
    e.preventDefault();
    backToWeek(weekIndex);
  });
  document.getElementById("saveWeights")?.addEventListener("click", () => saveWeights(weekIndex));
}

async function saveWeights(weekIndex: number) {
  const alertMessage = document.getElementById("alert_message")!;
  const inputs = document.querySelectorAll<HTMLInputElement>(".weightInput");
  const today = new Date().toISOString().slice(0, 10);

  const entries: { routine_exercise_id: string; exercise_id: string; fecha: string; peso: number; serie: number; repe: number }[] = [];
  let error = false;

  inputs.forEach((input) => {
    const value = input.value.trim();
    if (value === "") return;
    const peso = Number(value);
    if (Number.isNaN(peso) || peso <= 0) {
      error = true;
      return;
    }
    entries.push({
      routine_exercise_id: input.dataset.id!,
      exercise_id: input.dataset.excCatalog!,
      fecha: today,
      peso,
      serie: Number(input.dataset.serie),
      repe: Number(input.dataset.repe),
    });
  });

  if (error) {
    alertMessage.innerHTML = "<p>Ingresá solo números mayores a 0.</p>";
    return;
  }
  if (entries.length === 0) {
    alertMessage.innerHTML = "<p>Cargá al menos un peso para guardar.</p>";
    return;
  }

  alertMessage.innerHTML = "";
  const loaderBody = document.getElementById("loaderBody")!;
  loaderBody.innerHTML = `<div class="loader-container"><div class="modern-spinner"></div><p>Guardando pesos...</p></div>`;

  try {
    await insertWeightLogs(userId, entries);
    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
        <p>¡Peso actualizado con éxito! Espere, será redirigido.</p>
      </div>
    `;
    setTimeout(() => {
      window.location.href = "profile.html";
    }, 2000);
  } catch {
    loaderBody.innerHTML = "";
    alertMessage.innerHTML = "<p>ERROR! No se pudo guardar.</p>";
    void weekIndex;
  }
}

async function init() {
  routine = routineId ? await getRoutineDetail(routineId) : null;

  if (!routine) {
    const title = document.getElementById("routineTitle");
    if (title) title.textContent = "No se encontró esta rutina.";
    document.getElementById("weekPicker")?.remove();
    document.getElementById("weekStatus")?.remove();
    return;
  }

  const allExerciseIds = routine.semanas.flatMap((s) => s.dias.flatMap((d) => d.ejercicios.map((e) => e.id)));
  latestWeights = await getLatestWeights(allExerciseIds);

  const title = document.getElementById("routineTitle");
  const subtitle = document.getElementById("routineSubtitle");
  if (title) title.textContent = routine.nombre;
  if (subtitle) subtitle.textContent = "Elegí un día para cargar el peso de hoy.";

  const startWeek = currentWeekIndex();
  const weekSelect = document.getElementById("weekSelect") as HTMLSelectElement;
  weekSelect.innerHTML = routine.semanas.map((semana, index) => `<option value="${index}">Semana ${semana.numero}</option>`).join("");
  weekSelect.value = String(startWeek);
  weekSelect.addEventListener("change", () => renderWeek(Number(weekSelect.value)));

  renderWeek(startWeek);
}

init();
