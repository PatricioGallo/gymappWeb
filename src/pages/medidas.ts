import type { ViewModule } from "../shell/router";
import { navigate } from "../shell/router";
import { escapeHtml } from "../lib/dom";
import { formatFechaCorta, todayLocalISO } from "../lib/dias";
import {
  listBodyMeasurements,
  upsertBodyMeasurement,
  deleteBodyMeasurement,
  computeMeasurementStats,
  getBodyMeasurementPrefs,
  getAlturaCm,
  loggableFields,
  fieldDef,
  MEASUREMENT_FIELDS,
  imcCategoryFor,
  imcWeightBoundariesKg,
  kgToUnit,
  rcaCategoryFor,
  rcaWaistBoundariesCm,
  rccCategoryFor,
  rccCategoriesFor,
  rccWaistBoundariesCmForHip,
  getGenero,
  uploadMeasurementPhoto,
  deleteMeasurementPhoto,
  downloadMeasurementPhoto,
  getMeasurementPhotoUrl,
  getMeasurementPhotoUrls,
  type BodyMeasurementEntry,
  type BodyWeightUnit,
  type MeasurementKey,
  type MeasurementColumn,
  type MeasurementFieldDef,
  type MeasurementStats,
  type MeasurementValues,
  type LoggableFieldDef,
  type RccSex,
} from "../services/bodyMeasurements.service";
import { createPost, uploadPostMedia, deletePostMedia, validatePostContent } from "../services/post.service";
import { makeMentionEditable } from "../lib/mentionEditor";
import { attachMentionAutocomplete } from "../lib/mentionAutocomplete";
import type { Chart as ChartInstance } from "chart.js";
import { loadChart } from "../lib/chartLoader";
import { openMediaLightbox } from "../lib/mediaLightbox";

// Límite de caracteres de un Rep (coincide con POST_MAX en feed.ts / POST_CONTENT_MAX en
// post.service.ts, que no lo exporta). Usado por el modal "Compartir como Rep".
const POST_MAX = 240;

// Formatos que acepta el adjunto del modal "Compartir como Rep" -- solo imágenes (la foto de
// una medida siempre es una foto; para un video está el composer normal del feed).
const SHARE_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

const UNIT_LABELS: Record<BodyWeightUnit, string> = { kg: "Kg", lb: "Lb" };

// Pestaña extra de galería de fotos (ver renderMetricArea) -- no es una MeasurementKey real,
// solo aparece cuando hay al menos una foto de progreso cargada.
const PROGRESO_TAB_KEY = "progreso" as const;

const KEBAB_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
const EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
const SHARE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>`;

// ---------------------------------------------------------------------------
// Borrador de "+Agregar medidas": si el usuario cierra el modal sin guardar (Cancelar, o
// navegando afuera), la próxima vez que lo abra recupera lo que había empezado a cargar. Solo
// aplica al modal de UNA entrada NUEVA (no al de editar un registro existente, que ya refleja
// datos reales guardados) -- localStorage, por usuario, se borra recién al guardar con éxito.
// No incluye la foto (un File no es serializable) ni el estado de la guía "¿Cómo me mido?".
// ---------------------------------------------------------------------------

interface MeasurementDraft {
  fecha: string;
  unidad: BodyWeightUnit;
  values: Partial<Record<MeasurementColumn, string>>;
}

function draftKey(userId: string): string {
  return `medidas_draft_${userId}`;
}

function loadDraft(userId: string): MeasurementDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    return raw ? (JSON.parse(raw) as MeasurementDraft) : null;
  } catch {
    return null;
  }
}

function saveDraft(userId: string, draft: MeasurementDraft): void {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    // localStorage lleno o deshabilitado -- el borrador es una comodidad, no algo crítico.
  }
}

function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    // ver saveDraft
  }
}

const VIEW_MARKUP = `
  <section class="page-hero">
    <div class="container">
      <a href="profile.html" class="back-link" id="backToProfile"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Volver al perfil</a>
      <span class="eyebrow">Medidas corporales</span>
      <h1>Tus medidas corporales</h1>
      <p>Registrá tus medidas cada tanto y mirá cómo evolucionan con el tiempo.</p>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="bw-actions">
        <button class="btn btn-primary" id="addMeasurementBtn" type="button">+ Agregar medidas</button>
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

// "" en las 3 calculadas (IMC, ratios): son índices sin unidad, a diferencia del resto.
function unitLabelOf(field: MeasurementFieldDef, entryUnidad: BodyWeightUnit): string {
  return field.key === "peso" ? UNIT_LABELS[entryUnidad] : field.unit;
}

/** " cm" / " Kg" / "" -- para no dejar un espacio colgando en las medidas sin unidad (IMC, ratios). */
function unitSuffix(unit: string): string {
  return unit ? ` ${unit}` : "";
}

// Texto de una medida puntual dentro de un registro, ej. "Cintura: 82 cm" / "Peso: 78.5 Kg" / "IMC: 23.4".
function fieldValueLabel(entry: BodyMeasurementEntry, field: MeasurementFieldDef): string | null {
  const value = entry[field.key];
  if (value == null) return null;
  return `${field.label}: ${fmt(value)}${unitSuffix(unitLabelOf(field, entry.unidad))}`;
}

// Todas las medidas cargadas ese día, sean o no las que están activas hoy en Configuración --
// desactivar una medida no borra ni esconde lo que ya se había registrado con ella. Ej. "Peso:
// 78.5 Kg · IMC: 23.4 · Ratio cintura-altura: 0.55". La usan tanto una fila del historial como el
// pie del visor de fotos (ver wirePhotoButtons) -- misma medida, mismo texto en los dos lugares.
function entryMeasurementSummary(entry: BodyMeasurementEntry): string {
  return MEASUREMENT_FIELDS.map((f) => fieldValueLabel(entry, f))
    .filter((s): s is string => s !== null)
    .join(" · ");
}

// Texto que trae precargado el modal "Compartir como Rep": encabezado con la fecha + una línea
// por medida cargada ese día. Se recorta a POST_MAX -- para alguien que sigue las 17 medidas el
// texto completo se pasaría de largo; el usuario lo edita igual antes de publicar.
function buildShareText(entry: BodyMeasurementEntry): string {
  const lines = MEASUREMENT_FIELDS.map((f) => fieldValueLabel(entry, f)).filter((s): s is string => s !== null);
  return [`Mis medidas del ${formatFechaCorta(entry.fecha)}`, "", ...lines].join("\n").slice(0, POST_MAX);
}

function emptyMarkup(): string {
  return `
    <div class="empty-state reveal">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
      <h3>Todavía no cargaste ninguna medida</h3>
      <p>Tocá "Agregar medidas" para registrar tus medidas de hoy. Cuando tengas varios registros vas a ver acá tus estadísticas y la evolución.</p>
    </div>
  `;
}

