// Horario de atencion de un gimnasio (profiles.business_hours, jsonb). Se edita desde
// Configuracion > Editar perfil (solo user_type "gimnasio") y se muestra en la info del perfil
// publico -- ver settings.ts y profile.ts.

export interface BusinessHoursEntry {
  dayOfWeek: number; // 0=domingo .. 6=sabado, mismo orden que CLASS_DAY_LABELS de gymClassMarkup
  opens: string; // "HH:MM"
  closes: string;
}

export const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DAY_ABBR = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function formatHoursTime(t: string): string {
  return t.slice(0, 5);
}

export function parseBusinessHours(json: unknown): BusinessHoursEntry[] {
  if (!Array.isArray(json)) return [];
  return json.map((e) => ({
    dayOfWeek: (e as { day_of_week: number }).day_of_week,
    opens: (e as { opens: string }).opens,
    closes: (e as { closes: string }).closes,
  }));
}

export function serializeBusinessHours(entries: BusinessHoursEntry[]): { day_of_week: number; opens: string; closes: string }[] {
  return entries.map((e) => ({ day_of_week: e.dayOfWeek, opens: e.opens, closes: e.closes }));
}
