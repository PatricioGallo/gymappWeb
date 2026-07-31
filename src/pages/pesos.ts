import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { diaLabel } from "../lib/dias";
import { getRoutineDetail, type RoutineDetail } from "../services/routine.service";
import { insertWeightLogs, getLatestWeights, getExerciseHistory, type LatestWeightsMap, type LatestWeightEntry, type WeightUnit } from "../services/weightLog.service";
import { formatRepe } from "../lib/reps";
import { openExerciseModal } from "../lib/exerciseModal";

const UNIT_LABELS: Record<WeightUnit, string> = { kg: "Kg", lb: "Lb", bloques: "Bloques" };

function unitOptionsMarkup(selected: WeightUnit): string {
  return (Object.keys(UNIT_LABELS) as WeightUnit[])
    .map((u) => `<option value="${u}" ${u === selected ? "selected" : ""}>${UNIT_LABELS[u]}</option>`)
    .join("");
}

const TODAY = new Date().toISOString().slice(0, 10);

// Muestra el ultimo valor guardado por unidad, sin importar la fecha: puede ser de
// otra semana de la rutina o de hoy mismo (si ya se cargo en otra ocurrencia del ejercicio).
function previousValuesText(entries: LatestWeightEntry[] | undefined): string {
  if (!entries || entries.length === 0) return "sin registro";
  return entries.map((e) => `${e.peso} ${UNIT_LABELS[e.unidad]}${e.repe ? ` x ${e.repe} reps` : ""}`).join(" · ");
}

function todayEntry(entries: LatestWeightEntry[] | undefined): LatestWeightEntry | null {
  return entries?.find((e) => e.fecha === TODAY) ?? null;
}

function defaultUnit(entries: LatestWeightEntry[] | undefined): WeightUnit {
  return entries && entries.length > 0 ? entries[0].unidad : "kg";
}

// Unidad sugerida a nivel ejercicio: la mas reciente entre todas las series,
// ya que la unidad se elige una sola vez para todo el ejercicio.
function exerciseDefaultUnit(bySerie: Map<number, LatestWeightEntry[]> | undefined, serieCount: number): WeightUnit {
  let best: LatestWeightEntry | null = null;
  for (let i = 1; i <= serieCount; i++) {
    const top = bySerie?.get(i)?.[0];
    if (top && (!best || top.fecha > best.fecha)) best = top;
  }
  return best ? best.unidad : "kg";
}

setupNavToggle();
setupRevealObserver();
const userId = await requireAuth();

const params = new URLSearchParams(window.location.search);
const routineId = params.get("rid");

let routine: RoutineDetail | null = null;
let latestWeights: LatestWeightsMap = new Map();
let exerciseHistory: LatestWeightsMap = new Map();
let allExerciseIds: string[] = [];
let allCatalogExerciseIds: string[] = [];

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

