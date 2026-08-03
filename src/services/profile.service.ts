import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type Profile = Tables<"profiles">;
export type Routine = Tables<"routines">;
export type ProfileBasic = Tables<"profiles_public">;

export interface ProfileLink {
  label: string;
  url: string;
}

export const MAX_PROFILE_LINKS = 5;
export const MAX_BIO_LENGTH = 150;

export function parseProfileLinks(raw: Profile["links"]): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter((l): l is ProfileLink => {
    const link = l as Partial<ProfileLink> | null;
    return typeof link === "object" && link !== null && typeof link.label === "string" && typeof link.url === "string";
  });
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProfileBasicByUsername(username: string): Promise<ProfileBasic | null> {
  const { data, error } = await supabase.from("profiles_public").select("*").eq("username", username).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfileFields(
  userId: string,
  fields: Partial<Pick<Profile, "nombre" | "apellido" | "fecha_nacimiento" | "nacionalidad" | "is_public" | "bio" | "links" | "notification_prefs" | "zoom_enabled">>
): Promise<{ error?: string }> {
  const { error } = await supabase.from("profiles").update(fields).eq("id", userId);
  if (error) return { error: "No se pudieron guardar los cambios. Probá de nuevo." };
  return {};
}

export async function updateEmail(email: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) return { error: "No se pudo actualizar el mail." };
  return {};
}

export async function updatePassword(password: string): Promise<{ error?: string }> {
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No se pudo actualizar la contraseña." };
  return {};
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadAvatar(userId: string, file: File): Promise<{ url?: string; error?: string }> {
  if (file.size > AVATAR_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 2MB." };
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) return { error: "Formato no soportado. Usá JPG, PNG o WEBP." };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (uploadError) return { error: "No se pudo subir la foto. Probá de nuevo." };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  if (updateError) return { error: "La foto se subió pero no se pudo guardar en tu perfil." };

  return { url };
}

// ---------- Rutinas (solo lectura + finalizar/reactivar; crear/editar vive en rutins/modExc) ----------

export interface RoutineWithCounts extends Routine {
  semanasCount: number;
  diasPorSemana: number;
  ejerciciosCount: number;
  totalRoutineExerciseIds: string[];
}

export async function listRoutines(userId: string, active: boolean): Promise<RoutineWithCounts[]> {
  let query = supabase
    .from("routines")
    .select(
      `id, user_id, assigned_by, nombre, fecha_inicio, finalizada_at, is_shareable, share_token, created_at, updated_at,
       routine_weeks ( id, numero, routine_days ( id, dia_semana, routine_exercises ( id ) ) )`
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  query = active ? query.is("finalizada_at", null) : query.not("finalizada_at", "is", null);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((r: any) => {
    const weeks = [...(r.routine_weeks ?? [])].sort((a, b) => a.numero - b.numero);
    const firstWeekDays = weeks[0]?.routine_days ?? [];
    const allExerciseIds: string[] = weeks.flatMap((w: any) =>
      (w.routine_days ?? []).flatMap((d: any) => (d.routine_exercises ?? []).map((e: any) => e.id))
    );
    const { routine_weeks, ...routine } = r;
    return {
      ...(routine as Routine),
      semanasCount: weeks.length,
      diasPorSemana: firstWeekDays.length,
      ejerciciosCount: new Set(
        firstWeekDays.flatMap((d: any) => (d.routine_exercises ?? []).map((e: any) => e.id))
      ).size,
      totalRoutineExerciseIds: allExerciseIds,
    };
  });
}

export async function finishRoutine(routineId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("routines").update({ finalizada_at: today }).eq("id", routineId);
  if (error) throw error;
}

export async function reactivateRoutine(routineId: string): Promise<void> {
  const { error } = await supabase.from("routines").update({ finalizada_at: null }).eq("id", routineId);
  if (error) throw error;
}

// ---------- Estadisticas (a partir de weight_logs) ----------

export interface WeightLogEntry {
  fecha: string;
  peso: number;
  serie: number | null;
  repe: number | null;
  exerciseId: string;
  exerciseName: string;
  authorName: string;
  routineExerciseId: string | null;
  routineId: string | null;
  weekNumero: number | null;
  diaSemana: number | null;
}

export async function listWeightLogsWithContext(userId: string): Promise<WeightLogEntry[]> {
  const { data, error } = await supabase
    .from("weight_logs")
    .select(
      `fecha, peso, serie, repe, exercise_id,
       exercises ( name, is_builtin, profiles ( nombre, apellido ) ),
       routine_exercises ( id, routine_days ( dia_semana, routine_weeks ( routine_id, numero ) ) )`
    )
    .eq("user_id", userId)
    .order("fecha", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    fecha: row.fecha,
    peso: row.peso,
    serie: row.serie,
    repe: row.repe,
    exerciseId: row.exercise_id,
    exerciseName: row.exercises?.name ?? "Ejercicio",
    authorName: row.exercises?.is_builtin
      ? "Gym Social"
      : row.exercises?.profiles
        ? `${row.exercises.profiles.nombre} ${row.exercises.profiles.apellido}`
        : "Gym Social",
    routineExerciseId: row.routine_exercises?.id ?? null,
    routineId: row.routine_exercises?.routine_days?.routine_weeks?.routine_id ?? null,
    weekNumero: row.routine_exercises?.routine_days?.routine_weeks?.numero ?? null,
    diaSemana: row.routine_exercises?.routine_days?.dia_semana ?? null,
  }));
}
