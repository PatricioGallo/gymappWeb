import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

export interface UpcomingBirthday {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  userType: Tables<"profiles">["user_type"];
  isVerified: boolean;
  /** "YYYY-MM-DD" de la próxima ocurrencia del cumpleaños (hoy si es hoy). */
  nextBirthday: string;
  /** Días desde hoy hasta nextBirthday (0 = hoy). */
  daysUntil: number;
  /** Edad que cumple en esa fecha. */
  turningAge: number;
  isToday: boolean;
}

/**
 * Próximos cumpleaños de la gente que sigo, dentro de `days` días, ordenados por
 * cercanía. La RPC (SECURITY DEFINER) filtra server-side: solo seguimientos
 * aceptados, excluye gimnasios y a quien ocultó su cumpleaños en Privacidad.
 */
export async function getUpcomingBirthdays(days = 30): Promise<UpcomingBirthday[]> {
  const { data, error } = await supabase.rpc("get_upcoming_birthdays", { p_days: days });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username ?? "",
    nombre: r.nombre ?? "",
    apellido: r.apellido ?? "",
    avatarUrl: r.avatar_url,
    userType: r.user_type,
    isVerified: r.is_verified,
    nextBirthday: r.next_birthday,
    daysUntil: r.days_until,
    turningAge: r.turning_age,
    isToday: r.is_today,
  }));
}

/** Texto corto para "cuándo": "Hoy", "Mañana", "En 3 días", o "vie 12 sep". */
export function birthdayWhenLabel(b: UpcomingBirthday): string {
  if (b.isToday) return "Hoy";
  if (b.daysUntil === 1) return "Mañana";
  if (b.daysUntil <= 7) return `En ${b.daysUntil} días`;
  const d = new Date(`${b.nextBirthday}T00:00:00`);
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}
