import { supabase } from "./supabaseClient";
import { isReservedUsername } from "./reservedUsernames";
import type { Enums } from "@/types/database";

export type UserType = Enums<"user_type">;

export const USER_TYPE_OPTIONS: UserType[] = ["admin", "colaborador", "gimnasio", "entrenador", "usuario"];

export const USER_TYPE_LABELS: Record<UserType, string> = {
  admin: "Admin",
  colaborador: "Colaborador",
  gimnasio: "Gimnasio",
  entrenador: "Entrenador",
  usuario: "Gymbro",
};

export interface AdminUserRow {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  email: string;
  user_type: UserType;
  fecha_nacimiento: string;
  nacionalidad: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  routines_count: number;
  is_verified: boolean;
}

/** Roles donde la tilde es una eleccion del admin (papeleria / cuenta famosa); en los demas roles es obligatoria u obligatoriamente ausente. */
export const CONFIGURABLE_VERIFIED_TYPES: UserType[] = ["entrenador", "gimnasio", "usuario"];

export interface AdminSiteStats {
  total_users: number;
  users_by_type: Partial<Record<UserType, number>>;
  new_users_last_30_days: number;
  total_routines: number;
  active_routines: number;
  total_exercises: number;
  custom_exercises: number;
  total_weight_logs: number;
  total_visits: number;
  visits_today: number;
  visits_last_7_days: number;
  last_visit_at: string | null;
}

export interface AdminDailyVisit {
  day: string;
  count: number;
}

export async function getAdminSiteStats(): Promise<AdminSiteStats | null> {
  const { data, error } = await supabase.rpc("admin_site_stats");
  if (error) throw error;
  return (data as unknown as AdminSiteStats) ?? null;
}

export async function getAdminDailyVisits(days = 14): Promise<AdminDailyVisit[]> {
  const { data, error } = await supabase.rpc("admin_daily_visits", { p_days: days });
  if (error) throw error;
  return (data ?? []) as AdminDailyVisit[];
}

export async function listAllUsersAdmin(): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

export interface AdminEditableUserFields {
  username?: string;
  nombre?: string;
  apellido?: string;
  fecha_nacimiento?: string;
  nacionalidad?: string;
  user_type?: UserType;
  is_verified?: boolean;
}

export async function updateUserAsAdmin(userId: string, fields: AdminEditableUserFields): Promise<{ error?: string }> {
  if (fields.username && isReservedUsername(fields.username)) {
    return { error: "Ese nombre de usuario no está disponible." };
  }
  const { error } = await supabase.from("profiles").update(fields).eq("id", userId);
  if (error) {
    if (error.code === "23505") return { error: "Ese nombre de usuario ya está en uso." };
    if (error.code === "23514") return { error: "Ese nombre de usuario no está disponible." };
    return { error: "No se pudo guardar el usuario. Probá de nuevo." };
  }
  return {};
}

/** Borra la cuenta (auth.users + cascada a profiles/rutinas/pesos/notificaciones/follows). El RPC bloquea auto-borrado y admin/colaborador. */
export async function deleteUserAsAdmin(userId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("admin_delete_user", { p_user_id: userId });
  if (error) return { error: "No se pudo eliminar el usuario. Probá de nuevo." };
  return {};
}

/** Envia una notificacion a un usuario puntual (userId) o a todos (userId null = broadcast). */
export async function adminSendNotification(
  userId: string | null,
  title: string,
  body: string,
  link: string
): Promise<{ error?: string; count?: number }> {
  const { data, error } = await supabase.rpc("admin_send_notification", {
    // El RPC acepta uuid nulo (broadcast), pero los tipos generados no marcan
    // p_user_id como nullable: se castea a proposito.
    p_user_id: userId as string,
    p_title: title.trim(),
    p_body: body.trim(),
    p_link: link.trim() || undefined,
  });
  if (error) return { error: "No se pudo enviar la notificación. Probá de nuevo." };
  return { count: data ?? 0 };
}
