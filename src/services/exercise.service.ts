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
  "cuerpo_completo",
];

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  hombros: "Hombros",
  pectorales: "Pectorales",
  espalda: "Espalda",
  brazos: "Brazos",
  abdominales: "Abdominales",
  piernas: "Piernas",
  estiramiento: "Estiramiento",
  cuerpo_completo: "Cuerpo completo",
};

export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from("exercises").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listBuiltinExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from("exercises").select("*").eq("is_builtin", true).order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface ExerciseWithAuthor extends Exercise {
  authorName: string | null;
}

/** Ejercicios publicos de autores puntuales (seguidos/entrenadores/gimnasio) -- ver openExercisePicker. */
export async function listExercisesByAuthorIds(authorIds: string[]): Promise<ExerciseWithAuthor[]> {
  if (authorIds.length === 0) return [];
  const { data, error } = await supabase
    .from("exercises")
    .select("*, profiles ( username )")
    .in("author_id", authorIds)
    .eq("is_public", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const { profiles, ...exc } = row;
    return { ...exc, authorName: profiles ? `@${profiles.username}` : null };
  });
}

/** Cualquier ejercicio publico creado por un usuario (no builtin), de cualquier autor. */
export async function listGlobalPublicExercises(): Promise<ExerciseWithAuthor[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select("*, profiles ( username )")
    .eq("is_builtin", false)
    .eq("is_public", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const { profiles, ...exc } = row;
    return { ...exc, authorName: profiles ? `@${profiles.username}` : null };
  });
}

export async function hasMyExercises(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("exercises").select("id").eq("author_id", userId).limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function listMyExercises(userId: string): Promise<Exercise[]> {
  const { data, error } = await supabase.from("exercises").select("*").eq("author_id", userId).order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Para cada ejercicio propio, cuantas personas distintas lo tienen hoy en una rutina activa. */
export async function getMyExercisesUsageCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("get_my_exercises_usage_counts");
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of data ?? []) map[row.exercise_id] = row.users_count;
  return map;
}

export interface ExerciseUser {
  user_id: string;
  username: string;
  nombre: string;
  apellido: string;
  avatar_url: string | null;
}

/** Quienes tienen este ejercicio (propio) en una rutina activa ahora mismo. */
export async function listExerciseUsers(exerciseId: string): Promise<ExerciseUser[]> {
  const { data, error } = await supabase.rpc("list_exercise_users", { p_exercise_id: exerciseId });
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

const EXERCISE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const EXERCISE_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const EXERCISE_VIDEO_MAX_SECONDS = 120;
const EXERCISE_IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EXERCISE_VIDEO_ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const EXERCISE_FILE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** Lee la duración de un video sin subirlo, cargando sus metadatos en un <video> off-DOM. */
function getVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer el video"));
    };
    video.src = url;
  });
}

export async function uploadExerciseImage(authorId: string, file: File): Promise<{ url?: string; error?: string }> {
  const isVideo = EXERCISE_VIDEO_ALLOWED_TYPES.includes(file.type);
  if (!isVideo && !EXERCISE_IMAGE_ALLOWED_TYPES.includes(file.type)) {
    return { error: "Formato no soportado. Usá JPG, PNG, WEBP, GIF o un video MP4/WEBM/MOV." };
  }
  const maxBytes = isVideo ? EXERCISE_VIDEO_MAX_BYTES : EXERCISE_IMAGE_MAX_BYTES;
  if (file.size > maxBytes) {
    return { error: isVideo ? "El video es muy pesado. Elegí uno de menos de 20MB." : "La imagen es muy pesada. Elegí una de menos de 20MB." };
  }
  if (isVideo) {
    const duration = await getVideoDurationSeconds(file).catch(() => null);
    if (duration !== null && duration > EXERCISE_VIDEO_MAX_SECONDS) {
      return { error: "El video es muy largo. Elegí uno de hasta 2 minutos." };
    }
  }

  const ext = EXERCISE_FILE_EXTENSIONS[file.type];
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
  mediaUrls: string[] = []
): Promise<{ error?: string }> {
  const { error } = await supabase.from("exercises").insert({
    name,
    info,
    category,
    media_urls: mediaUrls,
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

export async function addBuiltinExercise(name: string, info: string, category: ExerciseCategory, mediaUrls: string[] = []): Promise<{ error?: string }> {
  const { error } = await supabase.from("exercises").insert({
    name,
    info,
    category,
    media_urls: mediaUrls,
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
  media_urls?: string[];
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
