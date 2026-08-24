import { supabase } from "../lib/supabaseClient";
import { isReservedUsername } from "../lib/reservedUsernames";

export interface SignUpFields {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  username: string;
  fechaNacimiento: string;
  nacionalidad: string;
  genero: "hombre" | "mujer" | "otro";
  provincia: string;
  ciudad?: string;
  userType?: "usuario" | "entrenador";
}

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("profiles_public")
    .select("id", { count: "exact", head: true })
    .eq("username", username);
  if (error) throw error;
  return (count ?? 0) === 0;
}

function slugifyNamePart(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Sugiere un @usuario libre a partir de nombre+apellido (probando sufijos numéricos). Null si no se pudo armar uno válido. */
export async function suggestUsername(nombre: string, apellido: string): Promise<string | null> {
  const base = `${slugifyNamePart(nombre)}${slugifyNamePart(apellido)}`.slice(0, 25);
  if (base.length < 3) return null;

  for (let i = 0; i < 15; i++) {
    const candidate = i === 0 ? base : `${base}${i}`;
    if (!isValidUsername(candidate) || isReservedUsername(candidate)) continue;
    if (await isUsernameAvailable(candidate)) return candidate;
  }
  return null;
}

export async function signUp(fields: SignUpFields): Promise<{ error?: string }> {
  const username = normalizeUsername(fields.username);
  if (!isValidUsername(username)) {
    return { error: "El nombre de usuario debe tener 3-30 caracteres: minúsculas, números o guion bajo." };
  }
  if (isReservedUsername(username)) {
    return { error: "Ese nombre de usuario no está disponible." };
  }

  const { data, error } = await supabase.auth.signUp({
    email: fields.email,
    password: fields.password,
    options: {
      emailRedirectTo: `${window.location.origin}/pages/login.html`,
      data: {
        nombre: fields.nombre,
        apellido: fields.apellido,
        username,
        fecha_nacimiento: fields.fechaNacimiento,
        nacionalidad: fields.nacionalidad,
        genero: fields.genero,
        provincia: fields.provincia,
        ciudad: fields.ciudad ?? "",
        user_type: fields.userType ?? "usuario",
      },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "Ese mail ya está registrado." };
    }
    if (error.message.toLowerCase().includes("profiles_username") || error.message.toLowerCase().includes("username")) {
      return { error: "Ese nombre de usuario ya está en uso." };
    }
    return { error: "No se pudo crear la cuenta. Intentá de nuevo." };
  }

  // Supabase evita filtrar si un mail ya existe: cuando el mail ya esta
  // registrado y confirmado, signUp "tiene exito" pero devuelve un usuario
  // sin identidades nuevas asociadas.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { error: "Ese mail ya está registrado." };
  }
  return {};
}

export async function signIn(identifier: string, password: string): Promise<{ error?: string }> {
  const genericError = { error: "Mail o contraseña incorrectos." };

  let email = identifier.trim();
  if (!email.includes("@")) {
    const { data, error: rpcError } = await supabase.rpc("get_email_by_username", {
      p_username: email,
    });
    if (rpcError || !data) {
      return genericError;
    }
    email = data;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Mensaje generico a proposito: no distinguimos "no existe" de "contraseña
    // incorrecta" para no facilitar enumeracion de cuentas.
    return genericError;
  }
  return {};
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Manda el mail de "restablecer contraseña". Supabase no distingue si el mail existe o no
 * (misma respuesta en ambos casos) para evitar enumeracion de cuentas, asi que solo devolvemos
 * error ante un problema real (rate limit, red, etc.) -- no ante "ese mail no existe". */
export async function requestPasswordReset(email: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/pages/reset-password.html`,
  });
  if (error) {
    return { error: "No se pudo enviar el mail. Intentá de nuevo en unos minutos." };
  }
  return {};
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
