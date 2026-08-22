import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (revisa el archivo .env)");
}

export const supabase = createClient<Database>(url, anonKey);

// La sesion (incluido el refresh token) vive en localStorage -- sin storage persistente,
// Android/Chrome puede evictarlo bajo presion de espacio (mismo trato que cualquier sitio
// "best-effort", incluso instalado como PWA), lo que se siente como un logout aleatorio al
// reabrir la app. persist() es silencioso (sin permiso de por medio) y Chrome lo concede solo
// con suficiente "site engagement", pero no hace nada si ya esta denegado -- pedirlo de mas
// no tiene downside.
if (typeof navigator !== "undefined" && navigator.storage?.persist) {
  void navigator.storage.persist();
}
