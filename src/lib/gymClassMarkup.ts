import { escapeHtml } from "./dom";
import { getClassCapacityStatus, type ClassSession } from "../services/gymClass.service";

export const CLASS_DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const CLASS_DAY_ABBR = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function classFormatTime(t: string): string {
  return t.slice(0, 5);
}

export function classSessionsSummary(sessions: ClassSession[]): string {
  if (sessions.length === 0) return "Sin horario definido";
  return sessions.map((s) => `${CLASS_DAY_ABBR[s.dayOfWeek]} ${classFormatTime(s.startTime)}-${classFormatTime(s.endTime)}`).join(", ");
}

// Mismo icono de "pesa" que ya se usa para el quick-action "Tus clases" en profile.ts, reusado
// como placeholder cuando la clase no tiene foto -- asi el look es "moderno y simple" y consistente
// con el resto de los iconos de la app (feather-style, sin emoji) en vez de una foto stock generica.
const BARBELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg>`;

/** `<img>` si hay foto, si no un placeholder con icono sobre fondo tintado (mismas dimensiones via extraClass). */
export function classImageHtml(imageUrl: string | null, extraClass = ""): string {
  const cls = `gym-class-image${extraClass ? ` ${extraClass}` : ""}`;
  if (imageUrl) return `<img src="${escapeHtml(imageUrl)}" alt="" class="${cls}" loading="lazy" decoding="async">`;
  return `<div class="${cls} gym-class-image-placeholder">${BARBELL_ICON}</div>`;
}

const CAPACITY_BADGE_LABEL: Record<"vacio" | "medio" | "lleno", string> = { vacio: "Vacío", medio: "Medio", lleno: "Lleno" };

/** Cartel de cupo (vacio/medio/lleno). "" si la clase no tiene limite -- no hay "vacio"/"lleno" que mostrar. */
export function classCapacityBadgeHtml(enrolledCount: number, capacity: number | null): string {
  const status = getClassCapacityStatus(enrolledCount, capacity);
  if (status === "unlimited") return "";
  return `<span class="class-capacity-badge class-capacity-badge-${status === "vacio" ? "ok" : status === "medio" ? "mid" : "full"}">${CAPACITY_BADGE_LABEL[status]}</span>`;
}
