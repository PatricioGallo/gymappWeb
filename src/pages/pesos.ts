import { setupNavToggle, setupRevealObserver, requireAuth } from "../lib/nav";
import { escapeHtml } from "../lib/dom";
import { dayDisplayLabel } from "../lib/dias";
import { getRoutineDetail, type RoutineDetail } from "../services/routine.service";
import { getProfileBasicById, getProfilesBasicByIds } from "../services/profile.service";
import { routineOwnerLineMarkup } from "../lib/routineOwner";
import {
  insertWeightLogs,
  deleteTodayWeightLog,
  getLatestWeights,
  getExerciseHistory,
  type LatestWeightsMap,
  type LatestWeightEntry,
  type WeightUnit,
} from "../services/weightLog.service";
import { getTodayComments, upsertExerciseComment, deleteExerciseComment, MAX_COMMENT_LENGTH, type ExerciseComment } from "../services/comment.service";
import { formatRepe } from "../lib/reps";
import { openExerciseModal } from "../lib/exerciseModal";
import { submitErrorReport, validateErrorReport } from "../services/errorReport.service";

const UNIT_LABELS: Record<WeightUnit, string> = { kg: "Kg", lb: "Lb", bloques: "Bloques" };
const UNIT_PLACEHOLDERS: Record<WeightUnit, string> = { kg: "kg", lb: "lb", bloques: "bl" };

function unitOptionsMarkup(selected: WeightUnit): string {
  return (Object.keys(UNIT_LABELS) as WeightUnit[])
    .map((u) => `<option value="${u}" ${u === selected ? "selected" : ""}>${UNIT_LABELS[u]}</option>`)
    .join("");
}

// ---------- Menu de tres puntos por ejercicio (borrar carga de hoy) ----------

const WEIGHT_MENU_KEBAB_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
const WEIGHT_MENU_TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
const WEIGHT_MENU_REPORT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>`;
const WEIGHT_MENU_COMMENT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

function openReportErrorModal(excName?: string) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card modal-card-lg">
        <h2>Reportar un error</h2>
        <p class="subtitle">Contanos qué encontraste, lo revisamos desde el panel de administración.</p>

        <div class="field"><label for="reportSubject">Asunto</label><input type="text" id="reportSubject" placeholder="Ej: El botón de guardar no responde" value="${excName ? escapeHtml(`Problema con "${excName}"`) : ""}"></div>
        <div class="field"><label for="reportMessage">Mensaje</label><textarea id="reportMessage" rows="5" placeholder="Contanos qué pasó y qué esperabas que pasara"></textarea></div>

        <div class="alert_message" id="reportAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="reportSubmit" type="button">Enviar</button>
          <button class="btn btn-outline" id="reportCancel" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("reportCancel")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });

  document.getElementById("reportSubmit")?.addEventListener("click", async () => {
    const alertBox = document.getElementById("reportAlert")!;
    alertBox.innerHTML = "";

    const subject = (document.getElementById("reportSubject") as HTMLInputElement).value;
    const message = (document.getElementById("reportMessage") as HTMLTextAreaElement).value;

    const validationError = validateErrorReport(subject, message);
    if (validationError) {
      alertBox.innerHTML = `<p>${validationError === "subject_short" ? "Ingresá un asunto." : validationError === "subject_long" ? "El asunto es muy largo." : "El mensaje es muy largo."}</p>`;
      return;
    }

    const submitBtn = document.getElementById("reportSubmit") as HTMLButtonElement;
    submitBtn.disabled = true;
    const { error } = await submitErrorReport(myId, subject, message, window.location.pathname + window.location.search);
    submitBtn.disabled = false;

    if (error) {
      alertBox.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }

    loaderBody.innerHTML = `
      <div class="success-check-container">
        <div class="success-icon">
          <svg viewBox="0 0 52 52" class="success-svg">
            <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
            <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
          </svg>
        </div>
        <p>¡Gracias! Recibimos tu reporte.</p>
      </div>
    `;
    setTimeout(() => {
      loaderBody.innerHTML = "";
    }, 1800);
  });
}

function setupWeightMenuOutsideClick() {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".weight-menu-wrap")) return;
    document.querySelectorAll<HTMLElement>(".weight-menu-panel").forEach((p) => (p.hidden = true));
    document.querySelectorAll<HTMLButtonElement>(".weight-menu-btn").forEach((b) => {
      b.classList.remove("open");
      b.setAttribute("aria-expanded", "false");
    });
  });
}

function confirmDeleteWeightModal(exc: { id: string; nombre_snapshot: string }, weekIndex: number, diaIndex: number) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Borrar carga de hoy</h2>
        <p class="subtitle">Se va a borrar la carga de hoy que cargaste para "${escapeHtml(exc.nombre_snapshot)}". Los registros de días anteriores no se modifican.</p>
        <div class="modal-actions">
          <button class="btn btn-danger" id="confirmDeleteWeight" type="button">Borrar</button>
          <button class="btn btn-outline" id="cancelDeleteWeight" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("cancelDeleteWeight")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });

  document.getElementById("confirmDeleteWeight")?.addEventListener("click", async () => {
    loaderBody.innerHTML = `<div class="loader-container"><div class="modern-spinner"></div><p>Borrando carga...</p></div>`;
    try {
      await deleteTodayWeightLog(targetUserId, exc.id, TODAY);
      clearWeightDraftForExercise(weekIndex, diaIndex, exc.id);
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
          <p>Carga borrada con éxito.</p>
        </div>
      `;
      [latestWeights, exerciseHistory] = await Promise.all([getLatestWeights(allExerciseIds), getExerciseHistory(allCatalogExerciseIds)]);
      setTimeout(() => {
        loaderBody.innerHTML = "";
        openDay(weekIndex, diaIndex);
      }, 1200);
    } catch {
      loaderBody.innerHTML = "";
      alert("No se pudo borrar la carga. Intentá de nuevo.");
    }
  });
}

