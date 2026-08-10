import type { Enums } from "@/types/database";

export type UserType = Enums<"user_type">;
export type BadgeColor = "blue" | "green";

/**
 * Reglas de la tilde de verificación:
 * - admin/colaborador: azul, obligatoria (no configurable).
 * - gimnasio: verde, solo si is_verified.
 * - entrenador: verde, solo si is_verified.
 * - usuario: azul, solo si is_verified.
 */
export function getVerifiedBadgeColor(userType: UserType, isVerified: boolean): BadgeColor | null {
  if (userType === "admin" || userType === "colaborador") return "blue";
  if (userType === "gimnasio") return isVerified ? "green" : null;
  if (userType === "entrenador") return isVerified ? "green" : null;
  if (userType === "usuario") return isVerified ? "blue" : null;
  return null;
}

export function getUserTypeLabel(userType: UserType, isVerified: boolean): string | null {
  if (userType === "admin") return "Administrador";
  if (userType === "colaborador") return "Colaborador";
  if (userType === "gimnasio") return isVerified ? "Gimnasio verificado" : "Gimnasio";
  if (userType === "entrenador") return isVerified ? "Entrenador verificado" : "Entrenador";
  if (userType === "usuario") return isVerified ? "Cuenta oficial" : null;
  return null;
}

export const BADGE_TITLES: Record<BadgeColor, string> = {
  blue: "Cuenta verificada",
  green: "Autenticidad certificada por Gym Social",
};
