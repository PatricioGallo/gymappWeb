import { supabase } from "./supabaseClient";

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
