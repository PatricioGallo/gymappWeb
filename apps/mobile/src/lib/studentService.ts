import { supabase } from "./supabaseClient";

export async function getLastTrainedDate(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("weight_logs").select("fecha").eq("user_id", userId).order("fecha", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.fecha ?? null;
}

/** % de ejercicios de una rutina con al menos una carga registrada -- version liviana
 * (sin traer todo listWeightLogsWithContext) para el listado "Tus alumnos". */
export async function getRoutineProgressPct(userId: string, routineExerciseIds: string[]): Promise<number> {
  if (routineExerciseIds.length === 0) return 0;
  const { data, error } = await supabase.from("weight_logs").select("routine_exercise_id").eq("user_id", userId).in("routine_exercise_id", routineExerciseIds);
  if (error) throw error;
  const trainedIds = new Set((data ?? []).map((r) => r.routine_exercise_id));
  return Math.round((trainedIds.size / routineExerciseIds.length) * 100);
}

/** Cantidad total de rutinas (activas + historicas) que un entrenador le asigno a un alumno puntual. */
export async function countAssignedRoutines(trainerId: string, studentId: string): Promise<number> {
  const { count, error } = await supabase.from("routines").select("id", { count: "exact", head: true }).eq("user_id", studentId).eq("assigned_by", trainerId);
  if (error) throw error;
  return count ?? 0;
}

export interface RecentCommentRow {
  id: string;
  exerciseNombre: string;
  fecha: string;
  comment: string;
}

export async function listRecentComments(userId: string, limit = 10): Promise<RecentCommentRow[]> {
  const { data, error } = await supabase
    .from("exercise_comments")
    .select("id, fecha, comment, routine_exercises ( nombre_snapshot )")
    .eq("user_id", userId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    exerciseNombre: (row.routine_exercises as { nombre_snapshot: string } | null)?.nombre_snapshot ?? "Ejercicio",
    fecha: row.fecha,
    comment: row.comment,
  }));
}
