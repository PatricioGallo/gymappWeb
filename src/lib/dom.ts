const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return value.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}
