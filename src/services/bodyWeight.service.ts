import { supabase } from "../lib/supabaseClient";

export type BodyWeightUnit = "kg" | "lb";

export interface BodyWeightEntry {
  id: string;
  fecha: string; // "YYYY-MM-DD" -- el día al que corresponde la medición
  peso: number;
  unidad: BodyWeightUnit;
  createdAt: string; // cuándo se cargó la fila (timestamptz)
}

// Historial completo de peso corporal del usuario, más viejo primero (así los gráficos y los
// cálculos de racha/diferencia recorren la serie en orden cronológico sin re-ordenar).
export async function listBodyWeights(userId: string): Promise<BodyWeightEntry[]> {
  const { data, error } = await supabase
    .from("body_weight_logs")
    .select("id, fecha, peso, unidad, created_at")
    .eq("user_id", userId)
    .order("fecha", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    fecha: r.fecha,
    peso: Number(r.peso),
    unidad: (r.unidad === "lb" ? "lb" : "kg") as BodyWeightUnit,
    createdAt: r.created_at,
  }));
}

// Upsert (no insert): volver a cargar el peso de un día ya cargado pisa el valor anterior en vez
// de fallar por la constraint unique (user_id, fecha). created_at se reescribe a mano para que
// "cuándo se cargó" refleje la última edición, mismo criterio que insertWeightLogs.
export async function upsertBodyWeight(
  userId: string,
  fecha: string,
  peso: number,
  unidad: BodyWeightUnit
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("body_weight_logs")
    .upsert({ user_id: userId, fecha, peso, unidad, created_at: new Date().toISOString() }, { onConflict: "user_id,fecha" });
  if (error) return { error: "No se pudo guardar el peso. Probá de nuevo." };
  return {};
}

export async function deleteBodyWeight(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("body_weight_logs").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar el registro. Probá de nuevo." };
  return {};
}

export interface BodyWeightStats {
  count: number;
  current: BodyWeightEntry;
  first: BodyWeightEntry;
  max: BodyWeightEntry;
  min: BodyWeightEntry;
  /** peso actual − primer peso registrado (positivo = subió, negativo = bajó). */
  netChange: number;
  /** La mayor caída pico→valle que hubo en algún tramo del historial (drawdown máximo). */
  maxDrop: number;
  /** La mayor subida valle→pico que hubo en algún tramo del historial (run-up máximo). */
  maxGain: number;
}

/** Todas las métricas de la pantalla se calculan sobre una única unidad (kg y lb no son
 * convertibles entre sí acá): se usa la más repetida en el historial, mismo criterio que
 * getExerciseStats en weightLog.service.ts. Devuelve null si no hay registros en esa unidad. */
export function computeBodyWeightStats(entries: BodyWeightEntry[]): { unidad: BodyWeightUnit; stats: BodyWeightStats } | null {
  if (entries.length === 0) return null;

  const countByUnit = new Map<BodyWeightUnit, number>();
  entries.forEach((e) => countByUnit.set(e.unidad, (countByUnit.get(e.unidad) ?? 0) + 1));
  const unidad = [...countByUnit.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // entries ya viene ordenado por fecha ascendente desde listBodyWeights.
  const series = entries.filter((e) => e.unidad === unidad);
  if (series.length === 0) return null;

  const first = series[0];
  const current = series[series.length - 1];
  const max = series.reduce((best, e) => (e.peso > best.peso ? e : best));
  const min = series.reduce((best, e) => (e.peso < best.peso ? e : best));

  let runningPeak = series[0].peso;
  let runningTrough = series[0].peso;
  let maxDrop = 0;
  let maxGain = 0;
  series.forEach((e) => {
    runningPeak = Math.max(runningPeak, e.peso);
    runningTrough = Math.min(runningTrough, e.peso);
    maxDrop = Math.max(maxDrop, runningPeak - e.peso);
    maxGain = Math.max(maxGain, e.peso - runningTrough);
  });

  return {
    unidad,
    stats: {
      count: series.length,
      current,
      first,
      max,
      min,
      netChange: current.peso - first.peso,
      maxDrop,
      maxGain,
    },
  };
}
