import { supabase } from "./supabaseClient";
import type { Enums, Tables } from "@/types/database";

export type Exercise = Tables<"exercises">;
export type ExerciseCategory = Enums<"exercise_category">;

export const EXERCISE_CATEGORIES: ExerciseCategory[] = ["hombros", "pectorales", "espalda", "brazos", "abdominales", "piernas", "estiramiento"];

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

export type NewExerciseValidationError = "name_short" | "name_long" | "info_short" | "info_long" | "category_missing";

export function validateNewExercise(name: string, info: string, category: string): NewExerciseValidationError | null {
  if (name.length < 5) return "name_short";
  if (name.length > 60) return "name_long";
  if (info.length < 100) return "info_short";
  if (info.length > 600) return "info_long";
  if (!EXERCISE_CATEGORIES.includes(category as ExerciseCategory)) return "category_missing";
  return null;
}

const EXERCISE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export async function uploadExerciseImageFromUri(
  authorId: string,
  uri: string,
  mimeType: string | null | undefined
): Promise<{ url?: string; error?: string }> {
  const response = await fetch(uri);
  const blob = await response.blob();
  if (blob.size > EXERCISE_IMAGE_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 2MB." };

  const type = mimeType ?? blob.type ?? "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${authorId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("exercise-images").upload(path, blob, { contentType: type });
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
  imageUrl?: string
): Promise<{ exercise?: Exercise; error?: string }> {
  const { data, error } = await supabase
    .from("exercises")
    .insert({ name, info, category, image_url: imageUrl || null, author_id: authorId, is_builtin: false, is_public: isPublic })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un ejercicio con ese nombre." };
    return { error: "No se pudo guardar el ejercicio. Probá de nuevo." };
  }
  return { exercise: data };
}
