import { supabase } from "./supabaseClient";
import type { Tables } from "@/types/database";

export type VerificationRequest = Omit<Tables<"verification_requests">, "credentials"> & { credentials: Credential[] };
export type ApplicantType = "entrenador" | "gimnasio";
export type CredentialType = "terciario" | "curso" | "universitario" | "otro";

export type CredentialSpecialty =
  | "profesor_ed_fisica"
  | "entrenador_personal"
  | "preparador_fisico"
  | "instructor_musculacion"
  | "instructor_yoga"
  | "instructor_pilates"
  | "kinesiologia"
  | "nutricion_deportiva"
  | "guardavidas"
  | "otro";

export type CredentialCompletionStatus = "recibido" | "estudiante";

export interface Credential {
  type: CredentialType;
  institution: string;
  otherTypeText?: string | null;
  specialty: CredentialSpecialty;
  otherSpecialtyText?: string | null;
  completionStatus: CredentialCompletionStatus;
}

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  terciario: "Título terciario",
  curso: "Curso o certificación",
  universitario: "Título universitario",
  otro: "Otro",
};

export const CREDENTIAL_SPECIALTY_LABELS: Record<CredentialSpecialty, string> = {
  profesor_ed_fisica: "Profesor/a de Educación Física",
  entrenador_personal: "Entrenador personal",
  preparador_fisico: "Preparador físico",
  instructor_musculacion: "Instructor de musculación / sala de musculación",
  instructor_yoga: "Instructor de yoga",
  instructor_pilates: "Instructor de pilates",
  kinesiologia: "Kinesiología / fisioterapia",
  nutricion_deportiva: "Nutrición deportiva",
  guardavidas: "Guardavidas",
  otro: "Otro",
};

export const CREDENTIAL_COMPLETION_STATUS_LABELS: Record<CredentialCompletionStatus, string> = {
  recibido: "Recibido/a",
  estudiante: "Estudiante (en curso)",
};

const BUCKET = "verification-documents";

export async function getVerificationDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 5);
  if (error) return null;
  return data.signedUrl;
}

/** Solo staff puede ver esto (RLS de verification_requests): cantidad de solicitudes pendientes de revisión. */
export async function getPendingVerificationRequestCount(): Promise<number> {
  const { count, error } = await supabase.from("verification_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export interface AdminVerificationRequestRow extends VerificationRequest {
  applicantName: string;
  applicantUsername: string;
  applicantEmail: string;
  applicantAvatarUrl: string | null;
}

export async function listVerificationRequestsAdmin(applicantType: ApplicantType): Promise<AdminVerificationRequestRow[]> {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("*, profiles!verification_requests_user_id_fkey ( username, nombre, apellido, email, avatar_url )")
    .eq("applicant_type", applicantType)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const { profiles, ...rest } = row;
    return {
      ...rest,
      applicantName: profiles ? `${profiles.nombre} ${profiles.apellido}` : "Usuario eliminado",
      applicantUsername: profiles?.username ?? "",
      applicantEmail: profiles?.email ?? "",
      applicantAvatarUrl: profiles?.avatar_url ?? null,
    };
  });
}

export async function reviewVerificationRequest(
  id: string,
  status: "approved" | "rejected",
  adminNote: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("verification_requests")
    .update({ status, admin_note: adminNote.trim() || null })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar la solicitud. Probá de nuevo." };
  return {};
}

export function formatCredentialLabel(c: Credential): string {
  const typeLabel = c.type === "otro" ? c.otherTypeText || "Otro" : CREDENTIAL_TYPE_LABELS[c.type];
  const specialtyLabel = c.specialty === "otro" ? c.otherSpecialtyText || "Otro" : CREDENTIAL_SPECIALTY_LABELS[c.specialty];
  const statusLabel = CREDENTIAL_COMPLETION_STATUS_LABELS[c.completionStatus];
  return [specialtyLabel, typeLabel, c.institution, statusLabel].filter(Boolean).join(" · ");
}
