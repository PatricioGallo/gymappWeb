import { supabase } from "./supabaseClient";

export async function setRoutinePublic(routineId: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase.from("routines").update({ is_public: isPublic }).eq("id", routineId);
  if (error) throw error;
}
