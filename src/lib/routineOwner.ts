import { escapeHtml } from "./dom";

// Estructural a proposito (no importa el ProfileBasic/Profile completo): asi sirve
// tanto para el perfil que ya tenemos en memoria (Profile o ProfileBasic) como para
// filas resueltas por lote (getProfilesBasicByIds), sin pelear con sus tipos exactos.
export interface BasicNamedProfile {
  username: string | null;
  nombre: string | null;
  apellido: string | null;
}

/** Linea "Rutina de X", donde X es el dueño real: quien la asigno si es una rutina
 * asignada (el dueño conceptual es el entrenador, aunque `user_id` en la tabla sea
 * el alumno que la recibe), o el propio dueño si es una rutina propia. No distingue
 * quien se la asigno a quien -- solo importa de quien es. */
export function routineOwnerLineMarkup(owner: BasicNamedProfile | undefined | null, assignedBy?: BasicNamedProfile | undefined | null): string {
  const realOwner = assignedBy ?? owner;
  if (!realOwner) return "";
  const fullName = (p: BasicNamedProfile) => escapeHtml(`${p.nombre ?? ""} ${p.apellido ?? ""}`.trim());
  const link = (p: BasicNamedProfile) => `<a href="profile.html?u=${encodeURIComponent(p.username ?? "")}">${fullName(p)}</a>`;
  // div, no p: esto se inyecta via innerHTML dentro de otros contenedores (algunos
  // ya son <p>, como #routineOwnerBanner) y un <p> no puede contener otro <p> ni
  // matchear .page-hero p (que le ganaria en especificidad al 13px de esta clase).
  return `<div class="routine-owner-line">Rutina de ${link(realOwner)}</div>`;
}
