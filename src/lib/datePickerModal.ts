import { todayLocalISO } from "./dias";

// Calendario propio (modal en #loaderBody) para elegir una fecha: grilla de días con
// navegación por mes, y al tocar el título se pasa a elegir mes y después año. Reemplaza
// al <input type="date"> nativo (UX inconsistente entre navegadores/SO). Ver nutricion.ts.

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WD_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export interface DatePickerOptions {
  /** Fecha seleccionada actual, "YYYY-MM-DD". */
  value: string;
  /** Fecha máxima seleccionable, "YYYY-MM-DD" (opcional). */
  max?: string;
  /** Fecha mínima seleccionable, "YYYY-MM-DD" (opcional). */
  min?: string;
  onPick: (iso: string) => void;
}

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function yearBlockStart(year: number): number {
  return year - (((year % 12) + 12) % 12);
}

export function openDatePickerModal(opts: DatePickerOptions): void {
  const hostEl = document.getElementById("loaderBody");
  if (!hostEl) return;
  const host: HTMLElement = hostEl;

  const today = todayLocalISO();
  const max = opts.max ?? null;
  const min = opts.min ?? null;
  const selected = opts.value;

  const [sy, sm] = selected.split("-").map(Number);
  let viewYear = sy || Number(today.slice(0, 4));
  let viewMonth = (sm || 1) - 1; // 0-11
  let mode: "days" | "months" | "years" = "days";
  let yearPageStart = yearBlockStart(viewYear);

  const maxYear = max ? Number(max.slice(0, 4)) : null;
  const minYear = min ? Number(min.slice(0, 4)) : null;
  const outOfRange = (d: string) => (max != null && d > max) || (min != null && d < min);

  function close(): void {
    host.innerHTML = "";
  }
  function pick(d: string): void {
    close();
    opts.onPick(d);
  }

  function daysGrid(): string {
    const first = new Date(viewYear, viewMonth, 1);
    const offset = (first.getDay() + 6) % 7; // lunes primero
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: string[] = [];
    for (let i = 0; i < offset; i++) cells.push(`<span class="dp-cell dp-empty"></span>`);
    for (let d = 1; d <= daysInMonth; d++) {
      const dIso = isoOf(viewYear, viewMonth, d);
      const cls = ["dp-cell", "dp-day"];
      if (dIso === selected) cls.push("dp-selected");
      if (dIso === today) cls.push("dp-today");
      cells.push(
        `<button type="button" class="${cls.join(" ")}" data-iso="${dIso}"${outOfRange(dIso) ? " disabled" : ""}>${d}</button>`
      );
    }
    return `
      <div class="dp-weekdays">${WD_ES.map((w) => `<span>${w}</span>`).join("")}</div>
      <div class="dp-days">${cells.join("")}</div>`;
  }

  function monthsGrid(): string {
    return `<div class="dp-grid3">${MONTHS_ES.map((mn, i) => {
      const lastDay = new Date(viewYear, i + 1, 0).getDate();
      const dis = (max != null && isoOf(viewYear, i, 1) > max) || (min != null && isoOf(viewYear, i, lastDay) < min);
      const cls = ["dp-cell", "dp-month"];
      if (i === viewMonth) cls.push("dp-selected");
      return `<button type="button" class="${cls.join(" ")}" data-month="${i}"${dis ? " disabled" : ""}>${mn.slice(0, 3)}</button>`;
    }).join("")}</div>`;
  }

  function yearsGrid(): string {
    const out: string[] = [];
    for (let i = 0; i < 12; i++) {
      const y = yearPageStart + i;
      const dis = (maxYear != null && y > maxYear) || (minYear != null && y < minYear);
      const cls = ["dp-cell", "dp-year"];
      if (y === viewYear) cls.push("dp-selected");
      out.push(`<button type="button" class="${cls.join(" ")}" data-year="${y}"${dis ? " disabled" : ""}>${y}</button>`);
    }
    return `<div class="dp-grid3">${out.join("")}</div>`;
  }

  function headerLabel(): string {
    if (mode === "days") return `${MONTHS_ES[viewMonth]} ${viewYear}`;
    if (mode === "months") return `${viewYear}`;
    return `${yearPageStart} – ${yearPageStart + 11}`;
  }

  function canPrev(): boolean {
    if (min == null) return true;
    if (mode === "days") {
      const py = viewMonth === 0 ? viewYear - 1 : viewYear;
      const pm = viewMonth === 0 ? 11 : viewMonth - 1;
      return isoOf(py, pm, new Date(py, pm + 1, 0).getDate()) >= min;
    }
    if (mode === "months") return viewYear - 1 >= (minYear as number);
    return yearPageStart - 1 >= (minYear as number);
  }
  function canNext(): boolean {
    if (max == null) return true;
    if (mode === "days") {
      const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
      const nm = viewMonth === 11 ? 0 : viewMonth + 1;
      return isoOf(ny, nm, 1) <= max;
    }
    if (mode === "months") return viewYear + 1 <= (maxYear as number);
    return yearPageStart + 12 <= (maxYear as number);
  }

  function step(dir: number): void {
    if (mode === "days") {
      viewMonth += dir;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear--;
      } else if (viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
    } else if (mode === "months") {
      viewYear += dir;
    } else {
      yearPageStart += dir * 12;
    }
    paint();
  }

  // Shell fijo: el overlay + la tarjeta se montan una sola vez, así navegar meses/años
  // no re-dispara la animación de entrada del overlay ni parpadea el fondo.
  host.innerHTML = `
    <div class="success-check-container" id="dpOverlay">
      <div class="modal-card dp-card">
        <div class="dp-header">
          <button type="button" class="dp-nav" id="dpPrev" aria-label="Anterior">‹</button>
          <button type="button" class="dp-title" id="dpTitle"></button>
          <button type="button" class="dp-nav" id="dpNext" aria-label="Siguiente">›</button>
        </div>
        <div class="dp-body" id="dpBody"></div>
        <div class="modal-actions dp-actions">
          <button type="button" class="btn btn-outline btn-sm" id="dpToday" style="display:none">Hoy</button>
          <button type="button" class="btn btn-outline btn-sm" id="dpCancel">Cancelar</button>
        </div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(id: string) => host.querySelector(id) as T | null;
  const bodyEl = $<HTMLElement>("#dpBody")!;
  const titleEl = $<HTMLButtonElement>("#dpTitle")!;
  const prevEl = $<HTMLButtonElement>("#dpPrev")!;
  const nextEl = $<HTMLButtonElement>("#dpNext")!;
  const todayEl = $<HTMLButtonElement>("#dpToday")!;

  $<HTMLButtonElement>("#dpCancel")?.addEventListener("click", close);
  todayEl.addEventListener("click", () => pick(today));
  titleEl.addEventListener("click", () => {
    mode = mode === "days" ? "months" : mode === "months" ? "years" : "days";
    if (mode === "years") yearPageStart = yearBlockStart(viewYear);
    paint();
  });
  prevEl.addEventListener("click", () => step(-1));
  nextEl.addEventListener("click", () => step(1));
  $<HTMLElement>("#dpOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) close();
  });

  function paint(): void {
    titleEl.textContent = headerLabel();
    prevEl.disabled = !canPrev();
    nextEl.disabled = !canNext();
    // .btn tiene display propio, así que [hidden] no alcanza -- se togglea el style.
    todayEl.style.display = mode === "days" && !outOfRange(today) ? "" : "none";
    bodyEl.innerHTML = mode === "days" ? daysGrid() : mode === "months" ? monthsGrid() : yearsGrid();

    bodyEl.querySelectorAll<HTMLButtonElement>("[data-iso]").forEach((b) =>
      b.addEventListener("click", () => pick(b.dataset.iso as string))
    );
    bodyEl.querySelectorAll<HTMLButtonElement>("[data-month]").forEach((b) =>
      b.addEventListener("click", () => {
        viewMonth = Number(b.dataset.month);
        mode = "days";
        paint();
      })
    );
    bodyEl.querySelectorAll<HTMLButtonElement>("[data-year]").forEach((b) =>
      b.addEventListener("click", () => {
        viewYear = Number(b.dataset.year);
        mode = "months";
        paint();
      })
    );
  }

  paint();
}
