import type { ViewModule } from "../shell/router";
import { navigate } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta, todayLocalISO } from "../lib/dias";
import { isCurrentUserAdmin } from "../services/admin.service";
import {
  listBodyWeights,
  upsertBodyWeight,
  deleteBodyWeight,
  computeBodyWeightStats,
  type BodyWeightEntry,
  type BodyWeightUnit,
} from "../services/bodyWeight.service";
import type { Chart as ChartInstance } from "chart.js";
import { loadChart } from "../lib/chartLoader";

const UNIT_LABELS: Record<BodyWeightUnit, string> = { kg: "Kg", lb: "Lb" };

const KEBAB_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
const EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <a href="profile.html" class="back-link" id="backToProfile"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Volver al perfil</a>
      <span class="eyebrow">Peso corporal</span>
      <h1>Tu peso corporal</h1>
      <p>Registrá tu peso cada tanto y mirá cómo evoluciona con el tiempo.</p>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="bw-actions">
        <button class="btn btn-primary" id="addWeightBtn" type="button">+ Agregar peso</button>
      </div>
      <div id="bwContent"></div>
    </div>
  </section>
`;

function fmt(n: number): string {
  // 78.5 en vez de 78.50, pero 78 queda 78 (sin decimales de relleno).
  return String(Math.round(n * 100) / 100);
}

function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${fmt(n)}`;
}

function emptyMarkup(): string {
  return `
    <div class="empty-state reveal">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
      <h3>Todavía no cargaste ningún peso</h3>
      <p>Tocá "Agregar peso" para registrar tu peso corporal de hoy. Cuando tengas varios registros vas a ver acá tus estadísticas y la evolución.</p>
    </div>
  `;
}

function statsMarkup(unidad: BodyWeightUnit, s: NonNullable<ReturnType<typeof computeBodyWeightStats>>["stats"]): string {
  const u = UNIT_LABELS[unidad];
  return `
    <div class="card-grid">
      <div class="stat-card reveal"><div class="label">Peso actual</div><div class="value">${fmt(s.current.peso)} ${u}<small>${escapeHtml(formatFechaCorta(s.current.fecha))}</small></div></div>
      <div class="stat-card reveal"><div class="label">Diferencia hasta hoy</div><div class="value">${s.count >= 2 ? `${signed(s.netChange)} ${u}<small>desde tu primer registro (${escapeHtml(formatFechaCorta(s.first.fecha))})</small>` : `—<small>Necesitás al menos 2 registros</small>`}</div></div>
      <div class="stat-card reveal"><div class="label">Peso máximo</div><div class="value">${fmt(s.max.peso)} ${u}<small>${escapeHtml(formatFechaCorta(s.max.fecha))}</small></div></div>
      <div class="stat-card reveal"><div class="label">Peso mínimo</div><div class="value">${fmt(s.min.peso)} ${u}<small>${escapeHtml(formatFechaCorta(s.min.fecha))}</small></div></div>
      <div class="stat-card reveal"><div class="label">Lo máximo que bajaste</div><div class="value">${s.maxDrop > 0 ? `-${fmt(s.maxDrop)} ${u}` : "—"}<small>La mayor caída entre un pico y un valle posterior</small></div></div>
      <div class="stat-card reveal"><div class="label">Lo máximo que subiste</div><div class="value">${s.maxGain > 0 ? `+${fmt(s.maxGain)} ${u}` : "—"}<small>La mayor subida entre un valle y un pico posterior</small></div></div>
    </div>
  `;
}

function historyMarkup(entries: BodyWeightEntry[]): string {
  // Más reciente primero en la lista (entries viene ascendente para los cálculos).
  const rows = [...entries]
    .reverse()
    .map(
      (e) => `
    <div class="bw-row" data-id="${e.id}">
      <div class="bw-row-main">
        <div class="bw-row-date">${escapeHtml(formatFechaCorta(e.fecha))}</div>
        <div class="bw-row-sub">Cargado el ${escapeHtml(formatFechaCorta(e.createdAt))}</div>
      </div>
      <div class="bw-row-peso">${fmt(e.peso)} ${UNIT_LABELS[e.unidad]}</div>
      <div class="weight-menu-wrap">
        <button type="button" class="profile-menu-btn weight-menu-btn" aria-label="Más opciones" aria-expanded="false">${KEBAB_ICON}</button>
        <div class="profile-menu-panel weight-menu-panel" hidden>
          <button type="button" class="profile-menu-item bw-edit" data-id="${e.id}">${EDIT_ICON}Editar</button>
          <button type="button" class="profile-menu-item profile-menu-item-danger bw-delete" data-id="${e.id}">${TRASH_ICON}Borrar</button>
        </div>
      </div>
    </div>`
    )
    .join("");

  return `
    <div class="chart-card reveal">
      <h3>Historial</h3>
      <p class="chart-sub">Todos tus registros, del más nuevo al más viejo.</p>
      <div class="bw-list">${rows}</div>
    </div>
  `;
}

