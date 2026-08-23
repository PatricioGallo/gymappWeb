import type { ViewModule } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { requireAuth } from "../lib/nav";
import { listGymClasses, type GymClassRow } from "../services/gymClass.service";
import {
  listGymTrainers,
  getGymTrainerHandleStatus,
  type GymTrainerRow,
  type GymTrainerHandleStatus,
  type HandleInitiatedBy,
} from "../services/gymTrainer.service";
import { getGymMembershipStatus } from "../services/gymMember.service";
import { getProfileBasicById, getProfileBasicByUsername } from "../services/profile.service";
import { CLASS_DAY_LABELS, classImageHtml } from "../lib/gymClassMarkup";
import { openClassDetailModal } from "../lib/gymClassEnrollModal";
import { openClassManageForm, confirmDeleteGymClass } from "../lib/gymClassManageModal";

// ---------------------------------------------------------------------------
// clases.html: calendario semanal de un gimnasio, compartido por dueño y visitante.
// La diferencia entre roles es puramente de interaccion (ver mountClasesView mas abajo):
// el dueño ve "+ Nueva clase" y al tocar una clase gestiona (Editar/Eliminar) en vez de
// inscribirse -- misma pagina, mismo componente de calendario para los dos.
// ---------------------------------------------------------------------------

const CALENDAR_VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <a href="#" class="back-link" id="clasesBackLink"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Volver al perfil</a>
      <span class="eyebrow">Gimnasio</span>
      <h1 id="clasesTitle">Clases</h1>
      <p id="clasesSubtitle" hidden>Armá las clases de tu gimnasio: horarios, profesor e inscripción de socios.</p>
    </div>
  </section>
  <section class="features">
    <div class="container">
      <div class="routines-header-actions" id="clasesHeaderActions" hidden>
        <button class="btn btn-primary btn-sm" id="newClassBtn" type="button">+ Nueva clase</button>
      </div>
      <p class="chart-sub" id="clasesSummary">Cargando...</p>
      <div class="class-calendar" id="clasesCalendar" hidden>
        <div class="class-calendar-scroll">
          <div class="class-calendar-grid" id="clasesGrid"></div>
        </div>
      </div>
      <div id="clasesNoScheduleWrap" hidden>
        <h3 class="gym-subsection-title">Sin horario asignado</h3>
        <div class="search-page-list" id="clasesNoScheduleList"></div>
      </div>
    </div>
  </section>
