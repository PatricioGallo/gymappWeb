import { escapeHtml } from "./dom";

// Estructural a proposito (no importa el ProfileBasic/Profile completo): asi sirve
// tanto para el perfil que ya tenemos en memoria (Profile o ProfileBasic) como para
// filas resueltas por lote (getProfilesBasicByIds), sin pelear con sus tipos exactos.
export interface BasicNamedProfile {
  username: string | null;
  nombre: string | null;
  apellido: string | null;
}

/** Linea "Rutina de X" (+ "Asignada por Y" si corresponde), con link al perfil de cada uno. */
export function routineOwnerLineMarkup(owner: BasicNamedProfile | undefined | null, assignedBy?: BasicNamedProfile | undefined | null): string {
  if (!owner) return "";
  const fullName = (p: BasicNamedProfile) => escapeHtml(`${p.nombre ?? ""} ${p.apellido ?? ""}`.trim());
  const link = (p: BasicNamedProfile) => `<a href="profile.html?u=${encodeURIComponent(p.username ?? "")}">${fullName(p)}</a>`;
  const assignedPart = assignedBy ? ` · Asignada por ${link(assignedBy)}` : "";
  // div, no p: esto se inyecta via innerHTML dentro de otros contenedores (algunos
  // ya son <p>, como #routineOwnerBanner) y un <p> no puede contener otro <p> ni
  // matchear .page-hero p (que le ganaria en especificidad al 13px de esta clase).
  return `<div class="routine-owner-line">Rutina de ${link(owner)}${assignedPart}</div>`;
}
