import { supabase } from "./supabaseClient";
import type { Json, Tables } from "@/types/database";

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
export const MAX_VERIFICATION_DOCUMENTS = 5;

const BUCKET = "verification-documents";
const DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;

export async function uploadVerificationDocumentFromUri(userId: string, uri: string, mimeType: string | null | undefined): Promise<{ path?: string; error?: string }> {
  const response = await fetch(uri);
  const blob = await response.blob();
  if (blob.size > DOCUMENT_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 50MB." };

  const type = mimeType ?? blob.type ?? "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
  if (uploadError) return { error: "No se pudo subir la imagen. Probá de nuevo." };

  return { path };
}

export async function getVerificationDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 5);
  if (error) return null;
  return data.signedUrl;
}

export async function getMyVerificationRequest(userId: string): Promise<VerificationRequest | null> {
  const { data, error } = await supabase.from("verification_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as VerificationRequest | null;
}

export async function submitVerificationRequest(userId: string, credentials: Credential[], documents: string[]): Promise<{ error?: string }> {
  const { error } = await supabase.from("verification_requests").insert({
    user_id: userId,
    applicant_type: "entrenador",
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