function statsMarkup(field: MeasurementFieldDef, unit: string, s: MeasurementStats): string {
  const u = unitSuffix(unit);
  return `
    <div class="card-grid">
      <div class="stat-card reveal"><div class="label">${escapeHtml(field.label)} actual</div><div class="value">${fmt(s.current.value)}${u}<small>${escapeHtml(formatFechaCorta(s.current.fecha))}</small></div></div>
      <div class="stat-card reveal"><div class="label">Diferencia hasta hoy</div><div class="value">${s.count >= 2 ? `${signed(s.netChange)}${u}<small>desde tu primer registro (${escapeHtml(formatFechaCorta(s.first.fecha))})</small>` : `—<small>Necesitás al menos 2 registros</small>`}</div></div>
      <div class="stat-card reveal"><div class="label">Máximo</div><div class="value">${fmt(s.max.value)}${u}<small>${escapeHtml(formatFechaCorta(s.max.fecha))}</small></div></div>
      <div class="stat-card reveal"><div class="label">Mínimo</div><div class="value">${fmt(s.min.value)}${u}<small>${escapeHtml(formatFechaCorta(s.min.fecha))}</small></div></div>
      <div class="stat-card reveal"><div class="label">Lo máximo que bajó</div><div class="value">${s.maxDrop > 0 ? `-${fmt(s.maxDrop)}${u}` : "—"}<small>La mayor caída entre un pico y un valle posterior</small></div></div>
      <div class="stat-card reveal"><div class="label">Lo máximo que subió</div><div class="value">${s.maxGain > 0 ? `+${fmt(s.maxGain)}${u}` : "—"}<small>La mayor subida entre un valle y un pico posterior</small></div></div>
    </div>
  `;
}

