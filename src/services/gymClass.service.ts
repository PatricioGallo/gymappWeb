import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type GymClass = Tables<"gym_classes">;

export interface ClassSession {
  dayOfWeek: number; // 0=domingo .. 6=sabado
  startTime: string; // "HH:MM" o "HH:MM:SS"
  endTime: string;
}

export interface GymClassRow {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  allowEnrollment: boolean;
  capacity: number | null;
  instructorId: string | null;
  instructorUsername: string | null;
  instructorNombre: string | null;
  instructorApellido: string | null;
  instructorAvatarUrl: string | null;
  enrolledCount: number;
  isEnrolled: boolean;
  sessions: ClassSession[];
}

export interface ClassFormInput {
  name: string;
  description?: string;
  imageUrl?: string | null;
  instructorId?: string | null;
  allowEnrollment: boolean;
  capacity?: number | null;
  sessions: ClassSession[];
}

/** null = sin limite. <60% ocupado = vacio, 60-99% = medio, >=100% = lleno (bloquea inscripcion). */
export type ClassCapacityStatus = "unlimited" | "vacio" | "medio" | "lleno";
export function getClassCapacityStatus(enrolledCount: number, capacity: number | null): ClassCapacityStatus {
  if (capacity == null) return "unlimited";
  if (enrolledCount >= capacity) return "lleno";
  return enrolledCount / capacity >= 0.6 ? "medio" : "vacio";
}

const CLASS_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const CLASS_IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadClassImage(gymId: string, file: File): Promise<{ url?: string; error?: string }> {
  if (file.size > CLASS_IMAGE_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 2MB." };
  if (!CLASS_IMAGE_ALLOWED_TYPES.includes(file.type)) return { error: "Formato no soportado. Usá JPG, PNG o WEBP." };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${gymId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("class-images").upload(path, file);
  if (uploadError) return { error: "No se pudo subir la imagen. Probá de nuevo." };

  const { data } = supabase.storage.from("class-images").getPublicUrl(path);
  return { url: data.publicUrl };
}

function parseSessions(json: unknown): ClassSession[] {
  if (!Array.isArray(json)) return [];
  return json.map((s) => ({
    dayOfWeek: (s as { day_of_week: number }).day_of_week,
    startTime: (s as { start_time: string }).start_time,
    endTime: (s as { end_time: string }).end_time,
  }));
}

export async function listGymClasses(gymId: string): Promise<GymClassRow[]> {
  const { data, error } = await supabase.rpc("list_gym_classes", { p_gym_id: gymId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    imageUrl: r.image_url,
    allowEnrollment: r.allow_enrollment,
    capacity: r.capacity,
    instructorId: r.instructor_id,
    instructorUsername: r.instructor_username,
    instructorNombre: r.instructor_nombre,
    instructorApellido: r.instructor_apellido,
    instructorAvatarUrl: r.instructor_avatar_url,
    enrolledCount: r.enrolled_count,
    isEnrolled: r.is_enrolled,
    sessions: parseSessions(r.sessions),
  }));
}

async function replaceSessions(classId: string, sessions: ClassSession[]): Promise<{ error?: string }> {
  const { error: deleteError } = await supabase.from("gym_class_sessions").delete().eq("class_id", classId);
  if (deleteError) return { error: "No se pudieron guardar los horarios. Probá de nuevo." };
  if (sessions.length === 0) return {};

  const { error: insertError } = await supabase.from("gym_class_sessions").insert(
    sessions.map((s) => ({ class_id: classId, day_of_week: s.dayOfWeek, start_time: s.startTime, end_time: s.endTime }))
  );
  if (insertError) return { error: "No se pudieron guardar los horarios. Probá de nuevo." };
  return {};
}

export async function createGymClass(gymId: string, input: ClassFormInput): Promise<{ error?: string }> {
  const { data, error } = await supabase
    .from("gym_classes")
    .insert({
      gym_id: gymId,
      name: input.name,
      description: input.description || null,
      image_url: input.imageUrl || null,
      instructor_id: input.instructorId || null,
      allow_enrollment: input.allowEnrollment,
      capacity: input.capacity ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.message?.includes("instructor is not an active handle")) return { error: "El profesor elegido no es un handle activo de tu gimnasio." };
    return { error: "No se pudo crear la clase. Probá de nuevo." };
  }
  return replaceSessions(data.id, input.sessions);
}

export async function updateGymClass(classId: string, input: ClassFormInput): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("gym_classes")
    .update({
      name: input.name,
      description: input.description || null,
      image_url: input.imageUrl || null,
      instructor_id: input.instructorId || null,
      allow_enrollment: input.allowEnrollment,
      capacity: input.capacity ?? null,
    })
    .eq("id", classId);
  if (error) {
    if (error.message?.includes("instructor is not an active handle")) return { error: "El profesor elegido no es un handle activo de tu gimnasio." };
    return { error: "No se pudo guardar la clase. Probá de nuevo." };
  }
  return replaceSessions(classId, input.sessions);
}

export async function deleteGymClass(classId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("gym_classes").delete().eq("id", classId);
  if (error) return { error: "No se pudo eliminar la clase. Probá de nuevo." };
  return {};
}

export async function enrollInClass(classId: string, memberId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("gym_class_enrollments").insert({ class_id: classId, member_id: memberId });
  if (error) {
    if (error.message?.includes("not an active member")) return { error: "Tenés que ser socio de este gimnasio para inscribirte." };
    if (error.message?.includes("enrollment not allowed")) return { error: "Esta clase no tiene inscripción habilitada." };
    if (error.message?.includes("class is full")) return { error: "Esta clase ya está completa." };
    if (error.code === "23505") return { error: "Ya estás inscripto en esta clase." };
    return { error: "No se pudo completar la inscripción. Probá de nuevo." };
  }
  return {};
}

export async function unenrollFromClass(classId: string, memberId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("gym_class_enrollments").delete().eq("class_id", classId).eq("member_id", memberId);
  if (error) return { error: "No se pudo cancelar la inscripción. Probá de nuevo." };
  return {};
}
