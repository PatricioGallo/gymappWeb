import { escapeHtml } from "./dom";
import { formatFechaCorta } from "./dias";
import { loadChart } from "./chartLoader";
import { settleReveal } from "./nav";
import { openMediaLightbox } from "./mediaLightbox";
import type { Chart as ChartInstance } from "chart.js";
import {
  listBodyMeasurements,
  getAlturaCm,
  getGenero,
  getEdad,
  getMeasurementPhotoUrls,
  listStudentProgressPhotos,
  computeMeasurementStats,
  MEASUREMENT_FIELDS,
  type BodyMeasurementEntry,
  type MeasurementFieldDef,
  type MeasurementStats,
  type BodyWeightUnit,
} from "../services/bodyMeasurements.service";

const UNIT_LABELS_BW: Record<BodyWeightUnit, string> = { kg: "Kg", lb: "Lb" };

// ---------------------------------------------------------------------------
// Panel SOLO LECTURA de las medidas corporales de un alumno, para la pestaña "Medidas" de
// progress.ts (entrenador viendo a un alumno vía ?uid=). El alumno controla la visibilidad
// desde Configuración (body_measurement_prefs.shareWithTrainer / .sharePhotoWithTrainer); la
// barrera real es RLS (trainer_can_see_measurements / _photos). Acá solo se decide qué mostrar.
//
// Es una versión reducida de medidas.ts: selector de métrica + tarjetas de stats + gráfico +
// historial + galería de fotos. Sin las tablas de clasificación (IMC/% graso) ni edición.
// Helpers de formato duplicados a propósito (son privados de medidas.ts) -- convención del repo.
// ---------------------------------------------------------------------------

export interface StudentMeasurementsPanelOptions {
  studentId: string;
  /** body_measurement_prefs.shareWithTrainer del alumno: muestra números (stats + gráfico + historial). */
  showNumbers: boolean;
  /** body_measurement_prefs.sharePhotoWithTrainer del alumno: muestra la galería de fotos de progreso. */
  showPhotos: boolean;
}

