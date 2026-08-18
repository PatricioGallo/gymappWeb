import type { Chart as ChartClass } from "chart.js";

let chartPromise: Promise<typeof ChartClass> | null = null;

/**
 * Carga Chart.js con import() dinamico en vez de estatico: un import estatico en cualquier
 * modulo alcanzable desde boot.ts (que TODAS las paginas cargan) termina empaquetado en ese
 * chunk compartido, aunque solo perfil/progreso/admin grafican. Memoizado -- el import()
 * dinamico ya cachea el modulo por su cuenta, pero esto evita reentradas concurrentes
 * disparando cada una su propia descarga antes de que la primera resuelva.
 */
export function loadChart(): Promise<typeof ChartClass> {
  if (!chartPromise) chartPromise = import("chart.js/auto").then((m) => m.default);
  return chartPromise;
}
