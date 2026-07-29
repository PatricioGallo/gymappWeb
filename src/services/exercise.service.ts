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

export interface NewExerciseValidationError {
  code: "name_short" | "name_long" | "info_short" | "info_long" | "category_missing" | "image_url_invalid";
}

export function validateNewExercise(
  name: string,
  info: string,
  category: string,
  imageUrl: string
): NewExerciseValidationError["code"] | null {
  if (name.length < 5) return "name_short";
  if (name.length > 60) return "name_long";
  if (info.length < 100) return "info_short";
  if (info.length > 600) return "info_long";
  if (!EXERCISE_CATEGORIES.includes(category as ExerciseCategory)) return "category_missing";
  if (imageUrl && !/^https?:\/\/.+/i.test(imageUrl)) return "image_url_invalid";
  return null;
}

export async function addExercise(
  authorId: string,
  name: string,
  info: string,
  category: ExerciseCategory,
  imageUrl?: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("exercises")
    .insert({ name, info, category, image_url: imageUrl || null, author_id: authorId, is_builtin: false });
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un ejercicio con ese nombre." };
    return { error: "No se pudo guardar el ejercicio. Probá de nuevo." };
  }
  return {};
}
