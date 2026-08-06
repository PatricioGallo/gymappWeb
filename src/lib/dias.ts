export const DIA_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function diaLabel(diaSemana: number): string {
  return DIA_LABELS[diaSemana - 1] ?? "Día";
}

export function dayDisplayLabel(diaSemana: number, nombre?: string | null): string {
  return nombre?.trim() || diaLabel(diaSemana);
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
