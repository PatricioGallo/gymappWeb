import { supabase } from "../lib/supabaseClient";
import type { Enums } from "../types/database";

export type WeightUnit = Enums<"weight_unit">;

export interface NewWeightLog {
  routine_exercise_id: string;
  exercise_id: string;
  fecha: string;
  peso: number;
  serie: number;
  repe: number;
  unidad: WeightUnit;
}

// Upsert (no insert): guardar el mismo dia/serie mas de una vez (ej. el usuario toca "Guardar"
// varias veces durante la misma sesion) pisa la fila existente en vez de acumular duplicados.
// created_at se reescribe a mano en cada guardado porque dayLastActivityAt() (pesos.ts) lo usa
// para saber "cuando se toco por ultima vez este dia" -- si no se actualizara, una edicion
// posterior no se reflejaria ahi.
export async function insertWeightLogs(userId: string, entries: NewWeightLog[]): Promise<void> {
  const { error } = await supabase
    .from("weight_logs")
    .upsert(
      entries.map((e) => ({ user_id: userId, ...e, created_at: new Date().toISOString() })),
      { onConflict: "user_id,routine_exercise_id,fecha,serie" }
    );
  if (error) throw error;
}

export interface TrainedExercise {
  id: string;
  name: string;
}

/** Ejercicios distintos que YO entrené alguna vez (para el selector del widget "Progreso por
 * ejercicio" en Configuración > Personalización) -- usa la RPC list_trained_exercises en vez
 * de traer weight_logs completo, que en una cuenta con mucho historial puede ser miles de filas
 * solo para sacar nombres unicos. */
export async function listTrainedExercises(): Promise<TrainedExercise[]> {
  const { data, error } = await supabase.rpc("list_trained_exercises");
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.exercise_id, name: row.name }));
}

// Borra unicamente la carga de hoy para este ejercicio (todas sus series), sin tocar
// registros de dias anteriores: "deshacer" lo que se acaba de guardar por error.
export async function deleteTodayWeightLog(userId: string, routineExerciseId: string, fecha: string): Promise<void> {
  const { error } = await supabase
    .from("weight_logs")
    .delete()
    .eq("user_id", userId)
    .eq("routine_exercise_id", routineExerciseId)
    .eq("fecha", fecha);
  if (error) throw error;
}

export interface LatestWeightEntry {
  peso: number;
  fecha: string;
  unidad: WeightUnit;
  repe: number | null;
  createdAt: string;
}

// Cada serie puede tener un historial por unidad (kg/lb/bloques); el primer elemento
// del array es el mas reciente entre todas las unidades, usado para sugerir la unidad por defecto.
export type LatestWeightsMap = Map<string, Map<number, LatestWeightEntry[]>>;

interface RawWeightRow {
  id: string | null;
  peso: number;
  fecha: string;
  serie: number | null;
  unidad: WeightUnit;
  repe: number | null;
  created_at: string;
}

function groupLatestWeights(rows: RawWeightRow[]): LatestWeightsMap {
  const map: LatestWeightsMap = new Map();
  const seen = new Set<string>();

  rows.forEach((row) => {
    const id = row.id;
    if (!id) return;
    const serieIndex = row.serie ?? 1;
    const unidad = row.unidad;
    const dedupeKey = `${id}:${serieIndex}:${unidad}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    let bySerie = map.get(id);
    if (!bySerie) {
      bySerie = new Map();
      map.set(id, bySerie);
    }
    let entries = bySerie.get(serieIndex);
    if (!entries) {
      entries = [];
      bySerie.set(serieIndex, entries);
    }
    entries.push({ peso: row.peso, fecha: row.fecha, unidad, repe: row.repe, createdAt: row.created_at });
  });
  return map;
}

// Historial acotado a la ocurrencia puntual de este ejercicio en esta semana/dia
// (se usa para saber si "ya cargue esto hoy" y prellenar mientras se continua la sesion).
export async function getLatestWeights(routineExerciseIds: string[]): Promise<LatestWeightsMap> {
  if (routineExerciseIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("weight_logs")
    .select("id:routine_exercise_id, peso, fecha, serie, unidad, repe, created_at")
    .in("routine_exercise_id", routineExerciseIds)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return groupLatestWeights((data ?? []) as RawWeightRow[]);
}

// Historial del ejercicio del catalogo across todas las semanas/rutinas del usuario
// (se usa para mostrar "anterior" y sugerir la unidad, aunque sea la semana pasada).
export async function getExerciseHistory(exerciseIds: string[]): Promise<LatestWeightsMap> {
  if (exerciseIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("weight_logs")
    .select("id:exercise_id, peso, fecha, serie, unidad, repe, created_at")
    .in("exercise_id", exerciseIds)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return groupLatestWeights((data ?? []) as RawWeightRow[]);
}

export interface ExerciseStats {
  avgPeso: number;
  maxPeso: number;
  maxFecha: string;
  unidad: WeightUnit;
}

// Promedio y maximo historico de este ejercicio puntual para userId (para el modal de
// descripcion, ver exerciseModal.ts). A diferencia de getExerciseHistory/getLatestWeights
// de arriba, filtra por user_id explicitamente en vez de confiar en el alcance de la RLS
// de "select" (que a un entrenador tambien le deja ver las cargas de sus alumnos) -- sin
// ese filtro, el promedio/maximo de un entrenador podria mezclar pesos de sus alumnos.
export async function getExerciseStats(userId: string, exerciseId: string): Promise<ExerciseStats | null> {
  const { data, error } = await supabase.from("weight_logs").select("peso, fecha, unidad").eq("user_id", userId).eq("exercise_id", exerciseId);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  // Los pesos se pueden cargar en distintas unidades (kg/lb/bloques) y no son
  // convertibles entre si -- el promedio/maximo solo tienen sentido calculados sobre una
  // sola. Se usa la mas repetida en el historial (no la del ultimo registro: alguien que
  // cambio de unidad una sola vez recientemente igual quiere ver el numero que refleja la
  // mayoria de sus cargas, no un maximo/promedio de una unica carga aislada).
  const countByUnit = new Map<WeightUnit, number>();
  data.forEach((r) => countByUnit.set(r.unidad, (countByUnit.get(r.unidad) ?? 0) + 1));
  const unidad = [...countByUnit.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const sameUnit = data.filter((r) => r.unidad === unidad);

  // El promedio se calcula sobre el maximo de cada dia (una carga por fecha), no sobre
  // cada serie suelta: promediar todas las series mezcla el peso de calentamiento/series
  // livianas con el peso de trabajo real y da un numero que no representa el progreso.
  const maxByFecha = new Map<string, number>();
  sameUnit.forEach((r) => maxByFecha.set(r.fecha, Math.max(r.peso, maxByFecha.get(r.fecha) ?? -Infinity)));
  const dailyMaxes = [...maxByFecha.values()];
  const avgPeso = dailyMaxes.reduce((sum, p) => sum + p, 0) / dailyMaxes.length;
  const max = sameUnit.reduce((best, r) => (r.peso > best.peso ? r : best));

  return { avgPeso, maxPeso: max.peso, maxFecha: max.fecha, unidad };
}
