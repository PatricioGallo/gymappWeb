import { escapeHtml } from "../lib/dom";
import { loadChart } from "../lib/chartLoader";
import { getAdReport, type AdReport, type AdReportCampaign } from "../services/ads.service";

const root = document.getElementById("adReport")!;
const DEFAULT_LOGO = "/images/logo.png";

const STATUS_LABEL: Record<string, string> = {
  draft: "En preparación",
  active: "Activa",
  paused: "Pausada",
  ended: "Finalizada",
};

const nf = new Intl.NumberFormat("es-AR");
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });

function errorScreen(msg: string): void {
  root.innerHTML = `
    <div class="ad-report-empty">
      <img src="/images/logo.png" alt="Gym Social" style="height:34px;opacity:.8">
      <h1>Reporte no disponible</h1>
      <p>${escapeHtml(msg)}</p>
    </div>
  `;
}

function kpi(label: string, value: string, hint = ""): string {
  return `<div class="ad-report-kpi">
    <span class="ad-report-kpi-value">${value}</span>
    <span class="ad-report-kpi-label">${escapeHtml(label)}</span>
    ${hint ? `<span class="ad-report-kpi-hint">${escapeHtml(hint)}</span>` : ""}
  </div>`;
}

function campaignCard(c: AdReportCampaign): string {
  const ctr = c.impressions ? ((c.clicks / c.impressions) * 100).toFixed(1) : "0.0";
  const title = c.creative_kind === "post" ? "Rep promocionado" : c.headline || "Campaña";
  return `
    <article class="ad-report-campaign">
      ${c.media_url ? `<img class="ad-report-campaign-media" src="${escapeHtml(c.media_url)}" alt="">` : ""}
      <div class="ad-report-campaign-body">
        <div class="ad-report-campaign-head">
          <h3>${escapeHtml(title)}</h3>
          <span class="ad-report-badge ad-report-badge-${c.status}">${STATUS_LABEL[c.status] ?? c.status}</span>
        </div>
        <p class="ad-report-campaign-dates">${fmtDate(c.starts_at)} — ${fmtDate(c.ends_at)}</p>
        <div class="ad-report-campaign-stats">
          <div><strong>${nf.format(c.impressions)}</strong><span>vistas</span></div>
          <div><strong>${nf.format(c.reach)}</strong><span>personas</span></div>
          <div><strong>${nf.format(c.clicks)}</strong><span>clics</span></div>
          <div><strong>${ctr}%</strong><span>CTR</span></div>
          ${c.post_engagement ? `<div><strong>${nf.format(c.post_engagement)}</strong><span>interac. en el Rep</span></div>` : ""}
        </div>
      </div>
    </article>
  `;
}

async function renderChart(daily: AdReport["daily"]): Promise<void> {
  const canvas = document.getElementById("adReportChart") as HTMLCanvasElement | null;
  if (!canvas || !daily.length) return;
  const Chart = await loadChart();
  new Chart(canvas, {
    type: "bar",
    data: {
      labels: daily.map((d) => new Date(d.day + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })),
      datasets: [
        { label: "Vistas", data: daily.map((d) => d.impressions), backgroundColor: "#7bd63b", borderRadius: 5, maxBarThickness: 26, order: 2 },
        { label: "Clics", data: daily.map((d) => d.clicks), type: "line", borderColor: "#ff8a3d", backgroundColor: "#ff8a3d", tension: 0.35, pointRadius: 2, order: 1 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#9aa1ac", boxWidth: 12 } } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, color: "#9aa1ac" }, grid: { color: "rgba(255,255,255,.06)" } },
        x: { ticks: { color: "#9aa1ac", maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
      },
    },
  });
}

function render(r: AdReport): void {
  const t = r.totals;
  const ctr = t.impressions ? ((t.clicks / t.impressions) * 100).toFixed(1) : "0.0";
  root.innerHTML = `
    <header class="ad-report-head">
      <img class="ad-report-logo" src="${escapeHtml(r.advertiser.logo_url || DEFAULT_LOGO)}" alt="">
      <div class="ad-report-head-text">
        <h1>${escapeHtml(r.advertiser.name)}</h1>
        <p>Reporte de campañas en Gym Social</p>
      </div>
      <button type="button" class="btn btn-outline btn-sm" id="adReportShare">Compartir</button>
    </header>
    <p class="ad-report-updated">Actualizado el ${fmtDate(r.generated_at)} · ${t.campaigns} campaña${t.campaigns === 1 ? "" : "s"} (${t.active_campaigns} activa${t.active_campaigns === 1 ? "" : "s"})</p>

    <div class="ad-report-kpis">
      ${kpi("Vistas totales", nf.format(t.impressions))}
      ${kpi("Personas alcanzadas", nf.format(t.reach), "usuarios distintos")}
      ${kpi("Clics", nf.format(t.clicks))}
      ${kpi("CTR", ctr + "%", "clics sobre vistas")}
      ${t.engagement > t.clicks ? kpi("Interacciones", nf.format(t.engagement), "clics + me gusta/comentarios en los Reps") : ""}
    </div>

    ${
      r.daily.length
        ? `<section class="ad-report-section">
             <h2>Actividad diaria</h2>
             <div class="ad-report-chart"><canvas id="adReportChart"></canvas></div>
           </section>`
        : ""
    }

    <section class="ad-report-section">
      <h2>Detalle por campaña</h2>
      <div class="ad-report-campaigns">
        ${r.campaigns.map(campaignCard).join("") || `<p class="exc-pick-empty">Todavía no hay campañas.</p>`}
      </div>
    </section>

    <footer class="ad-report-footer">
      <img src="/images/logo.png" alt="Gym Social">
      <span>Reporte generado automáticamente por Gym Social. Los números se actualizan solos.</span>
    </footer>
  `;

  document.getElementById("adReportShare")?.addEventListener("click", async () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `Reporte — ${r.advertiser.name}`, url }).catch(() => {});
    } else {
      try {
        await navigator.clipboard.writeText(url);
        const btn = document.getElementById("adReportShare")!;
        btn.textContent = "¡Link copiado!";
        setTimeout(() => (btn.textContent = "Compartir"), 1800);
      } catch {
        /* nada */
      }
    }
  });

  void renderChart(r.daily);
}

const token = new URLSearchParams(window.location.search).get("t");
if (!token) {
  errorScreen("El link está incompleto. Pedile a Gym Social que te lo reenvíe.");
} else {
  getAdReport(token)
    .then((r) => {
      if (!r) errorScreen("No encontramos este reporte. El link puede haber cambiado.");
      else render(r);
    })
    .catch(() => errorScreen("No se pudo cargar el reporte. Probá de nuevo en un rato."));
}