function historyMarkup(entries: BodyMeasurementEntry[], photoUrls: Map<string, string>): string {
  // Más reciente primero en la lista (entries viene ascendente para los cálculos).
  const rows = [...entries]
    .reverse()
    .map((e) => {
      const summary = entryMeasurementSummary(e);
      const photoUrl = e.fotoPath ? photoUrls.get(e.fotoPath) : undefined;
      return `
    <div class="bw-row" data-id="${e.id}">
      ${photoUrl ? `<button type="button" class="bw-row-photo-btn" data-photo-id="${e.id}" aria-label="Ver foto de progreso"><img class="bw-row-photo" src="${escapeHtml(photoUrl)}" alt=""></button>` : ""}
      <div class="bw-row-main">
        <div class="bw-row-date">${escapeHtml(formatFechaCorta(e.fecha))}</div>
        <div class="bw-row-summary">${escapeHtml(summary)}</div>
        <div class="bw-row-sub">Cargado el ${escapeHtml(formatFechaCorta(e.createdAt))}</div>
      </div>
      <div class="weight-menu-wrap">
        <button type="button" class="profile-menu-btn weight-menu-btn" aria-label="Más opciones" aria-expanded="false">${KEBAB_ICON}</button>
        <div class="profile-menu-panel weight-menu-panel" hidden>
          <button type="button" class="profile-menu-item bw-share" data-id="${e.id}">${SHARE_ICON}Compartir</button>
          <button type="button" class="profile-menu-item bw-edit" data-id="${e.id}">${EDIT_ICON}Editar</button>
          <button type="button" class="profile-menu-item profile-menu-item-danger bw-delete" data-id="${e.id}">${TRASH_ICON}Borrar</button>
        </div>
      </div>
    </div>`;
    })
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

export const medidasView: ViewModule = {
  async mount(container, _params, ctx, authUserId) {
    const myId = authUserId!; // la ruta se registra con auth "required"

    // Feature opt-in (ver profiles.body_measurement_prefs / Configuración > Personalización):
    // por defecto está desactivada para todo el mundo. La RLS de body_measurements ya no exige
    // nada especial (cualquier usuario autenticado gestiona su propio historial) -- este gate
    // solo evita mostrar la pantalla a quien todavía no la activó.
    let prefs = await getBodyMeasurementPrefs(myId);
    if (!prefs.enabled) {
      navigate("profile.html");
      return;
    }
    // Altura: no es una medida por fecha, es profiles.altura_cm (se pide una sola vez en
    // Configuración, ver getAlturaCm) -- IMC/ratio cintura-altura la usan para todo el historial.
    let alturaCm = await getAlturaCm(myId);
    // Género: profiles.genero (Configuración > Editar perfil) -- solo lo usa la clasificación de
    // riesgo del ratio cintura-cadera (los cortes son distintos para hombre/mujer, ver
    // rccClassificationMarkup). null si no está cargado o es "otro" -- en ese caso la pestaña
    // sigue mostrando el ratio y sus estadísticas, solo se omite el badge/tabla de riesgo.
    let genero = await getGenero(myId);

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

    // Métrica elegida en el selector de pestañas (peso, cintura, etc.) -- se recalcula el set de
    // pestañas disponibles en cada render (activar una medida nueva en otra pestaña de la app y
    // volver acá la debería sumar sin recargar).
    // "progreso" es una pestaña extra (galería de fotos), no una medida real -- ver
    // renderMetricArea/PROGRESO_TAB_KEY más abajo.
    let selectedKey: MeasurementKey | typeof PROGRESO_TAB_KEY | null = null;

    // Las 3 calculadas (IMC, ratios) nunca entran acá -- no se cargan a mano, ver loggableFields().
    function loggableActiveFields(): LoggableFieldDef[] {
      return loggableFields().filter((f) => prefs[f.key]);
    }

    // Encabezado por grupo dentro de la guía de "cómo medirme" -- distinto del GROUP_LABELS de
    // Configuración porque acá "peso" nunca incluye altura (no es un campo de este modal, ver
    // nota en MEASUREMENT_FIELDS), así que "Peso y altura" sería confuso.
    const HELP_GROUP_LABELS: Record<"peso" | "circunferencias" | "composicion", string> = {
      peso: "Peso",
      circunferencias: "Circunferencias",
      composicion: "Composición corporal",
    };
    // Solo circunferencias necesita esta aclaración de "cómo" en general -- peso y composición
    // corporal ya la traen implícita en el howTo de cada campo (una sola medida cada uno).
    const HELP_GROUP_TIP: Partial<Record<"peso" | "circunferencias" | "composicion", string>> = {
      circunferencias:
        "Usá una cinta métrica flexible (de costura), no elástica. Tiene que quedar ajustada contra la piel, sin apretarla ni hundirla, y paralela al piso. Medí siempre del mismo lado del cuerpo.",
    };

    // Guía de "cómo medirme", colapsada por default (ver bwHelpToggle) -- solo con los campos que
    // están en ESTE formulario (los que el usuario activó en Configuración), no toda la lista.
    // Ojo: .bw-help-intro/.bw-help-tip van en <div>, NO en <p> -- ".success-check-container p"
    // (el fade-in del texto de éxito, ver modern.css) le pega a CUALQUIER <p> adentro del wrapper
    // del modal, y como estos arrancan ocultos (dentro de #bwHelpPanel[hidden]) esa animación de
    // 0.9s recién arranca al togglear la guía, dejando el texto invisible un rato cada vez que se abre.
    function bwHelpMarkup(fields: LoggableFieldDef[]): string {
      const groups: Array<keyof typeof HELP_GROUP_LABELS> = ["peso", "circunferencias", "composicion"];
      const sections = groups
        .map((g) => {
          const groupFields = fields.filter((f) => f.group === g && f.howTo);
          if (groupFields.length === 0) return "";
          return `
            <div class="bw-help-group">
              <h4>${escapeHtml(HELP_GROUP_LABELS[g])}</h4>
              ${HELP_GROUP_TIP[g] ? `<div class="bw-help-tip">${escapeHtml(HELP_GROUP_TIP[g]!)}</div>` : ""}
              <dl class="bw-help-list">
                ${groupFields.map((f) => `<dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.howTo!)}</dd>`).join("")}
              </dl>
            </div>
          `;
        })
        .join("");
      return `
        <div class="bw-help-intro">Medite siempre en condiciones parecidas: la misma hora del día (lo ideal es a la mañana, en ayunas), con ropa mínima o similar, y en el mismo estado (antes de entrenar o comer). Lo que importa no es el número exacto de un día, sino cómo cambia con el tiempo.</div>
        ${sections}
      `;
    }

    async function openMeasurementModal(existing: BodyMeasurementEntry | null): Promise<void> {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      const fields = loggableActiveFields();
      // El borrador solo aplica a una entrada NUEVA (ver nota junto a loadDraft más arriba).
      const draft = existing ? null : loadDraft(myId);
      const fecha = existing?.fecha ?? draft?.fecha ?? todayLocalISO();
      const unidad: BodyWeightUnit = existing?.unidad ?? draft?.unidad ?? "kg";
      // Bucket privado -- hay que resolver la URL firmada ANTES de armar el HTML del preview
      // (no se puede usar el path directo como src, ver getMeasurementPhotoUrl).
      const existingPhotoPath = existing?.fotoPath ?? null;
      const existingPhotoUrl = existingPhotoPath ? await getMeasurementPhotoUrl(existingPhotoPath) : null;

      const fieldRowsHtml = fields
        .map((f) => {
          const existingValue = existing?.[f.key];
          const draftValue = draft?.values[f.column];
          const initial = existingValue != null ? fmt(existingValue) : (draftValue ?? "");
          if (f.key === "peso") {
            return `
              <div class="field">
                <label for="bwField-peso">Peso</label>
                <div class="bw-field-row">
                  <input type="text" id="bwField-peso" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" autocomplete="off" placeholder="Ej: 78.5" value="${escapeHtml(initial)}">
                  <select id="bwUnidad">
                    ${(Object.keys(UNIT_LABELS) as BodyWeightUnit[]).map((x) => `<option value="${x}" ${x === unidad ? "selected" : ""}>${UNIT_LABELS[x]}</option>`).join("")}
                  </select>
                </div>
              </div>
            `;
          }
          return `
            <div class="field">
              <label for="bwField-${f.column}">${escapeHtml(f.label)}${f.unit ? ` (${f.unit})` : ""}</label>
              <input type="text" id="bwField-${f.column}" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" autocomplete="off" placeholder="Ej: 82" value="${escapeHtml(initial)}">
            </div>
          `;
        })
        .join("");

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card modal-card-lg">
            <h2>${existing ? "Editar medidas" : "Agregar medidas"}</h2>
            <p class="subtitle">Registrá tus medidas para una fecha. Dejá vacío lo que no quieras cargar hoy.</p>
            ${
              draft
                ? `<div class="bw-draft-notice" id="bwDraftNotice">Recuperamos lo que habías empezado a cargar la última vez. <button type="button" id="bwDraftDiscard">Descartar</button></div>`
                : ""
            }
            <button type="button" class="btn btn-outline btn-sm bw-help-toggle" id="bwHelpToggle">¿Cómo me mido? Ver guía</button>
            <div class="bw-help-panel" id="bwHelpPanel" hidden>${bwHelpMarkup(fields)}</div>
            <div class="field">
              <label for="bwFecha">Fecha</label>
              <input type="date" id="bwFecha" max="${todayLocalISO()}" value="${escapeHtml(fecha)}">
            </div>
            ${fieldRowsHtml}
            <div class="field">
              <label for="bwPhotoFile">Foto de progreso (opcional)</label>
              <div class="dropzone" id="bwPhotoDropzone">
                <input type="file" id="bwPhotoFile" accept="image/*" class="dropzone-input" aria-label="Foto de progreso">
                <div class="dropzone-empty" id="bwPhotoEmpty" ${existingPhotoUrl ? "hidden" : ""}>
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                  <p><strong>Hacé clic para subir</strong> o arrastrá una foto acá</p>
                  <span class="field-hint">JPG, PNG o WEBP · hasta 10MB</span>
                </div>
                <div class="dropzone-preview" id="bwPhotoPreview" ${existingPhotoUrl ? "" : "hidden"}>
                  <img id="bwPhotoPreviewImg" class="bw-photo-preview-img" alt="" src="${existingPhotoUrl ? escapeHtml(existingPhotoUrl) : ""}">
                  <span class="dropzone-filename" id="bwPhotoFileName">${existingPhotoUrl ? "Foto actual" : ""}</span>
                  <button type="button" class="dropzone-remove" id="bwPhotoRemove" title="Quitar foto">×</button>
                </div>
              </div>
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

      document.getElementById("bwHelpToggle")?.addEventListener("click", () => {
        const panel = document.getElementById("bwHelpPanel") as HTMLElement;
        const btn = document.getElementById("bwHelpToggle") as HTMLButtonElement;
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        btn.textContent = willOpen ? "Ocultar guía" : "¿Cómo me mido? Ver guía";
      });

      document.getElementById("bwDraftDiscard")?.addEventListener("click", () => {
        clearDraft(myId);
        loaderBody.innerHTML = "";
        void openMeasurementModal(null);
      });

      // Autoguardado del borrador en cada cambio -- solo para una entrada NUEVA (ver nota junto
      // a loadDraft). Cancelar/cerrar el modal NO lo borra a propósito, solo un guardado exitoso.
      if (!existing) {
        const modalCard = loaderBody.querySelector(".modal-card")!;
        const persistDraft = () => {
          const fechaVal = (document.getElementById("bwFecha") as HTMLInputElement).value;
          const unidadVal = (document.getElementById("bwUnidad") as HTMLSelectElement | null)?.value as BodyWeightUnit | undefined;
          const values: Partial<Record<MeasurementColumn, string>> = {};
          for (const f of fields) {
            values[f.column] = (document.getElementById(`bwField-${f.column}`) as HTMLInputElement).value;
          }
          saveDraft(myId, { fecha: fechaVal, unidad: unidadVal ?? "kg", values });
        };
        modalCard.addEventListener("input", persistDraft);
        modalCard.addEventListener("change", persistDraft);
      }

      // ---------- Dropzone de foto (mismo patrón que gymClassManageModal.ts) ----------
      let pendingPhotoFile: File | null = null;
      let photoRemoved = false;
      let previewObjectUrl: string | null = null;
      const photoDropzone = document.getElementById("bwPhotoDropzone");
      const photoInput = document.getElementById("bwPhotoFile") as HTMLInputElement | null;
      const photoEmpty = document.getElementById("bwPhotoEmpty");
      const photoPreview = document.getElementById("bwPhotoPreview");
      const photoPreviewImg = document.getElementById("bwPhotoPreviewImg") as HTMLImageElement | null;
      const photoFileName = document.getElementById("bwPhotoFileName");

      function showPhotoPreview(file: File): void {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = URL.createObjectURL(file);
        if (photoPreviewImg) photoPreviewImg.src = previewObjectUrl;
        if (photoFileName) photoFileName.textContent = file.name;
        photoDropzone?.classList.add("has-file");
        photoEmpty?.setAttribute("hidden", "");
        photoPreview?.removeAttribute("hidden");
        pendingPhotoFile = file;
        photoRemoved = false;
      }

      function clearPhotoPreview(): void {
        if (previewObjectUrl) {
          URL.revokeObjectURL(previewObjectUrl);
          previewObjectUrl = null;
        }
        if (photoInput) photoInput.value = "";
        photoDropzone?.classList.remove("has-file");
        photoPreview?.setAttribute("hidden", "");
        photoEmpty?.removeAttribute("hidden");
        pendingPhotoFile = null;
        photoRemoved = true;
      }

      photoInput?.addEventListener("change", () => {
        const file = photoInput.files?.[0];
        if (file) showPhotoPreview(file);
      });
      document.getElementById("bwPhotoRemove")?.addEventListener("click", clearPhotoPreview);
      photoDropzone?.addEventListener("dragover", (event) => {
        event.preventDefault();
        photoDropzone.classList.add("dragover");
      });
      photoDropzone?.addEventListener("dragleave", () => photoDropzone.classList.remove("dragover"));
      photoDropzone?.addEventListener("drop", (event) => {
        event.preventDefault();
        photoDropzone.classList.remove("dragover");
        const file = (event as DragEvent).dataTransfer?.files?.[0];
        if (file && photoInput) {
          photoInput.files = (event as DragEvent).dataTransfer!.files;
          showPhotoPreview(file);
        }
      });
      ctx.addCleanup(() => {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      });

      document.getElementById("bwSave")?.addEventListener("click", async () => {
        const alertEl = document.getElementById("bwAlert")!;
        alertEl.innerHTML = "";
        const fechaVal = (document.getElementById("bwFecha") as HTMLInputElement).value;
        if (!fechaVal) {
          alertEl.innerHTML = "<p>Elegí una fecha.</p>";
          return;
        }
        if (fechaVal > todayLocalISO()) {
          alertEl.innerHTML = "<p>La fecha no puede ser futura.</p>";
          return;
        }

        const values: MeasurementValues = {};
        let anyFilled = false;
        for (const f of fields) {
          const input = document.getElementById(`bwField-${f.column}`) as HTMLInputElement;
          const raw = input.value.trim().replace(",", ".");
          if (raw === "") {
            values[f.column] = null;
            continue;
          }
          const num = Number(raw);
          const invalid = Number.isNaN(num) || num >= f.max || (f.allowZero ? num < 0 : num <= 0);
          if (invalid) {
            alertEl.innerHTML = `<p>${escapeHtml(f.label)}: ingresá un valor válido${f.unit ? ` en ${f.unit}` : ""}.</p>`;
            return;
          }
          values[f.column] = num;
          anyFilled = true;
        }
        if (!anyFilled) {
          alertEl.innerHTML = "<p>Cargá al menos una medida.</p>";
          return;
        }

        const unidadVal = (document.getElementById("bwUnidad") as HTMLSelectElement | null)?.value as BodyWeightUnit | undefined;

        const saveBtn = document.getElementById("bwSave") as HTMLButtonElement;
        saveBtn.disabled = true;

        // La foto se resuelve al final (después de validar todo lo demás) para no subir un
        // archivo y descartarlo si algún campo numérico todavía tiene un error.
        let finalFotoPath = existingPhotoPath;
        if (pendingPhotoFile) {
          const { path, error } = await uploadMeasurementPhoto(myId, pendingPhotoFile);
          if (error) {
            saveBtn.disabled = false;
            alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
            return;
          }
          finalFotoPath = path!;
        } else if (photoRemoved) {
          finalFotoPath = null;
        }

        const { error } = await upsertBodyMeasurement(myId, fechaVal, values, unidadVal ?? "kg", finalFotoPath);
        if (error) {
          saveBtn.disabled = false;
          alertEl.innerHTML = `<p>${escapeHtml(error)}</p>`;
          return;
        }
        // Recién ahora que el registro quedó guardado con el path nuevo/null: si había una foto
        // vieja distinta, se borra del storage para no dejar un archivo huérfano.
        if (existingPhotoPath && existingPhotoPath !== finalFotoPath) {
          void deleteMeasurementPhoto(existingPhotoPath);
        }
        if (!existing) clearDraft(myId);

        loaderBody.innerHTML = `
          <div class="success-check-container">
            <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
            <p>¡Medidas guardadas con éxito!</p>
          </div>
        `;
        await render();
        const t = setTimeout(() => {
          loaderBody.innerHTML = "";
        }, 1400);
        ctx.addCleanup(() => clearTimeout(t));
      });
    }

    function confirmDeleteModal(entry: BodyMeasurementEntry): void {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;
      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card">
            <h2>Borrar registro</h2>
            <p class="subtitle">Se van a borrar todas las medidas cargadas el ${escapeHtml(formatFechaCorta(entry.fecha))}.</p>
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
        const { error } = await deleteBodyMeasurement(entry.id);
        if (error) {
          loaderBody.innerHTML = "";
          alert(error);
          return;
        }
        // Borrar el registro no borra sola la foto del storage (son cosas separadas) -- sin
        // esto quedaría huérfana para siempre en el bucket privado.
        if (entry.fotoPath) void deleteMeasurementPhoto(entry.fotoPath);
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

    // Comparte un registro del historial como un Rep normal del feed: el texto viene precargado
    // con las medidas de ese día (editable) y, si el registro tiene foto de progreso, viene
    // adjunta (también editable -- se puede quitar o reemplazar por otra). Al publicar, la foto
    // de la medida (bucket privado) se re-descarga y se sube al bucket público de Reps: un Rep
    // es permanente y no puede depender de una URL firmada con TTL.
    async function openShareMeasurementModal(entry: BodyMeasurementEntry): Promise<void> {
      const loaderBody = document.getElementById("loaderBody");
      if (!loaderBody) return;

      // URL firmada solo para el preview del modal (ver getMeasurementPhotoUrl) -- al publicar
      // NO se usa esta URL, se re-descarga el archivo (downloadMeasurementPhoto).
      const measurementPhotoUrl = entry.fotoPath ? await getMeasurementPhotoUrl(entry.fotoPath) : null;
      const defaultText = buildShareText(entry);

      loaderBody.innerHTML = `
        <div class="success-check-container">
          <div class="modal-card modal-card-lg">
            <h2>Compartir como Rep</h2>
            <p class="subtitle">Se va a publicar en tu feed. Editá el texto y la foto como quieras.</p>
            <div class="field">
              <textarea id="bwShareText" class="quote-composer-input" rows="5" placeholder="¿Qué querés contar sobre estas medidas?">${escapeHtml(defaultText)}</textarea>
              <span class="post-composer-counter bw-share-counter" id="bwShareCounter">${POST_MAX}</span>
            </div>
            <div class="field">
              <label for="bwSharePhotoFile">Foto (opcional)</label>
              <div class="dropzone" id="bwSharePhotoDropzone">
                <input type="file" id="bwSharePhotoFile" accept="${SHARE_PHOTO_ACCEPT}" class="dropzone-input" aria-label="Foto del Rep">
                <div class="dropzone-empty" id="bwSharePhotoEmpty" ${measurementPhotoUrl ? "hidden" : ""}>
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                  <p><strong>Hacé clic para subir</strong> o arrastrá una foto acá</p>
                  <span class="field-hint">JPG, PNG o WEBP · hasta 20MB</span>
                </div>
                <div class="dropzone-preview" id="bwSharePhotoPreview" ${measurementPhotoUrl ? "" : "hidden"}>
                  <img id="bwSharePhotoPreviewImg" class="bw-photo-preview-img" alt="" src="${measurementPhotoUrl ? escapeHtml(measurementPhotoUrl) : ""}">
                  <span class="dropzone-filename" id="bwSharePhotoFileName">${measurementPhotoUrl ? "Foto de la medida" : ""}</span>
                  <button type="button" class="dropzone-remove" id="bwSharePhotoRemove" title="Quitar foto">×</button>
                </div>
              </div>
            </div>
            <div class="alert_message" id="bwShareAlert"></div>
            <div class="modal-actions">
              <button class="btn btn-primary" id="bwShareSubmit" type="button">Publicar</button>
              <button class="btn btn-outline" id="bwShareCancel" type="button">Cancelar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("bwShareCancel")?.addEventListener("click", () => {
        loaderBody.innerHTML = "";
      });

      const textEl = document.getElementById("bwShareText") as HTMLTextAreaElement;
      const counterEl = document.getElementById("bwShareCounter")!;
      function updateCounter(): void {
        const remaining = POST_MAX - textEl.value.length;
        counterEl.textContent = String(remaining);
        counterEl.classList.toggle("post-composer-counter-over", remaining < 0);
      }
      textEl.addEventListener("input", updateCounter);
      updateCounter();
      // Menciones @usuario igual que el composer de un Rep / citar un Rep -- el texto sale como
      // "@usuario" plano y createPost lo resuelve y etiqueta (tagMentionedUsers).
      attachMentionAutocomplete(makeMentionEditable(textEl));

      // ---------- Dropzone de foto (mismo patrón que openMeasurementModal) ----------
      // pendingPhotoFile: archivo nuevo elegido a mano. photoRemoved: se quitó la foto original.
      // Media final a publicar = pendingPhotoFile ?? (foto de la medida, si no se quitó) ?? nada.
      let pendingPhotoFile: File | null = null;
      let photoRemoved = false;
      let previewObjectUrl: string | null = null;
      const dz = document.getElementById("bwSharePhotoDropzone");
      const dzInput = document.getElementById("bwSharePhotoFile") as HTMLInputElement | null;
      const dzEmpty = document.getElementById("bwSharePhotoEmpty");
      const dzPreview = document.getElementById("bwSharePhotoPreview");
      const dzPreviewImg = document.getElementById("bwSharePhotoPreviewImg") as HTMLImageElement | null;
      const dzFileName = document.getElementById("bwSharePhotoFileName");

      function showPreview(file: File): void {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = URL.createObjectURL(file);
        if (dzPreviewImg) dzPreviewImg.src = previewObjectUrl;
        if (dzFileName) dzFileName.textContent = file.name;
        dz?.classList.add("has-file");
        dzEmpty?.setAttribute("hidden", "");
        dzPreview?.removeAttribute("hidden");
        pendingPhotoFile = file;
        photoRemoved = false;
      }

      function clearPreview(): void {
        if (previewObjectUrl) {
          URL.revokeObjectURL(previewObjectUrl);
          previewObjectUrl = null;
        }
        if (dzInput) dzInput.value = "";
        dz?.classList.remove("has-file");
        dzPreview?.setAttribute("hidden", "");
        dzEmpty?.removeAttribute("hidden");
        pendingPhotoFile = null;
        photoRemoved = true;
      }

      dzInput?.addEventListener("change", () => {
        const file = dzInput.files?.[0];
        if (file) showPreview(file);
      });
      document.getElementById("bwSharePhotoRemove")?.addEventListener("click", clearPreview);
      dz?.addEventListener("dragover", (event) => {
        event.preventDefault();
        dz.classList.add("dragover");
      });
      dz?.addEventListener("dragleave", () => dz.classList.remove("dragover"));
      dz?.addEventListener("drop", (event) => {
        event.preventDefault();
        dz.classList.remove("dragover");
        const file = (event as DragEvent).dataTransfer?.files?.[0];
        if (file && dzInput) {
          dzInput.files = (event as DragEvent).dataTransfer!.files;
          showPreview(file);
        }
      });
      ctx.addCleanup(() => {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      });

      document.getElementById("bwShareSubmit")?.addEventListener("click", async () => {
        const alertEl = document.getElementById("bwShareAlert")!;
        alertEl.innerHTML = "";
        const text = textEl.value;
        const keepsMeasurementPhoto = entry.fotoPath != null && !photoRemoved && pendingPhotoFile == null;
        const hasMedia = pendingPhotoFile != null || keepsMeasurementPhoto;

        const validationError = validatePostContent(text, hasMedia);
        if (validationError) {
          alertEl.innerHTML = `<p>${escapeHtml(validationError)}</p>`;
          return;
        }

        const submitBtn = document.getElementById("bwShareSubmit") as HTMLButtonElement;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="btn-spinner"></span> Publicando...`;
        const resetBtn = () => {
          submitBtn.disabled = false;
          submitBtn.textContent = "Publicar";
        };

        let uploadedPath: string | undefined;
        try {
          let fileToUpload: File | null = pendingPhotoFile;
          if (!fileToUpload && keepsMeasurementPhoto) {
            const blob = await downloadMeasurementPhoto(entry.fotoPath!);
            if (!blob) {
              resetBtn();
              alertEl.innerHTML = `<p>No se pudo adjuntar la foto de la medida. Quitala y subí una a mano, o publicá sin foto.</p>`;
              return;
            }
            const type = blob.type || "image/jpeg";
            const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
            fileToUpload = new File([blob], `medida-${entry.fecha}.${ext}`, { type });
          }

          let mediaUrl: string | undefined;
          let mediaType: "image" | "video" | undefined;
          if (fileToUpload) {
            const up = await uploadPostMedia(myId, fileToUpload);
            if (up.error || !up.url) {
              resetBtn();
              alertEl.innerHTML = `<p>${escapeHtml(up.error || "No se pudo subir la foto.")}</p>`;
              return;
            }
            mediaUrl = up.url;
            mediaType = up.mediaType;
            uploadedPath = up.path;
          }

          const { post, error } = await createPost(myId, text, mediaUrl, mediaType);
          if (error || !post) {
            if (uploadedPath) void deletePostMedia(uploadedPath);
            resetBtn();
            alertEl.innerHTML = `<p>${escapeHtml(error || "No se pudo publicar el Rep.")}</p>`;
            return;
          }

          loaderBody.innerHTML = `
            <div class="success-check-container">
              <div class="success-icon"><svg viewBox="0 0 52 52" class="success-svg"><circle cx="26" cy="26" r="25" fill="none" class="success-circle" /><path fill="none" d="M14 27l7 7 16-16" class="success-check" /></svg></div>
              <p>¡Rep publicado! Lo vas a ver en tu feed.</p>
            </div>
          `;
          const t = setTimeout(() => {
            loaderBody.innerHTML = "";
          }, 1600);
          ctx.addCleanup(() => clearTimeout(t));
        } catch (err) {
          console.error("[medidas] error compartiendo medida:", err);
          if (uploadedPath) void deletePostMedia(uploadedPath);
          resetBtn();
          alertEl.innerHTML = `<p>No se pudo publicar el Rep. Probá de nuevo.</p>`;
        }
      });
    }

    function wireHistoryMenus(entries: BodyMeasurementEntry[]): void {
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
      content.querySelectorAll<HTMLButtonElement>(".bw-share").forEach((btn) => {
        btn.addEventListener("click", () => {
          btn.closest<HTMLElement>(".weight-menu-panel")!.hidden = true;
          const entry = entries.find((e) => e.id === btn.dataset.id);
          if (entry) void openShareMeasurementModal(entry);
        });
      });
      content.querySelectorAll<HTMLButtonElement>(".bw-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
          btn.closest<HTMLElement>(".weight-menu-panel")!.hidden = true;
          const entry = entries.find((e) => e.id === btn.dataset.id);
          if (entry) void openMeasurementModal(entry);
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

    // Abre el visor a pantalla completa (mismo componente que Reps/chat, ver mediaLightbox.ts)
    // con la cola de TODAS las fotos de progreso, de la más nueva a la más vieja -- MISMO orden
    // en que se ven en el historial y en la grilla de Progreso (ambos muestran la más nueva
    // primero), para que deslizar vaya siempre hacia la foto físicamente vecina en pantalla, no al
    // revés. horizontalNav: deslizar a la izquierda avanza (más vieja), a la derecha vuelve (más
    // nueva) -- en vez del gesto vertical de siempre, que acá no tendría "cerrar" natural (se
    // cierra con la cruz). Compartido por las miniaturas del historial (.bw-row-photo-btn) y la
    // grilla de la pestaña Progreso (.bw-gallery-item).
    function wirePhotoButtons(root: ParentNode, selector: string, entries: BodyMeasurementEntry[], photoUrls: Map<string, string>): void {
      const withPhotos = [...entries].reverse().filter((e) => e.fotoPath && photoUrls.has(e.fotoPath));
      root.querySelectorAll<HTMLButtonElement>(selector).forEach((btn) => {
        btn.addEventListener("click", () => {
          const startIndex = withPhotos.findIndex((e) => e.id === btn.dataset.photoId);
          if (startIndex === -1) return;
          openMediaLightbox<BodyMeasurementEntry>({
            queue: withPhotos,
            startIndex,
            horizontalNav: true,
            getMedia: (e) => ({ url: photoUrls.get(e.fotoPath!)!, kind: "image" }),
            renderFooter: (e, footerEl) => {
              const summary = entryMeasurementSummary(e);
              footerEl.innerHTML = `
                <p class="bw-photo-lightbox-caption">${escapeHtml(formatFechaCorta(e.fecha))}</p>
                ${summary ? `<p class="bw-photo-lightbox-summary">${escapeHtml(summary)}</p>` : ""}
              `;
            },
          });
        });
      });
    }

    // Grilla de la pestaña "Progreso" -- todas las fotos, de la más nueva a la más vieja (mismo
    // criterio que el historial). Solo se llega acá si hay al menos una (ver renderMetricArea).
    function progressGalleryMarkup(entries: BodyMeasurementEntry[], photoUrls: Map<string, string>): string {
      const cells = [...entries]
        .reverse()
        .filter((e) => e.fotoPath && photoUrls.has(e.fotoPath))
        .map(
          (e) => `
        <button type="button" class="bw-gallery-item" data-photo-id="${e.id}" aria-label="Ver foto del ${escapeHtml(formatFechaCorta(e.fecha))}">
          <img src="${escapeHtml(photoUrls.get(e.fotoPath!)!)}" alt="" loading="lazy">
          <span class="bw-gallery-date">${escapeHtml(formatFechaCorta(e.fecha))}</span>
        </button>`
        )
        .join("");
      return `
        <div class="chart-card reveal">
          <h3>Fotos de progreso</h3>
          <p class="chart-sub">Todas tus fotos, de la más nueva a la más vieja. Tocá cualquiera para verla más grande.</p>
          <div class="bw-gallery-grid">${cells}</div>
        </div>
      `;
    }

    // Tono semántico de una categoría (compartido por IMC/RCA/RCC pese a que cada una nombra sus
    // categorías distinto) -- ok=verde, warning=amarillo, danger=rojo. Ver .imc-badge-ok/-warning/
    // -danger en modern.css (reemplazan las clases por-categoría que tenía antes solo IMC).
    function badgeTone(key: string): "ok" | "warning" | "danger" {
      if (key === "normal" || key === "saludable" || key === "bajoRiesgo") return "ok";
      if (key === "obesidad" || key === "riesgoAlto") return "danger";
      return "warning"; // bajoPeso, sobrepeso, riesgoModerado
    }

    // Rango en texto genérico para las 3 medidas calculadas: "menos de X" / "X – Y" / "X o más".
    // `epsilon` es cuánto restarle al techo de una categoría "de dos puntas" para que no se vea
    // pegado al piso de la siguiente -- 0.1 para IMC (se reporta a 1 decimal), 0.01 para los
    // ratios RCA/RCC (se reportan a 2).
    function rangeLabel(min: number, max: number | null, epsilon: number): string {
      if (min === 0) return `menos de ${fmt(max!)}`;
      if (max == null) return `${fmt(min)} o más`;
      return `${fmt(min)} – ${fmt(max - epsilon)}`;
    }

    // Mismo formato pero para un valor YA convertido a su unidad final (cm, o kg/lb) -- sin
    // restar epsilon de nuevo, porque viene de imcWeightBoundariesKg/rcaWaistBoundariesCm/
    // rccWaistBoundariesCmForHip, que ya lo aplicaron antes de convertir.
    function valueRangeLabel(min: number | null, max: number | null, unit: string): string {
      const u = unitSuffix(unit);
      if (min == null) return `menos de ${fmt(max!)}${u}`;
      if (max == null) return `${fmt(min)}${u} o más`;
      return `${fmt(min)} – ${fmt(max)}${u}`;
    }

    // Badge de "dónde estoy parado" + tabla de fronteras de peso según la altura del perfil --
    // solo se muestra en la pestaña IMC (ver renderMetricSection). 4 categorías OMS sin desglosar
    // obesidad en grados I/II/III, por pedido explícito del usuario.
    function imcClassificationMarkup(currentImc: number, alturaCm: number, unidad: BodyWeightUnit): string {
      const current = imcCategoryFor(currentImc);
      const rows = imcWeightBoundariesKg(alturaCm)
        .map(
          ({ category, minKg, maxKg }) => `
        <div class="imc-range-row${category.key === current.key ? " imc-range-row-active" : ""}">
          <span class="imc-badge imc-badge-${badgeTone(category.key)}">${escapeHtml(category.label)}</span>
          <span class="imc-range-imc">IMC ${escapeHtml(rangeLabel(category.min, category.max, 0.1))}</span>
          <span class="imc-range-weight">${escapeHtml(valueRangeLabel(minKg != null ? kgToUnit(minKg, unidad) : null, maxKg != null ? kgToUnit(maxKg, unidad) : null, UNIT_LABELS[unidad]))}</span>
        </div>`
        )
        .join("");

      return `
    <div class="chart-card reveal">
      <div class="imc-classify-row">
        <span class="imc-badge imc-badge-${badgeTone(current.key)}">${escapeHtml(current.label)}</span>
        <span class="imc-classify-value">Tu IMC es ${fmt(currentImc)}</span>
      </div>
      <h3>Rangos según tu altura</h3>
      <p class="chart-sub">Peso equivalente a cada categoría con tu altura de ${fmt(alturaCm)} cm.</p>
      <div class="imc-range-list">${rows}</div>
    </div>
  `;
    }

    // Igual que IMC pero para el ratio cintura-altura -- 4 categorías de Ashwell, tampoco depende
    // del sexo, se ancla en la misma altura de perfil.
    function rcaClassificationMarkup(currentRatio: number, alturaCm: number): string {
      const current = rcaCategoryFor(currentRatio);
      const rows = rcaWaistBoundariesCm(alturaCm)
        .map(
          ({ category, minCm, maxCm }) => `
        <div class="imc-range-row${category.key === current.key ? " imc-range-row-active" : ""}">
          <span class="imc-badge imc-badge-${badgeTone(category.key)}">${escapeHtml(category.label)}</span>
          <span class="imc-range-imc">Ratio ${escapeHtml(rangeLabel(category.min, category.max, 0.01))}</span>
          <span class="imc-range-weight">${escapeHtml(valueRangeLabel(minCm, maxCm, "cm"))}</span>
        </div>`
        )
        .join("");

      return `
    <div class="chart-card reveal">
      <div class="imc-classify-row">
        <span class="imc-badge imc-badge-${badgeTone(current.key)}">${escapeHtml(current.label)}</span>
        <span class="imc-classify-value">Tu ratio cintura-altura es ${fmt(currentRatio)}</span>
      </div>
      <h3>Rangos según tu altura</h3>
      <p class="chart-sub">Cintura equivalente a cada categoría con tu altura de ${fmt(alturaCm)} cm.</p>
      <div class="imc-range-list">${rows}</div>
    </div>
  `;
    }

    // Ratio cintura-cadera: 3 categorías de riesgo con cortes distintos por sexo (ver
    // RCC_CATEGORIES_BY_SEX). A diferencia de IMC/RCA no hay un ancla de perfil fija -- la
    // frontera en cm usa la cadera del registro MÁS RECIENTE con ratio calculado (caderaCm, ver
    // renderMetricSection); si todavía no hay ninguna, se muestra solo la tabla de ratios.
    function rccClassificationMarkup(currentRatio: number, sex: RccSex, caderaCm: number | null): string {
      const current = rccCategoryFor(currentRatio, sex);
      const boundaries = caderaCm != null ? rccWaistBoundariesCmForHip(caderaCm, sex) : null;
      const rows = rccCategoriesFor(sex)
        .map((category, i) => {
          const b = boundaries?.[i];
          return `
        <div class="imc-range-row${category.key === current.key ? " imc-range-row-active" : ""}">
          <span class="imc-badge imc-badge-${badgeTone(category.key)}">${escapeHtml(category.label)}</span>
          <span class="imc-range-imc">Ratio ${escapeHtml(rangeLabel(category.min, category.max, 0.01))}</span>
          ${b ? `<span class="imc-range-weight">${escapeHtml(valueRangeLabel(b.minCm, b.maxCm, "cm"))}</span>` : ""}
        </div>`;
        })
        .join("");

      return `
    <div class="chart-card reveal">
      <div class="imc-classify-row">
        <span class="imc-badge imc-badge-${badgeTone(current.key)}">${escapeHtml(current.label)}</span>
        <span class="imc-classify-value">Tu ratio cintura-cadera es ${fmt(currentRatio)}</span>
      </div>
      <h3>Rangos de riesgo (${sex === "hombre" ? "hombres" : "mujeres"})</h3>
      <p class="chart-sub">${caderaCm != null ? `Cintura equivalente a cada categoría con tu cadera actual de ${fmt(caderaCm)} cm.` : "Cargá tu cadera para ver a cuántos cm de cintura equivale cada categoría."}</p>
      <div class="imc-range-list">${rows}</div>
    </div>
  `;
    }

function noDataMarkup(field: MeasurementFieldDef): string {
      if (field.computed) {
        const parts = (field.requires ?? []).map((k) => fieldDef(k).label);
        if (field.requiresAltura) parts.push("tu altura (Configuración > Personalización)");
        return `<p class="chart-sub">Todavía no se puede calcular "${escapeHtml(field.label)}" -- necesitás cargar ${escapeHtml(parts.join(" + "))} al menos una vez.</p>`;
      }
      return `<p class="chart-sub">Todavía no cargaste "${escapeHtml(field.label)}". Tocá "Agregar medidas" para sumar tu primer registro.</p>`;
    }

    async function renderMetricSection(field: MeasurementFieldDef, entries: BodyMeasurementEntry[]): Promise<string> {
      const computed = computeMeasurementStats(entries, field.key);
      chartInstance?.destroy();
      chartInstance = null;
      if (!computed) return noDataMarkup(field);

      const unit = field.key === "peso" ? UNIT_LABELS[computed.unidad!] : field.unit;
      const series = entries.filter((e) => e[field.key] != null && (field.key !== "peso" || e.unidad === computed.unidad));

      // Badge + tabla de fronteras, solo en las 3 pestañas calculadas -- cada una necesita un
      // dato distinto para poder mostrarla (altura de perfil las dos primeras, género la última).
      let classificationExtra = "";
      if (field.key === "imc" && alturaCm != null) {
        classificationExtra = imcClassificationMarkup(computed.stats.current.value, alturaCm, computeMeasurementStats(entries, "peso")?.unidad ?? "kg");
      } else if (field.key === "ratioCinturaAltura" && alturaCm != null) {
        classificationExtra = rcaClassificationMarkup(computed.stats.current.value, alturaCm);
      } else if (field.key === "ratioCinturaCadera" && genero != null) {
        // Cadera del registro más reciente con ratio calculado -- misma fila que dio
        // computed.stats.current (series viene ordenada ascendente, ver computeMeasurementStats).
        const lastCadera = series[series.length - 1]?.cadera ?? null;
        classificationExtra = rccClassificationMarkup(computed.stats.current.value, genero, lastCadera);
      }

      const html = `
        ${statsMarkup(field, unit, computed.stats)}
        ${classificationExtra}
        ${
          series.length >= 2
            ? `<div class="chart-card reveal">
                 <h3>Evolución</h3>
                 <p class="chart-sub">${escapeHtml(field.label)}${unit ? ` en ${unit}` : ""} a lo largo del tiempo.</p>
                 <div class="chart-wrap"><canvas id="bwChart"></canvas></div>
               </div>`
            : ""
        }
      `;
      return html;
    }

    async function drawChartIfNeeded(field: MeasurementFieldDef, entries: BodyMeasurementEntry[]): Promise<void> {
      const computed = computeMeasurementStats(entries, field.key);
      if (!computed) return;
      const series = entries.filter((e) => e[field.key] != null && (field.key !== "peso" || e.unidad === computed.unidad));
      if (series.length < 2) return;
      const canvas = container.querySelector("#bwChart") as HTMLCanvasElement | null;
      if (!canvas) return;
      const unit = field.key === "peso" ? UNIT_LABELS[computed.unidad!] : field.unit;
      const Chart = await loadChart();
      chartInstance = new Chart(canvas, {
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

    function wireMetricTabs(entries: BodyMeasurementEntry[], photoUrls: Map<string, string>): void {
      container.querySelectorAll<HTMLButtonElement>(".measurement-metric-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedKey = btn.dataset.key as MeasurementKey | typeof PROGRESO_TAB_KEY;
          void renderMetricArea(entries, photoUrls);
        });
      });
    }

    async function renderMetricArea(entries: BodyMeasurementEntry[], photoUrls: Map<string, string>): Promise<void> {
      // Pestañas: solo medidas activas que ya tengan al menos un registro (evita una fila de
      // pestañas vacías apenas alguien activa 5 medidas nuevas en Configuración sin haber
      // cargado nada todavía -- "Agregar medidas" igual ofrece las 5 como campos). "Progreso" se
      // suma al final solo si hay alguna foto cargada (ver progressGalleryMarkup).
      const tabFields = MEASUREMENT_FIELDS.filter((f) => prefs[f.key] && entries.some((e) => e[f.key] != null));
      const hasPhotos = entries.some((e) => e.fotoPath != null);
      const tabsWrap = container.querySelector("#measurementMetricTabs") as HTMLElement | null;
      const metricArea = container.querySelector("#measurementMetricArea") as HTMLElement | null;
      if (!tabsWrap || !metricArea) return;

      if (tabFields.length === 0 && !hasPhotos) {
        tabsWrap.hidden = true;
        metricArea.innerHTML = "";
        return;
      }
      const validKeys = new Set<string>(tabFields.map((f) => f.key));
      if (hasPhotos) validKeys.add(PROGRESO_TAB_KEY);
      if (!selectedKey || !validKeys.has(selectedKey)) {
        selectedKey = tabFields[0]?.key ?? PROGRESO_TAB_KEY;
      }

      tabsWrap.hidden = false;
      tabsWrap.innerHTML =
        tabFields
          .map((f) => `<button type="button" class="routine-tab measurement-metric-tab${f.key === selectedKey ? " active" : ""}" data-key="${f.key}">${escapeHtml(f.label)}</button>`)
          .join("") +
        (hasPhotos
          ? `<button type="button" class="routine-tab measurement-metric-tab${selectedKey === PROGRESO_TAB_KEY ? " active" : ""}" data-key="${PROGRESO_TAB_KEY}">Progreso</button>`
          : "");
      wireMetricTabs(entries, photoUrls);

      if (selectedKey === PROGRESO_TAB_KEY) {
        metricArea.innerHTML = progressGalleryMarkup(entries, photoUrls);
        wirePhotoButtons(metricArea, ".bw-gallery-item", entries, photoUrls);
        return;
      }

      const field = tabFields.find((f) => f.key === selectedKey)!;
      metricArea.innerHTML = await renderMetricSection(field, entries);
      await drawChartIfNeeded(field, entries);
    }

    async function render(): Promise<void> {
      const content = container.querySelector("#bwContent");
      if (!content) return;

      let entries: BodyMeasurementEntry[];
      try {
        entries = await listBodyMeasurements(myId, alturaCm);
      } catch {
        content.innerHTML = `<p class="chart-sub">No se pudo cargar tu historial de medidas. Probá recargar la página.</p>`;
        return;
      }

      chartInstance?.destroy();
      chartInstance = null;

      if (entries.length === 0) {
        content.innerHTML = emptyMarkup();
        return;
      }

      // Una sola llamada de red para las URLs firmadas de todas las fotos del historial (ver
      // getMeasurementPhotoUrls) en vez de una por fila.
      const photoPaths = entries.filter((e): e is BodyMeasurementEntry & { fotoPath: string } => e.fotoPath != null).map((e) => e.fotoPath);
      const photoUrls = await getMeasurementPhotoUrls(photoPaths);

      content.innerHTML = `
        <div class="routine-tabs" id="measurementMetricTabs" hidden></div>
        <div id="measurementMetricArea"></div>
        ${historyMarkup(entries, photoUrls)}
      `;

      wireHistoryMenus(entries);
      wirePhotoButtons(content, ".bw-row-photo-btn", entries, photoUrls);
      await renderMetricArea(entries, photoUrls);
    }

    container.innerHTML = VIEW_MARKUP;
    container.querySelector("#addMeasurementBtn")?.addEventListener("click", () => void openMeasurementModal(null), { signal: ctx.signal });

    await render();

    updateHandler = () => {
      void (async () => {
        // Las preferencias (y la altura) pueden haber cambiado en Configuración desde la última
        // vez que se montó esta vista (el shell mantiene las vistas vivas, ver update() en otras páginas).
        prefs = await getBodyMeasurementPrefs(myId);
        if (!prefs.enabled) {
          navigate("profile.html");
          return;
        }
        alturaCm = await getAlturaCm(myId);
        genero = await getGenero(myId);
        await render();
      })();
    };
    ctx.addCleanup(() => {
      updateHandler = null;
    });
  },
  update() {
    updateHandler?.();
  },
};
