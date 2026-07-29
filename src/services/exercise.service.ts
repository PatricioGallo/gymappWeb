import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type Exercise = Tables<"exercises">;

export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from("exercises").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface NewExerciseValidationError {
  code: "name_short" | "name_long" | "info_short" | "info_long";
}

export function validateNewExercise(name: string, info: string): NewExerciseValidationError["code"] | null {
  if (name.length < 5) return "name_short";
  if (name.length > 60) return "name_long";
  if (info.length < 100) return "info_short";
  if (info.length > 600) return "info_long";
  return null;
}

export async function addExercise(authorId: string, name: string, info: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("exercises").insert({ name, info, author_id: authorId, is_builtin: false });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un ejercicio con ese nombre." };
    return { error: "No se pudo guardar el ejercicio. Probá de nuevo." };
  }
  return {};
}
