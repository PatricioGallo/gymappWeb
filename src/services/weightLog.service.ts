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

export interface LatestWeightEntry {
  peso: number;
  fecha: string;
  unidad: WeightUnit;
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
    entries.push({ peso: row.peso, fecha: row.fecha, unidad });
  });
  return map;
}

// Historial acotado a la ocurrencia puntual de este ejercicio en esta semana/dia
// (se usa para saber si "ya cargue esto hoy" y prellenar mientras se continua la sesion).
export async function getLatestWeights(routineExerciseIds: string[]): Promise<LatestWeightsMap> {
  if (routineExerciseIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("weight_logs")
    .select("id:routine_exercise_id, peso, fecha, serie, unidad")
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
    .select("id:exercise_id, peso, fecha, serie, unidad")
    .in("exercise_id", exerciseIds)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return groupLatestWeights((data ?? []) as RawWeightRow[]);
}
