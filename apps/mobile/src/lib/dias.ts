export const DIA_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function diaLabel(diaSemana: number): string {
  return DIA_LABELS[diaSemana - 1] ?? "Día";
}

export function dayDisplayLabel(diaSemana: number, nombre?: string | null): string {
  return nombre?.trim() || diaLabel(diaSemana);
}

export function formatFechaCorta(iso: string): string {
  const datePart = iso.split(/[T ]/)[0];
  const [y, m, d] = datePart.split("-").map(Number);
  return `${d}/${m}/${y}`;
}
