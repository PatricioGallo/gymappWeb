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

export async function getLatestWeights(routineExerciseIds: string[]): Promise<Map<string, { peso: number; fecha: string }>> {
  const map = new Map<string, { peso: number; fecha: string }>();
  if (routineExerciseIds.length === 0) return map;

  const { data, error } = await supabase
    .from("weight_logs")
    .select("routine_exercise_id, peso, fecha")
    .in("routine_exercise_id", routineExerciseIds)
    .order("fecha", { ascending: false });

  if (error) throw error;

  (data ?? []).forEach((row) => {
    const id = row.routine_exercise_id;
    if (id && !map.has(id)) map.set(id, { peso: row.peso, fecha: row.fecha });
  });
  return map;
}
