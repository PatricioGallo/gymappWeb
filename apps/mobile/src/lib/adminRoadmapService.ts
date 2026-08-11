import { supabase } from "./supabaseClient";
import type { Tables } from "@/types/database";

export type RoadmapTask = Tables<"roadmap_tasks">;

export type RoadmapCategory = "usuario" | "usuario_avanzado" | "entrenador" | "gimnasio" | "red_social";
export type RoadmapStatus = "pending" | "in_progress" | "done";

export const ROADMAP_CATEGORIES: RoadmapCategory[] = ["usuario", "usuario_avanzado", "entrenador", "gimnasio", "red_social"];

export const ROADMAP_CATEGORY_LABELS: Record<RoadmapCategory, string> = {
  usuario: "Modo usuario",
  usuario_avanzado: "Modo usuario avanzado",
  entrenador: "Modo entrenador",
  gimnasio: "Modo gimnasio",
  red_social: "Modo red social",
};

export const ROADMAP_STATUS_OPTIONS: RoadmapStatus[] = ["pending", "in_progress", "done"];

export const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  done: "Hecho",
};

export async function listRoadmapTasks(): Promise<RoadmapTask[]> {
  const { data, error } = await supabase
    .from("roadmap_tasks")
    .select("*")
    .order("category", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function validateRoadmapTask(title: string): "title_short" | "title_long" | null {
  if (title.trim().length < 2) return "title_short";
  if (title.trim().length > 200) return "title_long";
  return null;
}

export async function addRoadmapTask(
  authorId: string,
  category: RoadmapCategory,
  title: string,
  description: string,
  status: RoadmapStatus
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("roadmap_tasks")
    .insert({ category, title: title.trim(), description: description.trim() || null, status, created_by: authorId });
  if (error) return { error: "No se pudo guardar la tarea. Probá de nuevo." };
  return {};
}

export interface EditableRoadmapTaskFields {
  category?: RoadmapCategory;
  title?: string;
  description?: string | null;
  status?: RoadmapStatus;
}

export async function updateRoadmapTask(id: string, fields: EditableRoadmapTaskFields): Promise<{ error?: string }> {
  const { error } = await supabase.from("roadmap_tasks").update(fields).eq("id", id);
  if (error) return { error: "No se pudo guardar la tarea. Probá de nuevo." };
  return {};
}

export async function deleteRoadmapTask(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("roadmap_tasks").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar la tarea. Probá de nuevo." };
  return {};
}
