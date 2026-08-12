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

export async function insertWeightLogs(userId: string, entries: NewWeightLog[]): Promise<void> {
  const { error } = await supabase.from("weight_logs").insert(entries.map((e) => ({ user_id: userId, ...e })));
  if (error) throw error;
}

// Dias marcados "terminado" a mano (ver ruedita en pesos.ts), independiente de si
// se cargo o no el 100% de los pesos: la sesion puede haberse dado por terminada igual.
export async function getCompletedDayIds(userId: string, routineDayIds: string[]): Promise<Set<string>> {
  if (routineDayIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("routine_day_completions")
    .select("routine_day_id")
    .eq("user_id", userId)
    .in("routine_day_id", routineDayIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.routine_day_id));
}

export async function markDayComplete(userId: string, routineDayId: string): Promise<void> {
  const { error } = await supabase.from("routine_day_completions").upsert({ user_id: userId, routine_day_id: routineDayId }, { onConflict: "routine_day_id,user_id" });
  if (error) throw error;
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
    entries.push({ peso: row.peso, fecha: row.fecha, unidad, repe: row.repe });
  });
  return map;
}

// Historial acotado a la ocurrencia puntual de este ejercicio en esta semana/dia
// (se usa para saber si "ya cargue esto hoy" y prellenar mientras se continua la sesion).
export async function getLatestWeights(routineExerciseIds: string[]): Promise<LatestWeightsMap> {
  if (routineExerciseIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("weight_logs")
    .select("id:routine_exercise_id, peso, fecha, serie, unidad, repe")
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
    .select("id:exercise_id, peso, fecha, serie, unidad, repe")
    .in("exercise_id", exerciseIds)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return groupLatestWeights((data ?? []) as RawWeightRow[]);
}
