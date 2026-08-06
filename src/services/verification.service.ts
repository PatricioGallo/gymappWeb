import { supabase } from "../lib/supabaseClient";
import type { Tables, Json } from "../types/database";

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
  /** Institución (universidad elegida de la lista, o texto libre para terciario/curso/otro). */
  institution: string;
  /** Solo cuando type === "otro": qué tipo de título es. */
  otherTypeText?: string | null;
  /** De qué es el título (profesorado, entrenador personal, etc.). */
  specialty: CredentialSpecialty;
  /** Solo cuando specialty === "otro": de qué es específicamente. */
  otherSpecialtyText?: string | null;
  /** Si ya se recibió o todavía lo está cursando. */
  completionStatus: CredentialCompletionStatus;
}

export const CREDENTIAL_TYPE_OPTIONS: CredentialType[] = ["terciario", "curso", "universitario", "otro"];

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  terciario: "Título terciario",
  curso: "Curso o certificación",
  universitario: "Título universitario",
  otro: "Otro",
};

export const CREDENTIAL_SPECIALTY_OPTIONS: CredentialSpecialty[] = [
  "profesor_ed_fisica",
  "entrenador_personal",
  "preparador_fisico",
  "instructor_musculacion",
  "instructor_yoga",
  "instructor_pilates",
  "kinesiologia",
  "nutricion_deportiva",
  "guardavidas",
  "otro",
];

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

export const CREDENTIAL_COMPLETION_STATUS_OPTIONS: CredentialCompletionStatus[] = ["recibido", "estudiante"];

export const CREDENTIAL_COMPLETION_STATUS_LABELS: Record<CredentialCompletionStatus, string> = {
  recibido: "Recibido/a",
  estudiante: "Estudiante (en curso)",
};

export const MAX_CREDENTIALS = 3;

const BUCKET = "verification-documents";
const DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;
const DOCUMENT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_VERIFICATION_DOCUMENTS = 5;

export async function uploadVerificationDocument(userId: string, file: File): Promise<{ path?: string; error?: string }> {
  if (file.size > DOCUMENT_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 50MB." };
  if (!DOCUMENT_ALLOWED_TYPES.includes(file.type)) return { error: "Formato no soportado. Usá JPG, PNG o WEBP." };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) return { error: "No se pudo subir la imagen. Probá de nuevo." };

  return { path };
}

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

export async function getMyVerificationRequest(userId: string): Promise<VerificationRequest | null> {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as VerificationRequest | null;
}

export async function submitVerificationRequest(userId: string, credentials: Credential[], documents: string[]): Promise<{ error?: string }> {
  const { error } = await supabase.from("verification_requests").insert({
    user_id: userId,
    applicant_type: "entrenador", // sobrescrito por el trigger con el user_type real
    credentials: credentials as unknown as Json,
    documents,
  });
  if (error) return { error: "No se pudo enviar la solicitud de validación. Probá de nuevo." };
  return {};
}

export async function resubmitVerificationRequest(id: string, credentials: Credential[], documents: string[]): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("verification_requests")
    .update({ credentials: credentials as unknown as Json, documents })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar la solicitud de validación. Probá de nuevo." };
  return {};
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
