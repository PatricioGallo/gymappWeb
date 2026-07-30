import { supabase } from "../lib/supabaseClient";

export interface NewWeightLog {
  routine_exercise_id: string;
  exercise_id: string;
  fecha: string;
  peso: number;
  serie: number;
  repe: number;
}

export async function insertWeightLogs(userId: string, entries: NewWeightLog[]): Promise<void> {
  const { error } = await supabase.from("weight_logs").insert(entries.map((e) => ({ user_id: userId, ...e })));
  if (error) throw error;
}

export type LatestWeightsMap = Map<string, Map<number, { peso: number; fecha: string }>>;

export async function getLatestWeights(routineExerciseIds: string[]): Promise<LatestWeightsMap> {
  const map: LatestWeightsMap = new Map();
  if (routineExerciseIds.length === 0) return map;

  const { data, error } = await supabase
    .from("weight_logs")
    .select("routine_exercise_id, peso, fecha, serie")
    .in("routine_exercise_id", routineExerciseIds)
    .order("fecha", { ascending: false });

  if (error) throw error;

  (data ?? []).forEach((row) => {
    const id = row.routine_exercise_id;
    if (!id) return;
    const serieIndex = row.serie ?? 1;
    let bySerie = map.get(id);
    if (!bySerie) {
      bySerie = new Map();
      map.set(id, bySerie);
    }
    if (!bySerie.has(serieIndex)) bySerie.set(serieIndex, { peso: row.peso, fecha: row.fecha });
  });
  return map;
}
