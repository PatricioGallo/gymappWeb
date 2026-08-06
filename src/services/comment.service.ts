import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type ExerciseComment = Tables<"exercise_comments">;

export const MAX_COMMENT_LENGTH = 300;

/** Comentarios de hoy para un set de ejercicios de una rutina, indexados por routine_exercise_id. */
export async function getTodayComments(routineExerciseIds: string[], fecha: string): Promise<Map<string, ExerciseComment>> {
  if (routineExerciseIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("exercise_comments")
    .select("*")
    .in("routine_exercise_id", routineExerciseIds)
    .eq("fecha", fecha);
  if (error) throw error;
  return new Map((data ?? []).map((c) => [c.routine_exercise_id, c]));
}

/** Un comentario por alumno+ejercicio+fecha: crea o reemplaza el de hoy. */
export async function upsertExerciseComment(userId: string, routineExerciseId: string, fecha: string, comment: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("exercise_comments")
    .upsert({ user_id: userId, routine_exercise_id: routineExerciseId, fecha, comment }, { onConflict: "user_id,routine_exercise_id,fecha" });
  if (error) return { error: "No se pudo guardar el comentario. Probá de nuevo." };
  return {};
}

export async function deleteExerciseComment(commentId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("exercise_comments").delete().eq("id", commentId);
  if (error) return { error: "No se pudo borrar el comentario. Probá de nuevo." };
  return {};
}

export interface RecentCommentRow {
  id: string;
  exerciseNombre: string;
  fecha: string;
  comment: string;
}

/** Comentarios mas recientes de un alumno, para que el entrenador los vea agrupados en su ficha. */
export async function listRecentComments(userId: string, limit = 10): Promise<RecentCommentRow[]> {
  const { data, error } = await supabase
    .from("exercise_comments")
    .select("id, fecha, comment, routine_exercises ( nombre_snapshot )")
    .eq("user_id", userId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    exerciseNombre: row.routine_exercises?.nombre_snapshot ?? "Ejercicio",
    fecha: row.fecha,
    comment: row.comment,
  }));
}