`;

function noScheduleCardMarkup(c: GymClassRow): string {
  const instructorName = c.instructorId ? `${c.instructorNombre ?? ""} ${c.instructorApellido ?? ""}`.trim() || c.instructorUsername : null;
  return `
    <div class="routine-card reveal" data-id="${c.id}">
      ${classImageHtml(c.imageUrl)}
      <h3>${escapeHtml(c.name)}</h3>
      <div class="routine-stats">
        <div><span>Profesor</span><strong>${instructorName ? escapeHtml(instructorName) : "Sin asignar"}</strong></div>
        <div><span>Inscripción</span><strong>${c.allowEnrollment ? "Habilitada" : "Deshabilitada"}</strong></div>
      </div>
      <div class="routine-actions">
        <button type="button" class="btn btn-outline btn-sm manageClassBtn" data-id="${c.id}">Gestionar</button>
      </div>
    </div>
  `;
}

const PX_PER_HOUR = 60;
const FALLBACK_AXIS_START = 8 * 60; // 08:00
const FALLBACK_AXIS_END = 21 * 60; // 21:00

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToLabel(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

interface ClassBlock {
  classRow: GymClassRow;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  lane: number;
  laneCount: number;
}

function buildCalendarBlocks(classes: GymClassRow[]): ClassBlock[] {
  const blocks: ClassBlock[] = [];
  for (const c of classes) {
    for (const s of c.sessions) {
      blocks.push({ classRow: c, dayOfWeek: s.dayOfWeek, startMin: timeToMinutes(s.startTime), endMin: timeToMinutes(s.endTime), lane: 0, laneCount: 1 });
    }
  }
  // Asignacion de "carriles" (lanes) lado a lado por dia, greedy por orden de inicio -- el
  // algoritmo clasico de "minimo de salas de reunion". Suficiente para horarios de gimnasio
  // (pocos solapamientos), no busca minimizar carriles por cluster de solapamiento individual.
  for (let day = 0; day < 7; day++) {
    const dayBlocks = blocks.filter((b) => b.dayOfWeek === day).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const laneEnds: number[] = [];
    for (const b of dayBlocks) {
      let lane = laneEnds.findIndex((end) => end <= b.startMin);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = b.endMin;
      b.lane = lane;
    }
    const laneCount = laneEnds.length || 1;
    for (const b of dayBlocks) b.laneCount = laneCount;
  }
  return blocks;
}

function calendarGridHtml(blocks: ClassBlock[]): string {
  const allTimes = blocks.flatMap((b) => [b.startMin, b.endMin]);
  const axisStart = allTimes.length ? Math.floor((Math.min(...allTimes) - 30) / 60) * 60 : FALLBACK_AXIS_START;
  const axisEnd = allTimes.length ? Math.ceil((Math.max(...allTimes) + 30) / 60) * 60 : FALLBACK_AXIS_END;
  const totalPx = ((axisEnd - axisStart) / 60) * PX_PER_HOUR;

  const hourLabels: string[] = [];
  for (let m = axisStart; m <= axisEnd; m += 60) {
    hourLabels.push(`<span class="class-calendar-hour-label" style="top:${((m - axisStart) / 60) * PX_PER_HOUR}px">${String(Math.floor(m / 60)).padStart(2, "0")}:00</span>`);
  }

  const dayCols = CLASS_DAY_LABELS.map((_label, day) => {
    const dayBlocks = blocks.filter((b) => b.dayOfWeek === day);
    const blocksHtml = dayBlocks
      .map((b) => {
        const top = ((b.startMin - axisStart) / 60) * PX_PER_HOUR;
        const height = Math.max(((b.endMin - b.startMin) / 60) * PX_PER_HOUR, 24);
        const widthPct = 100 / b.laneCount;
        const leftPct = b.lane * widthPct;
        return `
          <button type="button" class="class-calendar-block" data-id="${b.classRow.id}"
            style="top:${top}px; height:${height}px; left:${leftPct}%; width:calc(${widthPct}% - 4px);">
            <strong>${escapeHtml(b.classRow.name)}</strong>
            <span>${minutesToLabel(b.startMin)}-${minutesToLabel(b.endMin)}</span>
          </button>`;
      })
      .join("");
    return `<div class="class-calendar-day-col" style="height:${totalPx}px">${blocksHtml}</div>`;
  }).join("");

  return `
    <div class="class-calendar-corner"></div>
    ${CLASS_DAY_LABELS.map((l) => `<div class="class-calendar-day-head">${l.slice(0, 3)}</div>`).join("")}
    <div class="class-calendar-time-axis" style="height:${totalPx}px">${hourLabels.join("")}</div>
    ${dayCols}
  `;
}

async function mountClasesView(
  container: HTMLElement,
  gymId: string,
  gymUsername: string | null,
  ctx: Parameters<ViewModule["mount"]>[2],
  authUserId: string | null,
  isOwner: boolean
): Promise<void> {
  container.innerHTML = CALENDAR_VIEW_MARKUP;

  const backLink = container.querySelector<HTMLAnchorElement>("#clasesBackLink")!;
  const titleEl = container.querySelector("#clasesTitle")!;
  const subtitleEl = container.querySelector<HTMLElement>("#clasesSubtitle")!;
  const headerActions = container.querySelector<HTMLElement>("#clasesHeaderActions")!;
  const newClassBtn = container.querySelector("#newClassBtn") as HTMLButtonElement;
  const summaryEl = container.querySelector("#clasesSummary")!;
  const calendarWrap = container.querySelector("#clasesCalendar") as HTMLElement;
  const gridEl = container.querySelector("#clasesGrid")!;
  const noScheduleWrap = container.querySelector<HTMLElement>("#clasesNoScheduleWrap")!;
  const noScheduleList = container.querySelector("#clasesNoScheduleList")!;

  backLink.href = isOwner ? "profile.html" : `profile.html?u=${encodeURIComponent(gymUsername ?? "")}`;
  titleEl.textContent = isOwner ? "Tus clases" : `Clases de ${gymUsername}`;
  if (isOwner) {
    subtitleEl.hidden = false;
    headerActions.hidden = false;
  }

  let trainers: GymTrainerRow[] = [];
  // Un entrenador que es handle activo de este gimnasio tiene los mismos beneficios que un
  // socio activo para inscribirse a clases -- ver el mismo comentario en profile.ts.
  const isActiveSocio =
    !isOwner && authUserId
      ? await Promise.all([
          getGymMembershipStatus(gymId).catch(() => "none" as const),
          getGymTrainerHandleStatus(gymId).catch(() => ({ status: "none" as GymTrainerHandleStatus, initiatedBy: null as HandleInitiatedBy })),
        ]).then(([socioStatus, handle]) => socioStatus === "active" || handle.status === "active")
      : false;

  async function refresh(): Promise<void> {
    summaryEl.textContent = "Cargando...";
    calendarWrap.hidden = true;
    noScheduleWrap.hidden = true;

    let classes: GymClassRow[];
    try {
      if (isOwner) {
        const [classRows, trainerRows] = await Promise.all([listGymClasses(gymId), listGymTrainers(gymId, { statusFilter: "all" })]);
        classes = classRows;
        trainers = trainerRows;
      } else {
        classes = await listGymClasses(gymId);
      }
    } catch {
      summaryEl.textContent = "No se pudieron cargar las clases. Probá de nuevo.";
      return;
    }

    if (classes.length === 0) {
      summaryEl.textContent = isOwner ? "Todavía no armaste ninguna clase." : "Este gimnasio todavía no cargó clases.";
      return;
    }

    const withSchedule = classes.filter((c) => c.sessions.length > 0);
    const withoutSchedule = isOwner ? classes.filter((c) => c.sessions.length === 0) : [];

    if (withSchedule.length > 0) {
      summaryEl.textContent = "";
      calendarWrap.hidden = false;
      const blocks = buildCalendarBlocks(withSchedule);
      gridEl.innerHTML = calendarGridHtml(blocks);
      gridEl.querySelectorAll<HTMLButtonElement>(".class-calendar-block").forEach((btn) => {
        btn.addEventListener(
          "click",
          () => {
            const c = classes.find((x) => x.id === btn.dataset.id);
            if (c) openClassDetail(c);
          },
          { signal: ctx.signal }
        );
      });
    } else {
      summaryEl.textContent = isOwner ? "" : "Todavía no se cargaron horarios para estas clases.";
    }

    if (isOwner && withoutSchedule.length > 0) {
      noScheduleWrap.hidden = false;
      noScheduleList.innerHTML = withoutSchedule.map(noScheduleCardMarkup).join("");
      noScheduleList.querySelectorAll<HTMLButtonElement>(".manageClassBtn").forEach((btn) => {
        btn.addEventListener(
          "click",
          () => {
            const c = withoutSchedule.find((x) => x.id === btn.dataset.id);
            if (c) openClassDetail(c);
          },
          { signal: ctx.signal }
        );
      });
    } else {
      // Sin esto, la ultima clase sin horario que se borra/edita-con-horario deja su tarjeta
      // vieja huerfana en el DOM (oculta por noScheduleWrap.hidden, pero sigue ahi).
      noScheduleList.innerHTML = "";
    }
  }

  function openClassDetail(c: GymClassRow): void {
    openClassDetailModal(
      c,
      { myId: authUserId, isActiveSocio, isOwner },
      () => void refresh(),
      isOwner
        ? {
            onEdit: (row) => openClassManageForm({ gymId, trainers, ctx, existing: row, onSaved: () => void refresh() }),
            onDelete: (row) => confirmDeleteGymClass(row.id, row.name, () => void refresh()),
          }
        : undefined
    );
  }

  newClassBtn?.addEventListener(
    "click",
    () => openClassManageForm({ gymId, trainers, ctx, onSaved: () => void refresh() }),
    { signal: ctx.signal }
  );

  void refresh();
}

export const clasesView: ViewModule = {
  async mount(container, params, ctx, authUserId) {
    const uParam = params.get("u");
    if (!uParam) {
      const myId = authUserId ?? (await requireAuth().catch(() => null));
      if (!myId) return; // requireAuth ya redirigio a login.html
      // Sin ?u=, esta vista es "mi gestion de clases" -- solo tiene sentido para una cuenta
      // gimnasio. Sin este chequeo cualquier entrenador/usuario logueado quedaba tratado como
      // dueño de un gimnasio inexistente (el suyo propio, que no es tal).
      const me = await getProfileBasicById(myId).catch(() => null);
      if (me?.user_type !== "gimnasio") {
        container.innerHTML = `<section class="features"><div class="container"><p class="exc-pick-empty">Esta página es solo para cuentas de gimnasio.</p></div></section>`;
        return;
      }
      return mountClasesView(container, myId, null, ctx, myId, true);
    }
    const gym = await getProfileBasicByUsername(uParam).catch(() => null);
    if (!gym || !gym.id || gym.user_type !== "gimnasio") {
      container.innerHTML = `<section class="features"><div class="container"><p class="exc-pick-empty">Gimnasio no encontrado.</p></div></section>`;
      return;
    }
    const isOwner = !!authUserId && authUserId === gym.id;
    return mountClasesView(container, gym.id, gym.username ?? uParam, ctx, authUserId, isOwner);
  },
};
