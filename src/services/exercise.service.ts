import { supabase } from "../lib/supabaseClient";
import type { Enums, Tables } from "../types/database";

export type Exercise = Tables<"exercises">;
export type ExerciseCategory = Enums<"exercise_category">;

export const EXERCISE_CATEGORIES: ExerciseCategory[] = [
  "hombros",
  "pectorales",
  "espalda",
  "brazos",
  "abdominales",
  "piernas",
  "estiramiento",
];

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  hombros: "Hombros",
  pectorales: "Pectorales",
  espalda: "Espalda",
  brazos: "Brazos",
  abdominales: "Abdominales",
  piernas: "Piernas",
  estiramiento: "Estiramiento",
};

export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from("exercises").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

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

export interface NewExerciseValidationError {
  code: "name_short" | "name_long" | "info_short" | "info_long" | "category_missing";
}

export function validateNewExercise(name: string, info: string, category: string): NewExerciseValidationError["code"] | null {
  if (name.length < 5) return "name_short";
  if (name.length > 60) return "name_long";
  if (info.length < 100) return "info_short";
  if (info.length > 600) return "info_long";
  if (!EXERCISE_CATEGORIES.includes(category as ExerciseCategory)) return "category_missing";
  return null;
}

const EXERCISE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const EXERCISE_IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadExerciseImage(authorId: string, file: File): Promise<{ url?: string; error?: string }> {
  if (file.size > EXERCISE_IMAGE_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 2MB." };
  if (!EXERCISE_IMAGE_ALLOWED_TYPES.includes(file.type)) return { error: "Formato no soportado. Usá JPG, PNG o WEBP." };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${authorId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("exercise-images").upload(path, file);
  if (uploadError) return { error: "No se pudo subir la imagen. Probá de nuevo." };

  const { data } = supabase.storage.from("exercise-images").getPublicUrl(path);
  return { url: data.publicUrl };
}

export async function addExercise(
  authorId: string,
  name: string,
  info: string,
  category: ExerciseCategory,
  isPublic: boolean,
  imageStartUrl?: string,
  imageExecutionUrl?: string
): Promise<{ error?: string }> {
  const { error } = await supabase.from("exercises").insert({
    name,
    info,
    category,
    image_start_url: imageStartUrl || null,
    image_execution_url: imageExecutionUrl || null,
    author_id: authorId,
    is_builtin: false,
    is_public: isPublic,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un ejercicio con ese nombre." };
    return { error: "No se pudo guardar el ejercicio. Probá de nuevo." };
  }
  return {};
}

export async function addBuiltinExercise(
  name: string,
  info: string,
  category: ExerciseCategory,
  imageStartUrl?: string,
  imageExecutionUrl?: string
): Promise<{ error?: string }> {
  const { error } = await supabase.from("exercises").insert({
    name,
    info,
    category,
    image_start_url: imageStartUrl || null,
    image_execution_url: imageExecutionUrl || null,
    author_id: null,
    is_builtin: true,
    is_public: false,
  });
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
  image_start_url?: string | null;
  image_execution_url?: string | null;
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