interface PanelCtx {
  addCleanup: (fn: () => void) => void;
  signal: AbortSignal;
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}
function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${fmt(n)}`;
}
function unitSuffix(unit: string): string {
  return unit ? ` ${unit}` : "";
}
function unitLabelOf(field: MeasurementFieldDef, entryUnidad: BodyWeightUnit): string {
  return field.key === "peso" ? UNIT_LABELS_BW[entryUnidad] : field.unit;
}
function fieldValueLabel(entry: BodyMeasurementEntry, field: MeasurementFieldDef): string | null {
  const value = entry[field.key];
  if (value == null) return null;
  return `${field.label}: ${fmt(value)}${unitSuffix(unitLabelOf(field, entry.unidad))}`;
}
function entryMeasurementSummary(entry: BodyMeasurementEntry): string {
  return MEASUREMENT_FIELDS.map((f) => fieldValueLabel(entry, f))
    .filter((s): s is string => s !== null)
    .join(" · ");
}

function statsMarkup(field: MeasurementFieldDef, unit: string, s: MeasurementStats): string {
  const u = unitSuffix(unit);
  return `
    <div class="card-grid">
      <div class="stat-card reveal"><div class="label">${escapeHtml(field.label)} actual</div><div class="value">${fmt(s.current.value)}${u}<small>${escapeHtml(formatFechaCorta(s.current.fecha))}</small></div></div>
      <div class="stat-card reveal"><div class="label">Diferencia</div><div class="value">${s.count >= 2 ? `${signed(s.netChange)}${u}<small>desde el primer registro (${escapeHtml(formatFechaCorta(s.first.fecha))})</small>` : `—<small>Necesita al menos 2 registros</small>`}</div></div>
      <div class="stat-card reveal"><div class="label">Máximo</div><div class="value">${fmt(s.max.value)}${u}<small>${escapeHtml(formatFechaCorta(s.max.fecha))}</small></div></div>
      <div class="stat-card reveal"><div class="label">Mínimo</div><div class="value">${fmt(s.min.value)}${u}<small>${escapeHtml(formatFechaCorta(s.min.fecha))}</small></div></div>
      <div class="stat-card reveal"><div class="label">Registros</div><div class="value">${s.count}<small>Lo que bajó como mucho: ${s.maxDrop > 0 ? `-${fmt(s.maxDrop)}${u}` : "—"}</small></div></div>
      <div class="stat-card reveal"><div class="label">Lo que subió como mucho</div><div class="value">${s.maxGain > 0 ? `+${fmt(s.maxGain)}${u}` : "—"}<small>La mayor subida entre un valle y un pico posterior</small></div></div>
    </div>
  `;
}

function historyMarkup(entries: BodyMeasurementEntry[]): string {
  const rows = [...entries]
    .reverse()
    .slice(0, 30)
    .map((e) => {
      const summary = entryMeasurementSummary(e);
      return `
      <div class="bw-row">
        <div class="bw-row-main">
          <div class="bw-row-date">${escapeHtml(formatFechaCorta(e.fecha))}</div>
          ${summary ? `<div class="bw-row-summary">${escapeHtml(summary)}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");
  return `
    <div class="chart-card reveal">
      <h3>Historial</h3>
      <p class="chart-sub">Últimos ${Math.min(entries.length, 30)} registros, del más nuevo al más viejo.</p>
      <div class="bw-list">${rows}</div>
    </div>
  `;
}

function emptyMarkup(text: string): string {
  return `
    <div class="empty-state in-view">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
      <h3>Sin datos para mostrar</h3>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

/** Item de la galería de fotos -- desacoplado de BodyMeasurementEntry: cuando el alumno comparte
 * las fotos pero no los números, las filas de body_measurements no se pueden leer (RLS) y las
 * fotos vienen por la RPC get_student_progress_photos. `summary` solo se llena si además se
 * comparten los números (si no, mostrar las medidas en el pie de la foto las filtraría igual). */
interface PhotoItem {
  fecha: string;
  url: string;
  summary: string | null;
}

export async function renderStudentMeasurementsPanel(host: HTMLElement, opts: StudentMeasurementsPanelOptions, ctx: PanelCtx): Promise<void> {
  host.innerHTML = `<p class="chart-sub">Cargando medidas del alumno...</p>`;

  const { studentId, showNumbers, showPhotos } = opts;

  let entries: BodyMeasurementEntry[] = [];
  let photos: PhotoItem[] = [];
  try {
    if (showNumbers) {
      const [alturaCm, genero, edad] = await Promise.all([
        getAlturaCm(studentId).catch(() => null),
        getGenero(studentId).catch(() => null),
        getEdad(studentId).catch(() => null),
      ]);
      entries = await listBodyMeasurements(studentId, alturaCm, genero, edad);
    }
    if (showPhotos) {
      const refs = await listStudentProgressPhotos(studentId).catch(() => []);
      if (refs.length > 0) {
        const urls = await getMeasurementPhotoUrls(refs.map((r) => r.fotoPath)).catch(() => new Map<string, string>());
        const summaryByFecha = new Map(entries.map((e) => [e.fecha, entryMeasurementSummary(e)]));
        photos = refs
          .filter((r) => urls.has(r.fotoPath))
          .map((r) => ({ fecha: r.fecha, url: urls.get(r.fotoPath)!, summary: showNumbers ? (summaryByFecha.get(r.fecha) ?? null) : null }));
      }
    }
  } catch {
    host.innerHTML = emptyMarkup("No se pudieron cargar las medidas. Probá de nuevo.");
    return;
  }

  if (ctx.signal.aborted) return;

  const noNumbers = !showNumbers || entries.length === 0;
  const noPhotos = !showPhotos || photos.length === 0;
  if (noNumbers && noPhotos) {
    host.innerHTML = emptyMarkup(
      showNumbers && !showPhotos
        ? "El alumno todavía no cargó ninguna medida."
        : !showNumbers && showPhotos
          ? "El alumno todavía no subió fotos de progreso."
          : "El alumno todavía no cargó medidas ni subió fotos de progreso."
    );
    return;
  }

  // Métricas con al menos un registro (incluye las calculadas -- attachDerivedFields ya las llenó).
  const metricFields = showNumbers ? MEASUREMENT_FIELDS.filter((f) => entries.some((e) => e[f.key] != null)) : [];

  let chart: ChartInstance | null = null;
  ctx.addCleanup(() => chart?.destroy());

  host.innerHTML = `
    ${
      metricFields.length > 0
        ? `<div class="field field-narrow">
             <label for="stMeasureSelect">Medida</label>
             <select id="stMeasureSelect">${metricFields.map((f) => `<option value="${f.key}">${escapeHtml(f.label)}</option>`).join("")}</select>
           </div>
           <div id="stMeasureArea"></div>`
        : showNumbers
          ? `<p class="chart-sub">El alumno tiene la feature activada pero todavía no cargó ninguna medida.</p>`
          : ""
    }
    ${showNumbers && entries.length > 0 ? historyMarkup(entries) : ""}
    ${
      photos.length > 0
        ? `<div class="chart-card reveal">
             <h3>Fotos de progreso</h3>
             <p class="chart-sub">${photos.length} foto${photos.length === 1 ? "" : "s"}, de la más nueva a la más vieja. Tocá cualquiera para verla más grande.</p>
             <div class="bw-gallery-grid">${photos
               .map((p, i) => `<button type="button" class="bw-gallery-item" data-photo-idx="${i}"><img src="${escapeHtml(p.url)}" alt="" loading="lazy"></button>`)
               .join("")}</div>
           </div>`
        : ""
    }
  `;

  settleReveal(host);

  const select = host.querySelector<HTMLSelectElement>("#stMeasureSelect");
  const area = host.querySelector<HTMLElement>("#stMeasureArea");

  async function renderMetric(key: string): Promise<void> {
    if (!area) return;
    const field = metricFields.find((f) => f.key === key);
    if (!field) return;
    const computed = computeMeasurementStats(entries, field.key);
    chart?.destroy();
    chart = null;
    if (!computed) {
      area.innerHTML = `<p class="chart-sub">Sin registros de "${escapeHtml(field.label)}".</p>`;
      return;
    }
    const unit = field.key === "peso" ? UNIT_LABELS_BW[computed.unidad!] : field.unit;
    const series = entries.filter((e) => e[field.key] != null && (field.key !== "peso" || e.unidad === computed.unidad));
    area.innerHTML = `
      ${statsMarkup(field, unit, computed.stats)}
      ${
        series.length >= 2
          ? `<div class="chart-card reveal">
               <h3>Evolución</h3>
               <p class="chart-sub">${escapeHtml(field.label)}${unit ? ` en ${unit}` : ""} a lo largo del tiempo.</p>
               <div class="chart-wrap"><canvas id="stMeasureChart"></canvas></div>
             </div>`
          : ""
      }
    `;
    settleReveal(area);
    if (series.length < 2) return;
    const canvas = area.querySelector<HTMLCanvasElement>("#stMeasureChart");
    if (!canvas) return;
    const Chart = await loadChart();
    if (ctx.signal.aborted) return;
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: series.map((e) => formatFechaCorta(e.fecha)),
        datasets: [
          {
            label: unit ? `${field.label} (${unit})` : field.label,
            data: series.map((e) => e[field.key] as number),
            borderColor: "#ff8a3d",
            backgroundColor: "rgba(255, 138, 61, 0.18)",
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: "#ff8a3d",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: "#9aa1ac" }, grid: { color: "#262b33" } },
          x: { ticks: { color: "#9aa1ac" }, grid: { display: false } },
        },
      },
    });
  }

  if (select && metricFields.length > 0) {
    select.addEventListener("change", () => void renderMetric(select.value), { signal: ctx.signal });
    await renderMetric(metricFields[0].key);
  }

  if (photos.length > 0) {
    host.querySelectorAll<HTMLButtonElement>(".bw-gallery-item").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          const startIndex = Number(btn.dataset.photoIdx);
          if (!Number.isInteger(startIndex) || startIndex < 0) return;
          openMediaLightbox<PhotoItem>({
            queue: photos,
            startIndex,
            horizontalNav: true,
            getMedia: (p) => ({ url: p.url, kind: "image" }),
            renderFooter: (p, footerEl) => {
              footerEl.innerHTML = `
                <p class="bw-photo-lightbox-caption">${escapeHtml(formatFechaCorta(p.fecha))}</p>
                ${p.summary ? `<p class="bw-photo-lightbox-summary">${escapeHtml(p.summary)}</p>` : ""}
              `;
            },
          });
        },
        { signal: ctx.signal }
      );
    });
  }
}
