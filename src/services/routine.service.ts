import { supabase } from "../lib/supabaseClient";
import type { Tables, Json } from "../types/database";

export type Routine = Tables<"routines">;
export type RoutineExercise = Tables<"routine_exercises">;

export interface NewDayInput {
  dia_semana: number;
  ejercicios: {
    exercise_id: string;
    nombre_snapshot: string;
    info_snapshot: string;
    serie: number;
    repe: number;
    repe_max?: number | null;
    nota: string;
    es_medible: boolean;
    mismo_peso: boolean;
    orden: number;
  }[];
}

export async function createRoutine(
  userId: string,
  nombre: string,
  semanas: number,
  dias: NewDayInput[]
): Promise<{ id?: string; error?: string }> {
  const weeksPayload = Array.from({ length: semanas }, (_, i) => ({
    numero: i + 1,
    dias,
  }));

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc("create_routine", {
    p_user_id: userId,
    p_nombre: nombre,
    p_fecha_inicio: today,
    p_weeks: weeksPayload as unknown as Json,
  });

  if (error) return { error: "No se pudo crear la rutina. Probá de nuevo." };
  return { id: data as unknown as string };
}

export interface RoutineExerciseWithAuthor extends RoutineExercise {
  authorName: string;
  category: string | null;
  image_url: string | null;
}

export interface RoutineDetailDay {
  id: string;
  dia_semana: number;
  ejercicios: RoutineExerciseWithAuthor[];
}
export interface RoutineDetailWeek {
  id: string;
  numero: number;
  dias: RoutineDetailDay[];
}
export interface RoutineDetail extends Routine {
  semanas: RoutineDetailWeek[];
}

export async function getRoutineDetail(routineId: string): Promise<RoutineDetail | null> {
  const { data, error } = await supabase
    .from("routines")
    .select(
      `id, user_id, assigned_by, nombre, fecha_inicio, finalizada_at, is_shareable, share_token, created_at, updated_at,
       routine_weeks ( id, numero, routine_days ( id, dia_semana, routine_exercises ( *, exercises ( is_builtin, category, image_url, profiles ( nombre, apellido ) ) ) ) )`
    )
    .eq("id", routineId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { routine_weeks, ...routine } = data as any;
  const semanas: RoutineDetailWeek[] = [...(routine_weeks ?? [])]
    .sort((a: any, b: any) => a.numero - b.numero)
    .map((w: any) => ({
      id: w.id,
      numero: w.numero,
      dias: [...(w.routine_days ?? [])]
        .sort((a: any, b: any) => a.dia_semana - b.dia_semana)
        .map((d: any) => ({
          id: d.id,
          dia_semana: d.dia_semana,
          ejercicios: [...(d.routine_exercises ?? [])]
            .sort((a: any, b: any) => a.orden - b.orden)
            .map((e: any) => {
              const { exercises, ...rest } = e;
              const author = exercises?.is_builtin
                ? "Gym Social"
                : exercises?.profiles
                  ? `${exercises.profiles.nombre} ${exercises.profiles.apellido}`
                  : "Gym Social";
              return {
                ...rest,
                authorName: author,
                category: exercises?.category ?? null,
                image_url: exercises?.image_url ?? null,
              };
            }),
        })),
    }));

  return { ...(routine as Routine), semanas };
}

export async function getSharedRoutine(shareToken: string): Promise<any> {
  const { data, error } = await supabase.rpc("get_shared_routine", { p_token: shareToken });
  if (error) throw error;
  return data;
}

export async function setRoutineShareable(routineId: string, shareable: boolean): Promise<string | null> {
  const { data, error } = await supabase
    .from("routines")
    .update({ is_shareable: shareable })
    .eq("id", routineId)
    .select("share_token")
    .single();
  if (error) throw error;
  return data.share_token;
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const { error } = await supabase.from("routines").delete().eq("id", routineId);
  if (error) throw error;
}

export async function updateRoutineExercise(
  id: string,
  fields: Partial<
    Pick<
      RoutineExercise,
      "serie" | "repe" | "repe_max" | "nota" | "es_medible" | "mismo_peso" | "orden" | "exercise_id" | "nombre_snapshot" | "info_snapshot"
    >
  >
): Promise<void> {
  const { error } = await supabase.from("routine_exercises").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteRoutineExercise(id: string): Promise<void> {
  const { error } = await supabase.from("routine_exercises").delete().eq("id", id);
  if (error) throw error;
}

export async function addRoutineExercise(
  dayId: string,
  input: NewDayInput["ejercicios"][number]
): Promise<void> {
  const { error } = await supabase.from("routine_exercises").insert({ day_id: dayId, ...input });
  if (error) throw error;
}