let updateHandler: (() => void) | null = null;

export const pesoCorporalView: ViewModule = {
  async mount(container, _params, ctx, authUserId) {
    const myId = authUserId!; // la ruta se registra con auth "required"

    // Feature acotada a administradores -- mismo gate que admin.ts. La RLS de
    // body_weight_logs tambien lo exige server-side, esto solo evita mostrar una
    // pantalla vacia/rota a quien no corresponde.
    if (!(await isCurrentUserAdmin())) {
      navigate("profile.html");
      return;
    }

    // Cierra cualquier menú de tres puntos abierto al tocar afuera (mismo patrón que pesos.ts).
    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".weight-menu-wrap")) return;
        container.querySelectorAll<HTMLElement>(".weight-menu-panel").forEach((p) => (p.hidden = true));
        container.querySelectorAll<HTMLButtonElement>(".weight-menu-btn").forEach((b) => {
          b.classList.remove("open");
          b.setAttribute("aria-expanded", "false");
        });
      },
      { signal: ctx.signal }
    );

    let chartInstance: ChartInstance | null = null;
    ctx.addCleanup(() => chartInstance?.destroy());

    function openWeightModal(existing: BodyWeightEntry | null): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      const fecha = existing?.fecha ?? todayLocalISO();
      const unidad: BodyWeightUnit = existing?.unidad ?? "kg";

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>${existing ? "Editar peso corporal" : "Agregar peso corporal"}</h2>
            <p class="subtitle">Registrá tu peso corporal para una fecha.</p>
            <div class="field">
              <label for="bwFecha">Fecha</label>
              <input type="date" id="bwFecha" max="${todayLocalISO()}" value="${escapeHtml(fecha)}">
            </div>
            <div class="field">
              <label for="bwPeso">Peso</label>
              <input type="number" id="bwPeso" step="0.1" min="1" inputmode="decimal" placeholder="Ej: 78.5" value="${existing ? fmt(existing.peso) : ""}">
            </div>
            <div class="field">
              <label for="bwUnidad">Unidad</label>
              <select id="bwUnidad">
                ${(Object.keys(UNIT_LABELS) as BodyWeightUnit[]).map((x) => `<option value="${x}" ${x === unidad ? "selected" : ""}>${UNIT_LABELS[x]}</option>`).join("")}
              </select>
            </div>
            <div class="alert_message" id="bwAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-primary" id="bwSave" type="button">Guardar</button>
              <button class="btn btn-outline" id="bwCancel" type="button">Cancelar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("bwCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      document.getElementById("bwSave")?.addEventListener("click", async () => {
        const alertEl = document.getElementById("bwAlert")!;
        const fechaVal = (document.getElementById("bwFecha") as HTMLInputElement).value;
        const pesoVal = (document.getElementById("bwPeso") as HTMLInputElement).value.trim();
        const unidadVal = (document.getElementById("bwUnidad") as HTMLSelectElement).value as BodyWeightUnit;
        const peso = Number(pesoVal);

        if (!fechaVal) {
          alertEl.innerHTML = "<p>Elegí una fecha.</p>";
          return;
        }
        if (fechaVal > todayLocalISO()) {
          alertEl.innerHTML = "<p>La fecha no puede ser futura.</p>";
          return;
        }
        if (pesoVal === "" || Number.isNaN(peso) || peso <= 0 || peso >= 1000) {
          alertEl.innerHTML = "<p>Ingresá un peso válido (entre 1 y 999).</p>";
          return;
        }

        alertEl.innerHTML = "";
        const saveBtn = document.getElementById("bwSave") as HTMLButtonElement;
        saveBtn.disabled = true;
        const { error } = await upsertBodyWeight(myId, fechaVal, peso, unidadVal);
        if (error) {
          saveBtn.disabled = false;
          alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }

        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
            <p>¡Peso guardado con éxito!</p>
          </div>
        `;
        await render();
        const t = setTimeout(() => {
          loaderBody.innerHTML = "";
        }, 1400);
        ctx.addCleanup(() => clearTimeout(t));
      });
    }

    function confirmDeleteModal(entry: BodyWeightEntry): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Borrar registro</h2>
            <p class="subtitle">Se va a borrar el peso de ${escapeHtml(formatFechaCorta(entry.fecha))} (${fmt(entry.peso)} ${UNIT_LABELS[entry.unidad]}).</p>
            <div class="modal-actions">
              <button class="btn btn-danger" id="bwConfirmDelete" type="button">Borrar</button>
              <button class="btn btn-outline" id="bwCancelDelete" type="button">Cancelar</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("bwCancelDelete")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });
      document.getElementById("bwConfirmDelete")?.addEventListener("click", async () => {
        const btn = document.getElementById("bwConfirmDelete") as HTMLButtonElement;
        btn.disabled = true;
        const { error } = await deleteBodyWeight(entry.id);
        if (error) {
          loaderBody.innerHTML = "";
          alert(error);
          return;
        }
        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
            <p>Registro borrado.</p>
          </div>
        `;
        await render();
        const t = setTimeout(() => {
          loaderBody.innerHTML = "";
        }, 1200);
        ctx.addCleanup(() => clearTimeout(t));
      });
    }

    function wireHistoryMenus(entries: BodyWeightEntry[]): void {
      const content = container.querySelector("#bwContent")!;
      content.querySelectorAll<HTMLButtonElement>(".weight-menu-btn").forEach((btn) => {
        const panel = btn.nextElementSibling as HTMLElement | null;
        if (!panel) return;
        btn.addEventListener("click", () => {
          const willOpen = panel.hidden;
          content.querySelectorAll<HTMLElement>(".weight-menu-panel").forEach((p) => (p.hidden = true));
          content.querySelectorAll<HTMLButtonElement>(".weight-menu-btn").forEach((b) => {
            b.classList.remove("open");
            b.setAttribute("aria-expanded", "false");
          });
          panel.hidden = !willOpen;
          btn.classList.toggle("open", willOpen);
          btn.setAttribute("aria-expanded", String(willOpen));
        });
      });
      content.querySelectorAll<HTMLButtonElement>(".bw-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
          btn.closest<HTMLElement>(".weight-menu-panel")!.hidden = true;
          const entry = entries.find((e) => e.id === btn.dataset.id);
          if (entry) openWeightModal(entry);
        });
      });
      content.querySelectorAll<HTMLButtonElement>(".bw-delete").forEach((btn) => {
        btn.addEventListener("click", () => {
          btn.closest<HTMLElement>(".weight-menu-panel")!.hidden = true;
          const entry = entries.find((e) => e.id === btn.dataset.id);
          if (entry) confirmDeleteModal(entry);
        });
      });
    }

    async function render(): Promise<void> {
      const content = container.querySelector("#bwContent");
      if (!content) return;

      let entries: BodyWeightEntry[];
      try {
        entries = await listBodyWeights(myId);
      } catch {
        content.innerHTML = `<p class="chart-sub">No se pudo cargar tu historial de peso. Probá recargar la página.</p>`;
        return;
      }

      chartInstance?.destroy();
      chartInstance = null;

      if (entries.length === 0) {
        content.innerHTML = emptyMarkup();
        return;
      }

      const computed = computeBodyWeightStats(entries);
      const u = computed?.unidad ?? "kg";
      const series = entries.filter((e) => e.unidad === u);

      content.innerHTML = `
        ${computed ? statsMarkup(computed.unidad, computed.stats) : ""}
        ${
          series.length >= 2
            ? `<div class="chart-card reveal">
                 <h3>Evolución del peso</h3>
                 <p class="chart-sub">Tu peso corporal en ${UNIT_LABELS[u]} a lo largo del tiempo.</p>
                 <div class="chart-wrap"><canvas id="bwChart"></canvas></div>
               </div>`
            : ""
        }
        ${historyMarkup(entries)}
      `;

      wireHistoryMenus(entries);

      if (series.length >= 2) {
        const canvas = container.querySelector("#bwChart") as HTMLCanvasElement | null;
        if (canvas) {
          const Chart = await loadChart();
          chartInstance = new Chart(canvas, {
            type: "line",
            data: {
              labels: series.map((e) => formatFechaCorta(e.fecha)),
              datasets: [
                {
                  label: `Peso (${UNIT_LABELS[u]})`,
                  data: series.map((e) => e.peso),
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
      }
    }

    container.innerHTML = VIEW_MARKUP;
    container.querySelector("#addWeightBtn")?.addEventListener("click", () => openWeightModal(null), { signal: ctx.signal });

    await render();

    updateHandler = () => void render();
    ctx.addCleanup(() => {
      updateHandler = null;
    });
  },
  update() {
    updateHandler?.();
  },
};
