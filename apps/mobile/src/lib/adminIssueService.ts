import { supabase } from "./supabaseClient";
import type { Tables } from "@/types/database";

export type IssueReport = Tables<"issue_reports">;

export type IssueSeverity = "low" | "medium" | "high";
export type IssueStatus = "open" | "in_progress" | "resolved";

export const ISSUE_SEVERITY_OPTIONS: IssueSeverity[] = ["low", "medium", "high"];

export const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export const ISSUE_STATUS_OPTIONS: IssueStatus[] = ["open", "in_progress", "resolved"];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Abierto",
  in_progress: "En progreso",
  resolved: "Resuelto",
};

export interface IssueReportWithReporter extends IssueReport {
  reporterName: string | null;
}

export async function listIssueReports(): Promise<IssueReportWithReporter[]> {
  const { data, error } = await supabase
    .from("issue_reports")
    .select("*, profiles ( username, nombre, apellido )")
    .order("status", { ascending: true })
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const { profiles, ...issue } = row;
    return { ...issue, reporterName: profiles ? `${profiles.nombre} ${profiles.apellido} (@${profiles.username})` : null };
  });
}

export function validateIssueReport(title: string): "title_short" | "title_long" | null {
  if (title.trim().length < 2) return "title_short";
  if (title.trim().length > 200) return "title_long";
  return null;
}

export async function addIssueReport(
  authorId: string,
  title: string,
  description: string,
  page: string,
  severity: IssueSeverity
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("issue_reports")
    .insert({ title: title.trim(), description: description.trim() || null, page: page.trim() || null, severity, created_by: authorId });
  if (error) return { error: "No se pudo guardar el issue. Probá de nuevo." };
  return {};
}

export interface EditableIssueReportFields {
  title?: string;
  description?: string | null;
  page?: string | null;
  severity?: IssueSeverity;
  status?: IssueStatus;
}

export async function updateIssueReport(id: string, fields: EditableIssueReportFields): Promise<{ error?: string }> {
  const { error } = await supabase.from("issue_reports").update(fields).eq("id", id);
  if (error) return { error: "No se pudo guardar el issue. Probá de nuevo." };
  return {};
}

export async function deleteIssueReport(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("issue_reports").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar el issue. Probá de nuevo." };
  return {};
}
