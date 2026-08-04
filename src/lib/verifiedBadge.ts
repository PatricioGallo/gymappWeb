import type { Enums } from "../types/database";

export type UserType = Enums<"user_type">;
export type BadgeColor = "blue" | "green";

/**
 * Reglas de la tilde de verificacion:
 * - admin/colaborador: azul, obligatoria (no configurable).
 * - gimnasio: verde, obligatoria (autenticidad certificada por Gym Social).
 * - entrenador: verde, solo si is_verified (papeleria presentada, configurable por admin).
 * - usuario: azul, solo si is_verified (cuenta famosa/reconocida, configurable por admin).
 */
export function getVerifiedBadgeColor(userType: UserType, isVerified: boolean): BadgeColor | null {
  if (userType === "admin" || userType === "colaborador") return "blue";
  if (userType === "gimnasio") return "green";
  if (userType === "entrenador") return isVerified ? "green" : null;
  if (userType === "usuario") return isVerified ? "blue" : null;
  return null;
}

/**
 * Etiqueta minimalista de rol para debajo del nombre en el perfil.
 * admin/colaborador: rol tal cual. gimnasio: "Gimnasio verificado".
 * entrenador: "Entrenador verificado" solo con tilde verde, sino "Entrenador".
 * usuario: nada, salvo "Cuenta oficial" si tiene tilde azul.
 */
export function getUserTypeLabel(userType: UserType, isVerified: boolean): string | null {
  if (userType === "admin") return "Administrador";
  if (userType === "colaborador") return "Colaborador";
  if (userType === "gimnasio") return "Gimnasio verificado";
  if (userType === "entrenador") return isVerified ? "Entrenador verificado" : "Entrenador";
  if (userType === "usuario") return isVerified ? "Cuenta oficial" : null;
  return null;
}

const BADGE_TITLES: Record<BadgeColor, string> = {
  blue: "Cuenta verificada",
  green: "Autenticidad certificada por Gym Social",
};

/** Devuelve el HTML de la tilde (string vacio si el usuario no debe mostrarla). `size` en px (default 15). */
export function renderVerifiedBadge(userType: UserType, isVerified: boolean, size = 15): string {
  const color = getVerifiedBadgeColor(userType, isVerified);
  if (!color) return "";
  const title = BADGE_TITLES[color];
  return `<svg class="verified-badge verified-badge-${color}" width="${size}" height="${size}" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="${title}"><title>${title}</title><path fill-rule="evenodd" clip-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>`;
}
