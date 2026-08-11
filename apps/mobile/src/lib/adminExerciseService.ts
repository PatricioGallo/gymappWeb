import { supabase } from "./supabaseClient";
import type { Exercise, ExerciseCategory } from "./exerciseService";

export interface AdminExerciseRow extends Exercise {
  authorName: string | null;
}

export async function listExercisesAdmin(): Promise<AdminExerciseRow[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select("*, profiles ( username, nombre, apellido )")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const { profiles, ...exc } = row;
    return { ...exc, authorName: profiles ? `${profiles.nombre} ${profiles.apellido} (@${profiles.username})` : null };
  });
}

export async function addBuiltinExercise(name: string, info: string, category: ExerciseCategory, imageUrl?: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("exercises")
    .insert({ name, info, category, image_url: imageUrl || null, author_id: null, is_builtin: true, is_public: false });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un ejercicio con ese nombre." };
    return { error: "No se pudo guardar el ejercicio. Probá de nuevo." };
  }
  return {};
}

export interface EditableExerciseFields {
  name?: string;
  info?: string;
  category?: ExerciseCategory;
  image_url?: string | null;
  is_public?: boolean;
}

export async function updateExercise(id: string, fields: EditableExerciseFields): Promise<{ error?: string }> {
  const { error } = await supabase.from("exercises").update(fields).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un ejercicio con ese nombre." };
    return { error: "No se pudo guardar el ejercicio. Probá de nuevo." };
  }
  return {};
}

export async function deleteExercise(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("exercises").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { error: "No se puede eliminar: hay rutinas que usan este ejercicio." };
    return { error: "No se pudo eliminar el ejercicio. Probá de nuevo." };
  }
  return {};
}
