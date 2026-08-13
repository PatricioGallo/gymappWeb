export const DIA_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function diaLabel(diaSemana: number): string {
  return DIA_LABELS[diaSemana - 1] ?? "Día";
}

export function dayDisplayLabel(diaSemana: number, nombre?: string | null): string {
  return nombre?.trim() || diaLabel(diaSemana);
}

/** Fecha de un Date en "YYYY-MM-DD" segun el reloj LOCAL, no UTC -- a diferencia de
 * `date.toISOString().slice(0, 10)`, que en husos horarios negativos (ej. Argentina,
 * UTC-3) adelanta la fecha si son mas de las 21hs locales (ya es el dia siguiente en UTC). */
export function dateToLocalISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayLocalISO(): string {
  return dateToLocalISO(new Date());
}

export function formatFechaCorta(iso: string): string {
  // Sirve tanto para fechas puras (routines.fecha_inicio, "YYYY-MM-DD") como para
  // timestamps completos (subscriptions.created_at/ended_at, timestamptz): sin
  // esto, el "T17:39:05..." que sigue al dia en un timestamp rompia el Number()
  // del dia y quedaba en NaN.
  const datePart = iso.split(/[T ]/)[0];
  const [y, m, d] = datePart.split("-").map(Number);
  return `${d}/${m}/${y}`;
}

/** Timestamp corto estilo redes sociales: "ahora", "5m", "2h", "3d" o "3 sep" (con año si no es el actual). */
export function formatTiempoRelativo(iso: string): string {
  const date = new Date(iso);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
}
