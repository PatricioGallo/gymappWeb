import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type VerificationRequest = Tables<"verification_requests">;
export type ApplicantType = "entrenador" | "gimnasio";
export type CredentialType = "terciario" | "curso" | "universitario" | "otro";

export const CREDENTIAL_TYPE_OPTIONS: CredentialType[] = ["terciario", "curso", "universitario", "otro"];

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  terciario: "Título terciario",
  curso: "Curso o certificación",
  universitario: "Título universitario",
  otro: "Otro",
};

const BUCKET = "verification-documents";
const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const DOCUMENT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_VERIFICATION_DOCUMENTS = 3;

export async function uploadVerificationDocument(userId: string, file: File): Promise<{ path?: string; error?: string }> {
  if (file.size > DOCUMENT_MAX_BYTES) return { error: "La imagen es muy pesada. Elegí una de menos de 5MB." };
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

export async function getMyVerificationRequest(userId: string): Promise<VerificationRequest | null> {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function submitVerificationRequest(
  userId: string,
  credentialType: CredentialType | null,
  documents: string[]
): Promise<{ error?: string }> {
  const { error } = await supabase.from("verification_requests").insert({
    user_id: userId,
    applicant_type: "entrenador", // sobrescrito por el trigger con el user_type real
    credential_type: credentialType,
    documents,
  });
  if (error) return { error: "No se pudo enviar la solicitud de validación. Probá de nuevo." };
  return {};
}

export async function resubmitVerificationRequest(
  id: string,
  credentialType: CredentialType | null,
  documents: string[]
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("verification_requests")
    .update({ credential_type: credentialType, documents })
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
