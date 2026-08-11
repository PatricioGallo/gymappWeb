import { diaLabel, formatFechaCorta } from "./dias";
import { supabase } from "./supabaseClient";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles">;
export type Routine = Tables<"routines">;
export type ProfileBasic = Tables<"profiles_public">;

export interface ProfileLink {
  label: string;
  url: string;
  platform?: string;
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

/** Fila completa (incluye email): solo la ve el dueño, un admin o un entrenador con
 * rutinas asignadas al usuario, via RLS. Si no hay acceso completo devuelve null. */
export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (error) throw error;
  return data;
}

/** Fallback publico (sin email/settings) para cuando getProfileByUsername no devuelve nada. */
export async function getProfileBasicByUsername(username: string): Promise<ProfileBasic | null> {
  const { data, error } = await supabase.from("profiles_public").select("*").eq("username", username).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfileFields(
  userId: string,
  fields: Partial<
    Pick<
      Profile,
      "nombre" | "apellido" | "fecha_nacimiento" | "nacionalidad" | "is_public" | "bio" | "links" | "notification_prefs" | "zoom_enabled" | "show_last_seen" | "show_read_receipts"
    >
  >
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

export async function getProfileBasicById(userId: string): Promise<ProfileBasic | null> {
  const { data, error } = await supabase.from("profiles_public").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Trae varios perfiles básicos de una vez (ej. quién asignó/copió una rutina), indexados por id. */
export async function getProfilesBasicByIds(ids: (string | null | undefined)[]): Promise<Map<string, ProfileBasic>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles_public").select("*").in("id", uniqueIds);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id!, p]));
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export async function uploadAvatarFromUri(
  userId: string,
  uri: string,
  mimeType: string | null | undefined
): Promise<{ url?: string; error?: string }> {
  const response = await fetch(uri);
  const blob = await response.blob();
  if (blob.size > AVATAR_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 2MB." };

  const type = mimeType ?? blob.type ?? "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: type });
  if (uploadError) return { error: "No se pudo subir la foto. Probá de nuevo." };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  if (updateError) return { error: "La foto se subió pero no se pudo guardar en tu perfil." };

  return { url };
}

// ---------- Rutinas ----------

export interface RoutineWithCounts extends Routine {
  semanasCount: number;
  diasPorSemana: number;
  ejerciciosCount: number;
  totalRoutineExerciseIds: string[];
}

export type RoutineListMode = "active" | "historic" | "saved";

const ROUTINE_SELECT = `id, user_id, assigned_by, copied_from_user_id, nombre, fecha_inicio, finalizada_at, is_public, is_shareable, share_token, is_template, created_at, updated_at,
       routine_weeks ( id, numero, routine_days ( id, dia_semana, routine_exercises ( id ) ) )`;

function toRoutineWithCounts(r: any): RoutineWithCounts {
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
    ejerciciosCount: new Set(firstWeekDays.flatMap((d: any) => (d.routine_exercises ?? []).map((e: any) => e.id))).size,
    totalRoutineExerciseIds: allExerciseIds,
  };
}

export async function listRoutines(userId: string, mode: RoutineListMode): Promise<RoutineWithCounts[]> {
  let query = supabase.from("routines").select(ROUTINE_SELECT).eq("user_id", userId).order("created_at", { ascending: false });

  if (mode === "saved") {
    query = query.eq("is_template", true);
  } else {
    query = query.eq("is_template", false);
    query = mode === "active" ? query.is("finalizada_at", null) : query.not("finalizada_at", "is", null);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(toRoutineWithCounts);
}

export async function finishRoutine(routineId: string): Promise<void> {
  const { error } = await supabase.rpc("set_routine_finished", { p_routine_id: routineId, p_finished: true });
  if (error) throw error;
}

export async function reactivateRoutine(routineId: string): Promise<void> {
  const { error } = await supabase.rpc("set_routine_finished", { p_routine_id: routineId, p_finished: false });
  if (error) throw error;
}

// ---------- Estadísticas (a partir de weight_logs) ----------

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

function parseFechaISO(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function computeWeeklyFrequency(logs: WeightLogEntry[], weeksBack = 8): { label: string; count: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: { start: Date; count: number }[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() - i * 7);
    buckets.push({ start, count: 0 });
  }
  const seenDates = new Set<string>();
  logs.forEach((entry) => {
    const key = entry.fecha;
    const fecha = parseFechaISO(entry.fecha);
    buckets.forEach((bucket) => {
      const end = new Date(bucket.start);
      end.setDate(bucket.start.getDate() + 7);
      if (fecha >= bucket.start && fecha < end && !seenDates.has(`${bucket.start.getTime()}-${key}`)) {
        seenDates.add(`${bucket.start.getTime()}-${key}`);
        bucket.count++;
      }
    });
  });
  return buckets.map((b) => ({ label: `${b.start.getDate()}/${b.start.getMonth() + 1}`, count: b.count }));
}

export function mostFrequentExercise(logs: WeightLogEntry[]): { id: string; name: string } | null {
  const freq = new Map<string, { name: string; count: number }>();
  logs.forEach((l) => {
    const cur = freq.get(l.exerciseId) ?? { name: l.exerciseName, count: 0 };
    cur.count++;
    freq.set(l.exerciseId, cur);
  });
  let bestId: string | null = null;
  let bestName = "";
  let bestCount = 0;
  freq.forEach((v, id) => {
    if (v.count > bestCount) {
      bestCount = v.count;
      bestId = id;
      bestName = v.name;
    }
  });
  return bestId ? { id: bestId, name: bestName } : null;
}

export function trainingDaysCount(logs: WeightLogEntry[]): number {
  return new Set(logs.map((l) => l.fecha)).size;
}

export function lastTrainingLabel(logs: WeightLogEntry[]): string {
  if (logs.length === 0) return "Sin entrenos previos";
  return formatFechaCorta(logs[logs.length - 1].fecha);
}

export function routineProgressPct(routine: RoutineWithCounts, logs: WeightLogEntry[]): number {
  const routineLogs = logs.filter((l) => l.routineId === routine.id);
  const trainedIds = new Set(routineLogs.map((l) => l.routineExerciseId));
  const total = routine.totalRoutineExerciseIds.length;
  return total === 0 ? 0 : Math.round((trainedIds.size / total) * 100);
}

export function routineLastProgressLabel(routine: RoutineWithCounts, logs: WeightLogEntry[]): string {
  const routineLogs = logs.filter((l) => l.routineId === routine.id);
  const last = routineLogs[routineLogs.length - 1];
  if (!last) return "Sin entrenos registrados";
  return `Semana ${last.weekNumero} · ${diaLabel(last.diaSemana ?? 1)}`;
}
