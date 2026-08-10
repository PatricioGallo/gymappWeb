import { supabase } from "./supabaseClient";

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