const TODAY = new Date().toISOString().slice(0, 10);

function openCommentModal(exc: { id: string; nombre_snapshot: string }, weekIndex: number, diaIndex: number) {
  const loaderBody = document.getElementById("loaderBody");
  if (!loaderBody) return;
  const existing = todayComments.get(exc.id);

  loaderBody.innerHTML = `
    <div class="success-check-container">
      <div class="modal-card">
        <h2>Comentario de hoy</h2>
        <p class="subtitle">"${escapeHtml(exc.nombre_snapshot)}"${isTrainingForOther && targetName ? ` · ${escapeHtml(targetName)}` : ""}</p>
        <div class="field">
          <label for="commentInput">¿Cómo te fue con este ejercicio hoy?</label>
          <textarea id="commentInput" rows="4" maxlength="${MAX_COMMENT_LENGTH}">${escapeHtml(existing?.comment ?? "")}</textarea>
        </div>
        <div class="alert_message" id="commentAlert"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="saveComment" type="button">Guardar</button>
          ${existing ? `<button class="btn btn-danger" id="deleteComment" type="button">Borrar</button>` : ""}
          <button class="btn btn-outline" id="cancelComment" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("cancelComment")?.addEventListener("click", () => {
    loaderBody.innerHTML = "";
  });

  document.getElementById("saveComment")?.addEventListener("click", async () => {
    const alertEl = document.getElementById("commentAlert")!;
    const text = (document.getElementById("commentInput") as HTMLTextAreaElement).value.trim();
    if (text.length === 0) {
      alertEl.innerHTML = "<p>Escribí algo antes de guardar.</p>";
      return;
    }
    const saveBtn = document.getElementById("saveComment") as HTMLButtonElement;
    saveBtn.disabled = true;
    const { error } = await upsertExerciseComment(targetUserId, exc.id, TODAY, text);
    saveBtn.disabled = false;
    if (error) {
      alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
      return;
    }
    todayComments = await getTodayComments(allExerciseIds, TODAY);
    loaderBody.innerHTML = "";
    openDay(weekIndex, diaIndex);
  });

  document.getElementById("deleteComment")?.addEventListener("click", async () => {
    if (!existing) return;
    const { error } = await deleteExerciseComment(existing.id);
    if (error) {
      alert(error);
      return;
    }
    todayComments = await getTodayComments(allExerciseIds, TODAY);
    loaderBody.innerHTML = "";
    openDay(weekIndex, diaIndex);
  });
}

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
setupWeightMenuOutsideClick();
const myId = await requireAuth();

const params = new URLSearchParams(window.location.search);
const routineId = params.get("rid");
// Un entrenador puede entrenar "por" un alumno (suscriptor aceptado): carga pesos y
// comentarios a nombre de esa persona, como si estuvieran juntos en el gimnasio.
const targetUserId = params.get("uid") ?? myId;
const isTrainingForOther = targetUserId !== myId;
let targetName: string | null = null;

if (isTrainingForOther) document.getElementById("backToAlumnos")?.removeAttribute("hidden");

let routine: RoutineDetail | null = null;
let latestWeights: LatestWeightsMap = new Map();
let exerciseHistory: LatestWeightsMap = new Map();
let todayComments: Map<string, ExerciseComment> = new Map();
let allExerciseIds: string[] = [];
let allCatalogExerciseIds: string[] = [];

// ---------------------------------------------------------------------------
// Borrador local: si el usuario sale de la carga de pesos sin tocar "Guardar" (ej. a
// contestar un mensaje), lo que ya tipeó no se pierde -- se guarda en localStorage en
// cada tipeo y se restaura al volver a abrir ese mismo día, hasta que efectivamente
// guarde (o borre esa carga), momento en el que el borrador ya no hace falta.
// ---------------------------------------------------------------------------

interface WeightDraft {
  entries: Record<string, { peso?: string; repe?: string }>; // key: `${routineExerciseId}:${serie}`
  units: Record<string, WeightUnit>; // key: routineExerciseId
}

// weekIndex/diaIndex del día actualmente abierto: los usa el listener delegado de abajo
// (armado una sola vez) para saber bajo qué clave guardar cada tipeo.
let activeDraftWeek: number | null = null;
let activeDraftDia: number | null = null;

function draftKey(weekIndex: number, diaIndex: number): string {
  return `gs_pesos_draft_${routineId}_${targetUserId}_${weekIndex}_${diaIndex}`;
}

function loadWeightDraft(weekIndex: number, diaIndex: number): WeightDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(weekIndex, diaIndex));
    return raw ? (JSON.parse(raw) as WeightDraft) : null;
  } catch {
    return null;
  }
}

function clearWeightDraft(weekIndex: number, diaIndex: number): void {
  localStorage.removeItem(draftKey(weekIndex, diaIndex));
}

// Al borrar la carga de hoy de un ejercicio puntual (menu de tres puntos), si quedaba un
// borrador con esos mismos valores, restoreWeightDraft() los volvería a poner apenas se
// vuelve a abrir el día -- como si el borrado no hubiera pasado. Se limpia solo lo de ese
// ejercicio, sin tocar el borrador de los demás ejercicios de la misma jornada.
function clearWeightDraftForExercise(weekIndex: number, diaIndex: number, routineExerciseId: string): void {
  const draft = loadWeightDraft(weekIndex, diaIndex);
  if (!draft) return;
  let changed = false;
  Object.keys(draft.entries).forEach((key) => {
    if (key.startsWith(`${routineExerciseId}:`)) {
      delete draft.entries[key];
      changed = true;
    }
  });
  if (draft.units[routineExerciseId]) {
    delete draft.units[routineExerciseId];
    changed = true;
  }
  if (!changed) return;
  if (Object.keys(draft.entries).length === 0) clearWeightDraft(weekIndex, diaIndex);
  else localStorage.setItem(draftKey(weekIndex, diaIndex), JSON.stringify(draft));
}

// Vuelca lo que hay ahora mismo en los inputs de esa jornada a localStorage -- se llama en
// cada tipeo (ver el listener delegado en weekContent, mas abajo). Si no quedó nada
// cargado, borra el borrador en vez de dejar una entrada vacía dando vueltas.
function saveWeightDraft(weekIndex: number, diaIndex: number): void {
  const weekContent = document.getElementById("weekContent")!;
  const entries: WeightDraft["entries"] = {};
  const units: WeightDraft["units"] = {};
  let hasAny = false;

  weekContent.querySelectorAll<HTMLInputElement>(".weightInput").forEach((input) => {
    const routineExerciseId = input.dataset.id;
    const serie = input.dataset.serie;
    if (!routineExerciseId || !serie) return;
    const repInput = input.closest(".weight-field-serie")?.querySelector<HTMLInputElement>(".repInput");
    const peso = input.value.trim();
    const repe = repInput?.value.trim() ?? "";
    if (peso === "" && repe === "") return;
    entries[`${routineExerciseId}:${serie}`] = { peso: peso || undefined, repe: repe || undefined };
    hasAny = true;
  });
  weekContent.querySelectorAll<HTMLSelectElement>(".weightUnitSelect").forEach((select) => {
    const routineExerciseId = select.closest(".weight-field-group")?.querySelector<HTMLInputElement>(".weightInput")?.dataset.id;
    if (routineExerciseId) units[routineExerciseId] = select.value as WeightUnit;
  });

  if (!hasAny) {
    clearWeightDraft(weekIndex, diaIndex);
    return;
  }
  localStorage.setItem(draftKey(weekIndex, diaIndex), JSON.stringify({ entries, units }));
}

// Aplica el borrador guardado (si hay) sobre los inputs recien renderizados de ese día,
// pisando lo que haya venido precargado del servidor -- el borrador es lo último que el
// usuario tipeó, mas reciente que cualquier carga previa.
function restoreWeightDraft(weekIndex: number, diaIndex: number): void {
  const draft = loadWeightDraft(weekIndex, diaIndex);
  if (!draft) return;
  const weekContent = document.getElementById("weekContent")!;

  weekContent.querySelectorAll<HTMLInputElement>(".weightInput").forEach((input) => {
    const entry = draft.entries[`${input.dataset.id}:${input.dataset.serie}`];
    if (!entry) return;
    if (entry.peso !== undefined) input.value = entry.peso;
    if (entry.repe !== undefined) {
      const repInput = input.closest(".weight-field-serie")?.querySelector<HTMLInputElement>(".repInput");
      if (repInput) repInput.value = entry.repe;
    }
  });

  weekContent.querySelectorAll<HTMLSelectElement>(".weightUnitSelect").forEach((select) => {
    const group = select.closest(".weight-field-group");
    const routineExerciseId = group?.querySelector<HTMLInputElement>(".weightInput")?.dataset.id;
    const unit = routineExerciseId ? draft.units[routineExerciseId] : undefined;
    if (!unit) return;
    select.value = unit;
    // El placeholder de los inputs de peso depende de la unidad elegida (ver el listener
    // de "change" del select mas abajo); como el value se setea a mano sin disparar ese
    // evento, el placeholder tambien hay que actualizarlo a mano.
    const placeholder = UNIT_PLACEHOLDERS[unit];
    group?.querySelectorAll<HTMLInputElement>(".weightInput").forEach((inp) => (inp.placeholder = placeholder));
  });
}

// Delegado una sola vez sobre el contenedor estable (su innerHTML se reemplaza en cada
// openDay(), pero el nodo en si nunca cambia) -- evita reenganchar un listener nuevo por
// cada input de cada ejercicio, y por cada visita a un día.
document.getElementById("weekContent")?.addEventListener("input", (e) => {
  if (activeDraftWeek === null || activeDraftDia === null) return;
  if ((e.target as HTMLElement).matches(".weightInput, .repInput")) saveWeightDraft(activeDraftWeek, activeDraftDia);
});
document.getElementById("weekContent")?.addEventListener("change", (e) => {
  if (activeDraftWeek === null || activeDraftDia === null) return;
  if ((e.target as HTMLElement).matches(".weightUnitSelect")) saveWeightDraft(activeDraftWeek, activeDraftDia);
});

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

// Un ejercicio se considera completo solo cuando TODAS sus series tienen peso
// cargado (una sola serie, con mismo_peso, cuenta como todas).
function isExerciseDone(e: { id: string; serie: number; mismo_peso: boolean }): boolean {
  const bySerie = latestWeights.get(e.id);
  if (!bySerie) return false;
  const requiredSeries = e.mismo_peso ? 1 : e.serie;
  for (let i = 1; i <= requiredSeries; i++) {
    if (!bySerie.get(i)?.length) return false;
  }
  return true;
}

function dayProgress(dia: RoutineDetail["semanas"][number]["dias"][number]): number {
  const trackable = dia.ejercicios.filter((e) => e.es_medible);
  if (trackable.length === 0) return 100;
  const done = trackable.filter((e) => isExerciseDone(e)).length;
  return Math.round((done / trackable.length) * 100);
}

// Timestamp mas reciente entre TODOS los registros de TODOS los ejercicios medibles de
// este día (cualquier serie, cualquier unidad) -- "cuando se tocó por última vez este
// día", usado por dayStatus() para decidir si ya pasó a Incompleto. null si nunca se
// cargó nada para este día.
function dayLastActivityAt(dia: RoutineDetail["semanas"][number]["dias"][number]): string | null {
  let latest: string | null = null;
  dia.ejercicios
    .filter((e) => e.es_medible)
    .forEach((e) => {
      latestWeights.get(e.id)?.forEach((entries) => {
        entries.forEach((entry) => {
          if (!latest || entry.createdAt > latest) latest = entry.createdAt;
        });
      });
    });
  return latest;
}

type DayStatus = "done" | "pending" | "incomplete";

const INCOMPLETE_AFTER_HOURS = 24;

/**
 * "Pendiente": todavía no se completó y sigue siendo una sesión vigente/futura -- nunca se
 * tocó, o se tocó hace menos de 24hs y no se empezó después otro día de la misma semana.
 * "Incompleto": quedó a medias en el pasado -- pasaron más de 24hs desde el último toque,
 * o ya se empezó (más reciente) otro día de la misma semana, así que no se va a completar.
 */
function dayStatus(semana: RoutineDetail["semanas"][number], dia: RoutineDetail["semanas"][number]["dias"][number]): DayStatus {
  if (dayProgress(dia) >= 100) return "done";

  const lastActivity = dayLastActivityAt(dia);
  if (!lastActivity) return "pending";

  const hoursSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / 3_600_000;
  if (hoursSinceActivity > INCOMPLETE_AFTER_HOURS) return "incomplete";

  const startedOtherDayAfter = semana.dias.some((otherDia) => {
    if (otherDia === dia) return false;
    const otherActivity = dayLastActivityAt(otherDia);
    return otherActivity !== null && otherActivity > lastActivity;
  });
  return startedOtherDayAfter ? "incomplete" : "pending";
}

function routineProgress(): number {
  let total = 0;
  let done = 0;
  routine!.semanas.forEach((semana) => {
    semana.dias.forEach((dia) => {
      dia.ejercicios.forEach((e) => {
        total++;
        if (isExerciseDone(e)) done++;
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
      if (isExerciseDone(e)) done++;
    });
  });
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function currentWeekIndex(): number {
  let found = -1;
  routine!.semanas.forEach((semana, index) => {
    semana.dias.forEach((dia) => {
      dia.ejercicios.forEach((e) => {
        if (isExerciseDone(e)) found = index;
      });
    });
  });
  return found === -1 ? 0 : found;
}

function renderWeekStatus(weekIndex: number) {
  const weekStatus = document.getElementById("weekStatus")!;
  weekStatus.innerHTML = `
    <span class="hero-badge">Progreso de la semana: ${weekProgress(weekIndex)}%</span>
    <span class="hero-badge">Progreso de la rutina: ${routineProgress()}%</span>
  `;
}

function renderWeek(weekIndex: number) {
  const semana = routine!.semanas[weekIndex];
  const weekContent = document.getElementById("weekContent")!;
  weekContent.dataset.week = String(weekIndex);
  renderWeekStatus(weekIndex);

  const STATUS_LABELS: Record<DayStatus, string> = { done: "Completo", pending: "Pendiente", incomplete: "Incompleto" };

  weekContent.innerHTML = semana.dias
    .map((dia, diaIndex) => {
      const pct = dayProgress(dia);
      const status = dayStatus(semana, dia);
      const trackableCount = dia.ejercicios.filter((e) => e.es_medible).length;
      const doneCount = dia.ejercicios.filter((e) => e.es_medible && isExerciseDone(e)).length;
      const subtitle = trackableCount === 0 ? "Sin ejercicios con peso" : `${doneCount} de ${trackableCount} ejercicios con peso cargado`;

      return `
        <button class="day-row reveal ${status}" type="button" data-dia="${diaIndex}">
          ${ringMarkup(pct)}
          <div class="day-row-info"><h3>${escapeHtml(dayDisplayLabel(dia.dia_semana, dia.nombre))}</h3><p>${subtitle}</p></div>
          <span class="day-row-status ${status}">${STATUS_LABELS[status]}</span>
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
  activeDraftWeek = null;
  activeDraftDia = null;
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
  activeDraftWeek = weekIndex;
  activeDraftDia = diaIndex;

  const trackable = dia.ejercicios.filter((e) => e.es_medible);

  if (trackable.length === 0) {
    weekContent.innerHTML = `
      <a class="back-link" id="backToWeek" href="#"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</a>
      <div class="empty-state reveal"><h3>${escapeHtml(dayDisplayLabel(dia.dia_semana, dia.nombre))} no tiene ejercicios con peso</h3><p>No hay nada para cargar este día.</p></div>
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
      <span class="eyebrow">${escapeHtml(dayDisplayLabel(dia.dia_semana, dia.nombre))}</span>
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

          const hasTodayLoad = rows.some(({ setIndex }) => todayEntry(last?.get(setIndex)) !== null);

          const rowsMarkup = rows
            .map(({ setIndex, subLabel }) => {
              const lastEntries = last?.get(setIndex);
              const today = todayEntry(lastEntries);
              const historyEntries = history?.get(setIndex);
              // Si hoy todavia no se cargo nada para esta serie, se precarga el campo con lo
              // ultimo que se cargo para esta misma ocurrencia (este dia/semana puntual), no
              // con el historial de otros dias donde aparezca el mismo ejercicio: un ejercicio
              // que todavia esta pendiente en este dia (nunca se cargo aca) tiene que arrancar
              // vacio, aunque el mismo ejercicio ya se haya cargado en otro dia de la rutina.
              const prefill = today ?? lastEntries?.[0] ?? null;
              const repeValue = prefill ? prefill.repe ?? exc.repe : exc.repe;
              return `
        <div class="weight-field-serie">
          <div class="weight-field-sub">${subLabel}: ${previousValuesText(historyEntries)}</div>
          <div class="weight-field-inputs">
            <input type="number" class="mini-input weightInput" data-id="${exc.id}" data-exc-catalog="${exc.exercise_id}" data-serie="${setIndex}" placeholder="${UNIT_PLACEHOLDERS[unit]}" value="${prefill ? prefill.peso : ""}">
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
            <div class="weight-menu-wrap">
              <button type="button" class="profile-menu-btn weight-menu-btn" data-exc-idx="${idx}" aria-label="Más opciones" aria-expanded="false">${WEIGHT_MENU_KEBAB_ICON}</button>
              <div class="profile-menu-panel weight-menu-panel" hidden>
                <button type="button" class="profile-menu-item weight-menu-comment" data-exc-idx="${idx}">${WEIGHT_MENU_COMMENT_ICON}${todayComments.has(exc.id) ? "Editar comentario" : "Agregar comentario"}</button>
                <button type="button" class="profile-menu-item profile-menu-item-danger weight-menu-delete" data-exc-idx="${idx}" ${hasTodayLoad ? "" : "disabled"}>${WEIGHT_MENU_TRASH_ICON}Borrar carga actual</button>
                <button type="button" class="profile-menu-item weight-menu-report" data-exc-idx="${idx}">${WEIGHT_MENU_REPORT_ICON}Reportar un error</button>
              </div>
            </div>
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

  restoreWeightDraft(weekIndex, diaIndex);

  weekContent.querySelectorAll<HTMLButtonElement>(".exc-info-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const exc = trackable[Number(btn.dataset.excIdx)];
      openExerciseModal(exc.nombre_snapshot, exc.info_snapshot, exc.nota, exc.authorName ?? "Gym Social", exc.category, exc.image_url, targetUserId, exc.exercise_id);
    });
  });

  weekContent.querySelectorAll<HTMLSelectElement>(".weightUnitSelect").forEach((select) => {
    select.addEventListener("change", () => {
      const placeholder = UNIT_PLACEHOLDERS[select.value as WeightUnit];
      select
        .closest(".weight-field-group")
        ?.querySelectorAll<HTMLInputElement>(".weightInput")
        .forEach((input) => (input.placeholder = placeholder));
    });
  });

  weekContent.querySelectorAll<HTMLButtonElement>(".weight-menu-btn").forEach((btn) => {
    const panel = btn.nextElementSibling as HTMLElement | null;
    if (!panel) return;
    btn.addEventListener("click", () => {
      const willOpen = panel.hidden;
      weekContent.querySelectorAll<HTMLElement>(".weight-menu-panel").forEach((p) => (p.hidden = true));
      weekContent.querySelectorAll<HTMLButtonElement>(".weight-menu-btn").forEach((b) => {
        b.classList.remove("open");
        b.setAttribute("aria-expanded", "false");
      });
      panel.hidden = !willOpen;
      btn.classList.toggle("open", willOpen);
      btn.setAttribute("aria-expanded", String(willOpen));
    });
  });

  weekContent.querySelectorAll<HTMLButtonElement>(".weight-menu-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const exc = trackable[Number(btn.dataset.excIdx)];
      btn.closest<HTMLElement>(".weight-menu-panel")!.hidden = true;
      confirmDeleteWeightModal(exc, weekIndex, diaIndex);
    });
  });

  weekContent.querySelectorAll<HTMLButtonElement>(".weight-menu-report").forEach((btn) => {
    btn.addEventListener("click", () => {
      const exc = trackable[Number(btn.dataset.excIdx)];
      btn.closest<HTMLElement>(".weight-menu-panel")!.hidden = true;
      openReportErrorModal(exc.nombre_snapshot);
    });
  });

  weekContent.querySelectorAll<HTMLButtonElement>(".weight-menu-comment").forEach((btn) => {
    btn.addEventListener("click", () => {
      const exc = trackable[Number(btn.dataset.excIdx)];
      btn.closest<HTMLElement>(".weight-menu-panel")!.hidden = true;
      openCommentModal(exc, weekIndex, diaIndex);
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
    await insertWeightLogs(targetUserId, entries);
    clearWeightDraft(weekIndex, diaIndex); // ya quedo guardado remoto, el borrador local no hace mas falta
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
  [latestWeights, exerciseHistory, todayComments] = await Promise.all([
    getLatestWeights(allExerciseIds),
    getExerciseHistory(allCatalogExerciseIds),
    getTodayComments(allExerciseIds, TODAY),
  ]);
  if (isTrainingForOther) {
    const target = await getProfileBasicById(targetUserId).catch(() => null);
    targetName = target?.nombre ?? null;
  }

  const title = document.getElementById("routineTitle");
  const subtitle = document.getElementById("routineSubtitle");
  const ownerBanner = document.getElementById("routineOwnerBanner");
  if (title) title.textContent = routine.nombre;
  if (subtitle) {
    subtitle.textContent = isTrainingForOther
      ? `Estás cargando pesos para ${targetName ?? "tu alumno"}. Elegí la semana y el día.`
      : "Elegí la semana y el día para cargar el peso de hoy.";
  }
  if (ownerBanner) {
    const profiles = await getProfilesBasicByIds([routine.user_id, routine.assigned_by]);
    ownerBanner.innerHTML = routineOwnerLineMarkup(profiles.get(routine.user_id), routine.assigned_by ? profiles.get(routine.assigned_by) : null);
  }

  const startWeek = currentWeekIndex();
  const weekSelect = document.getElementById("weekSelect") as HTMLSelectElement;
  weekSelect.innerHTML = routine.semanas.map((semana, index) => `<option value="${index}">Semana ${semana.numero}</option>`).join("");
  weekSelect.value = String(startWeek);
  weekSelect.addEventListener("change", () => renderWeek(Number(weekSelect.value)));

  renderWeek(startWeek);
}

init();
