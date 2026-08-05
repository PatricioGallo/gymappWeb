import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type ErrorReport = Tables<"error_reports">;

export interface ErrorReportWithReporter extends ErrorReport {
  reporterName: string | null;
  readByName: string | null;
}

export type ErrorReportError = "subject_short" | "subject_long" | "message_long";

export function validateErrorReport(subject: string, message: string): ErrorReportError | null {
  if (subject.trim().length < 2) return "subject_short";
  if (subject.trim().length > 200) return "subject_long";
  if (message.trim().length > 2000) return "message_long";
  return null;
}

export async function submitErrorReport(userId: string, subject: string, message: string, page: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("error_reports").insert({
    subject: subject.trim(),
    message: message.trim() || null,
    page: page || null,
    created_by: userId,
  });
  if (error) return { error: "No se pudo enviar el reporte. Probá de nuevo." };
  return {};
}

export async function getUnreadErrorReportCount(): Promise<number> {
  const { count, error } = await supabase.from("error_reports").select("id", { count: "exact", head: true }).eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}

// Consulta separada a profiles_public en vez de un embed de PostgREST: mismo motivo
// que en issue.service (la vista bypassea RLS a proposito y el embed automatico falla).
export async function listErrorReports(): Promise<ErrorReportWithReporter[]> {
  const { data: rows, error } = await supabase
    .from("error_reports")
    .select("*")
    .order("is_read", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const ids = [...new Set(rows.flatMap((r) => [r.created_by, r.read_by]).filter((id): id is string => id !== null))];
  const { data: profiles, error: profilesError } = await supabase.from("profiles_public").select("id, username").in("id", ids);
  if (profilesError) throw profilesError;

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  return rows.map((r) => ({
    ...r,
    reporterName: usernameById.get(r.created_by) ?? null,
    readByName: r.read_by ? (usernameById.get(r.read_by) ?? null) : null,
  }));
}

export async function markErrorReportRead(id: string, isRead: boolean, markedBy: string | null): Promise<{ error?: string }> {
  const { error } = await supabase.from("error_reports").update({ is_read: isRead, read_by: isRead ? markedBy : null }).eq("id", id);
  if (error) return { error: "No se pudo actualizar el reporte. Probá de nuevo." };
  return {};
}

export async function deleteErrorReport(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("error_reports").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar el reporte. Probá de nuevo." };
  return {};
}
