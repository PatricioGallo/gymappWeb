import { supabase } from "./supabaseClient";
import type { Json } from "@/types/database";

export async function setRoutinePublic(routineId: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase.from("routines").update({ is_public: isPublic }).eq("id", routineId);
  if (error) throw error;
}

export interface NewDayInput {
  dia_semana: number;
  nombre?: string | null;
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
  dias: NewDayInput[],
  isPublic: boolean,
  isTemplate = false,
  copiedFromUserId?: string | null
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
    p_is_public: isPublic,
    p_is_template: isTemplate,
    p_copied_from_user_id: copiedFromUserId ?? undefined,
  });

  if (error) {
    if (error.message?.includes("not a subscriber")) {
      return { error: "Solo podés asignar rutinas a alumnos que te tengan como entrenador aceptado." };
    }
    return { error: "No se pudo crear la rutina. Probá de nuevo." };
  }
  return { id: data as unknown as string };
}
