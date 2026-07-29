export const DIA_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function diaLabel(diaSemana: number): string {
  return DIA_LABELS[diaSemana - 1] ?? "Día";
}

export function formatFechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}/${m}/${y}`;
}