function weekProgress(weekIndex: number): number {
  const semana = routine!.semanas[weekIndex];
  let total = 0;
  let done = 0;
  semana.dias.forEach((dia) => {
    dia.ejercicios.forEach((e) => {
      total++;
      if (latestWeights.has(e.id)) done++;
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
    <span class="hero-badge">Progreso de la semana: ${weekProgress(weekIndex)}%</span>
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

function openWeightsHelp(): void {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>¿Cómo cargo los pesos?</h2>
        <p class="subtitle">Guía rápida para registrar tu entrenamiento.</p>
        <div class="help-list">
          <div class="help-item">
            <strong>Peso</strong>
            <p>El peso que levantaste en esa serie. Elegí la unidad (Kg, Lb o Bloques) en el selector de arriba.</p>
          </div>
          <div class="help-item">
            <strong>Reps</strong>
            <p>Cuántas repeticiones hiciste realmente en esa serie. Viene precargado con las repeticiones sugeridas por la rutina, pero podés cambiarlo si hiciste más o menos.</p>
          </div>
          <div class="help-item">
            <strong>Anterior</strong>
            <p>Te muestra el último peso y las repeticiones que registraste en esa serie, para que puedas comparar tu progreso.</p>
          </div>
          <div class="help-item">
            <strong>Guardar</strong>
            <p>Guarda todas las series que hayas completado. Podés dejar series vacías si todavía no las hiciste y cargarlas más tarde.</p>
          </div>
        </div>
        <div class="modal-actions"><button class="btn btn-outline" id="closeWeightsHelp">Entendido</button></div>
      </div>
    </div>
  `;
  document.getElementById("closeWeightsHelp")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });
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
      <p class="subtitle">${escapeHtml(routine!.nombre)} · Semana ${semana.numero} · <button type="button" class="help-link" id="weightsHelpBtn">¿Cómo cargo esto?</button></p>
      ${trackable
        .map((exc, idx) => {
          const last = latestWeights.get(exc.id);
          const history = exerciseHistory.get(exc.exercise_id);
          const unit = exc.mismo_peso ? defaultUnit(history?.get(1)) : exerciseDefaultUnit(history, exc.serie);

          const rows = exc.mismo_peso
            ? [{ setIndex: 1, subLabel: "Anterior" }]
            : Array.from({ length: exc.serie }, (_, i) => ({ setIndex: i + 1, subLabel: `Serie ${i + 1} · anterior` }));

          const rowsMarkup = rows
            .map(({ setIndex, subLabel }) => {
              const today = todayEntry(last?.get(setIndex));
              const historyEntries = history?.get(setIndex);
              const repeValue = today ? today.repe ?? exc.repe : exc.repe;
              return `
        <div class="weight-field-serie">
          <div class="weight-field-sub">${subLabel}: ${previousValuesText(historyEntries)}</div>
          <div class="weight-field-inputs">
            <input type="number" class="mini-input weightInput" data-id="${exc.id}" data-exc-catalog="${exc.exercise_id}" data-serie="${setIndex}" placeholder="kg" value="${today ? today.peso : ""}">
            <span class="weight-field-x">x</span>
            <input type="number" class="mini-input repInput" placeholder="reps" value="${repeValue ?? ""}">
          </div>
        </div>`;
            })
            .join("");

          return `
        <div class="weight-field-group">
          <div class="weight-field-group-head">
            <button type="button" class="weight-field-label exc-info-btn" data-exc-idx="${idx}">${escapeHtml(exc.nombre_snapshot)}</button>
            <select class="mini-input weightUnitSelect">${unitOptionsMarkup(unit)}</select>
          </div>
          <div class="weight-field-sub weight-field-group-sub">${exc.serie} series x ${formatRepe(exc.repe, exc.repe_max)} repeticiones</div>
          ${rowsMarkup}
        </div>`;
        })
        .join("")}
      <div class="alert_message" id="alert_message"></div>
      <button class="btn btn-primary btn-block" id="saveWeights" type="button">Guardar</button>
    </div>
  `;

  weekContent.querySelectorAll<HTMLButtonElement>(".exc-info-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const exc = trackable[Number(btn.dataset.excIdx)];
      openExerciseModal(exc.nombre_snapshot, exc.info_snapshot, exc.nota, exc.authorName ?? "Gym Social", exc.category, exc.image_url);
    });
  });

  document.getElementById("weightsHelpBtn")?.addEventListener("click", openWeightsHelp);

  document.getElementById("backToWeek")?.addEventListener("click", (e) => {
    e.preventDefault();
    backToWeek(weekIndex);
  });
  document.getElementById("saveWeights")?.addEventListener("click", () => saveWeights(weekIndex, diaIndex));
}

async function saveWeights(weekIndex: number, diaIndex: number) {
  const alertMessage = document.getElementById("alert_message")!;
  const inputs = document.querySelectorAll<HTMLInputElement>(".weightInput");
  const today = new Date().toISOString().slice(0, 10);

  const entries: { routine_exercise_id: string; exercise_id: string; fecha: string; peso: number; serie: number; repe: number; unidad: WeightUnit }[] = [];
  let error = false;

  inputs.forEach((input) => {
    const value = input.value.trim();
    if (value === "") return;
    const peso = Number(value);
    const repInput = input.closest(".weight-field-serie")?.querySelector<HTMLInputElement>(".repInput");
    const repeValue = repInput?.value.trim() ?? "";
    const repe = repeValue === "" ? NaN : Number(repeValue);
    if (Number.isNaN(peso) || peso <= 0 || Number.isNaN(repe) || repe <= 0) {
      error = true;
      return;
    }
    const unitSelect = input.closest(".weight-field, .weight-field-group")?.querySelector<HTMLSelectElement>(".weightUnitSelect");
    entries.push({
      routine_exercise_id: input.dataset.id!,
      exercise_id: input.dataset.excCatalog!,
      fecha: today,
      peso,
      serie: Number(input.dataset.serie),
      repe,
      unidad: (unitSelect?.value as WeightUnit) ?? "kg",
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
        <p>¡Peso actualizado con éxito!</p>
      </div>
    `;
    [latestWeights, exerciseHistory] = await Promise.all([getLatestWeights(allExerciseIds), getExerciseHistory(allCatalogExerciseIds)]);
    setTimeout(() => {
      loaderBody.innerHTML = "";
      openDay(weekIndex, diaIndex);
    }, 1500);
  } catch {
    loaderBody.innerHTML = "";
    alertMessage.innerHTML = "<p>ERROR! No se pudo guardar.</p>";
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

  allExerciseIds = routine.semanas.flatMap((s) => s.dias.flatMap((d) => d.ejercicios.map((e) => e.id)));
  allCatalogExerciseIds = [...new Set(routine.semanas.flatMap((s) => s.dias.flatMap((d) => d.ejercicios.map((e) => e.exercise_id))))];
  [latestWeights, exerciseHistory] = await Promise.all([getLatestWeights(allExerciseIds), getExerciseHistory(allCatalogExerciseIds)]);

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
