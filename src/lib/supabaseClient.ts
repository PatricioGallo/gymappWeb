import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (revisa el archivo .env)");
}

// Clave bajo la que auth-js guarda la sesion (incluido el refresh token) en localStorage.
// Es el mismo formato que arma supabase-js por defecto (`sb-<ref>-auth-token`), pero lo
// fijamos explicito para poder leerlo nosotros en hasPersistedSession() sin depender del
// detalle interno de la libreria.
const AUTH_STORAGE_KEY = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

// fetch con corte a los 15s. Al reabrir la PWA en iOS, la red tarda un rato en estar
// lista y una request de auth-js (canje del refresh token) puede quedarse colgada mucho
// mas que eso sin resolver ni fallar nunca -- y ahi getSession() se cuelga y termina
// devolviendo session: null, que se siente como un logout. Con el abort, falla como error
// de red -> auth-js lo trata como retryable y reintenta solo con backoff, en vez de colgar.
const fetchWithTimeout: typeof fetch = (input, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  const caller = init?.signal;
  if (caller) {
    if (caller.aborted) ctrl.abort();
    else caller.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

export const supabase = createClient<Database>(url, anonKey, {
  auth: { storageKey: AUTH_STORAGE_KEY },
  global: { fetch: fetchWithTimeout },
});

/**
 * true si en este dispositivo hay una sesion persistida (aunque el access token este
 * vencido): existe el blob de auth-js en localStorage y tiene refresh_token.
 *
 * Sirve para distinguir "el usuario nunca inicio sesion / cerro sesion" (no hay nada
 * guardado) de "la sesion esta guardada pero getSession() todavia no pudo revalidarla"
 * -- tipico al reabrir la PWA en iOS con la red aun no lista. En ese segundo caso NO hay
 * que mandar a login: el refresh token casi siempre sigue vivo y se recupera reintentando.
 */
export function hasPersistedSession(): boolean {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { refresh_token?: string } | null;
    return typeof parsed?.refresh_token === "string" && parsed.refresh_token.length > 0;
  } catch {
    return false;
  }
}

// La sesion (incluido el refresh token) vive en localStorage -- sin storage persistente,
// Android/Chrome puede evictarlo bajo presion de espacio (mismo trato que cualquier sitio
// "best-effort", incluso instalado como PWA), lo que se siente como un logout aleatorio al
// reabrir la app. persist() es silencioso (sin permiso de por medio) y Chrome lo concede solo
// con suficiente "site engagement", pero no hace nada si ya esta denegado -- pedirlo de mas
// no tiene downside. Ojo: WebKit/iOS no implementa esta API (es no-op ahi); en iPhone la unica
// defensa real contra la eviccion a los 7 dias es abrir la app al menos una vez por semana.
if (typeof navigator !== "undefined" && navigator.storage?.persist) {
  void navigator.storage.persist();
}
