import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export type UserReport = Tables<"user_reports">;

export interface UserReportWithNames extends UserReport {
  reporterName: string | null;
  reportedName: string | null;
  readByName: string | null;
}

export function validateUserReport(reason: string): "reason_short" | "reason_long" | null {
  if (reason.trim().length < 5) return "reason_short";
  if (reason.trim().length > 1000) return "reason_long";
  return null;
}

export async function submitUserReport(reporterId: string, reportedUserId: string, reason: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("user_reports").insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    reason: reason.trim(),
  });
  if (error) return { error: "No se pudo enviar el reporte. Probá de nuevo." };
  return {};
}

export async function getUnreadUserReportCount(): Promise<number> {
  const { count, error } = await supabase.from("user_reports").select("id", { count: "exact", head: true }).eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function listUserReports(): Promise<UserReportWithNames[]> {
  const { data: rows, error } = await supabase
    .from("user_reports")
    .select("*")
    .order("is_read", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const ids = [...new Set(rows.flatMap((r) => [r.reporter_id, r.reported_user_id, r.read_by]).filter((id): id is string => id !== null))];
  const { data: profiles, error: profilesError } = await supabase.from("profiles_public").select("id, username").in("id", ids);
  if (profilesError) throw profilesError;

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  return rows.map((r) => ({
    ...r,
    reporterName: usernameById.get(r.reporter_id) ?? null,
    reportedName: usernameById.get(r.reported_user_id) ?? null,
    readByName: r.read_by ? (usernameById.get(r.read_by) ?? null) : null,
  }));
}

export async function markUserReportRead(id: string, isRead: boolean, markedBy: string | null): Promise<{ error?: string }> {
  const { error } = await supabase.from("user_reports").update({ is_read: isRead, read_by: isRead ? markedBy : null }).eq("id", id);
  if (error) return { error: "No se pudo actualizar el reporte. Probá de nuevo." };
  return {};
}

export async function deleteUserReport(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("user_reports").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar el reporte. Probá de nuevo." };
  return {};
}
