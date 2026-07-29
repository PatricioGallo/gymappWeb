import { supabase } from "../lib/supabaseClient";

export interface SignUpFields {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  username: string;
  edad: number;
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

export async function signUp(fields: SignUpFields): Promise<{ error?: string }> {
  const username = normalizeUsername(fields.username);
  if (!isValidUsername(username)) {
    return { error: "El nombre de usuario debe tener 3-30 caracteres: minúsculas, números o guion bajo." };
  }

  const { data, error } = await supabase.auth.signUp({
    email: fields.email,
    password: fields.password,
    options: {
      data: {
        nombre: fields.nombre,
        apellido: fields.apellido,
        username,
        edad: fields.edad,
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

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Mensaje generico a proposito: no distinguimos "no existe" de "contraseña
    // incorrecta" para no facilitar enumeracion de cuentas.
    return { error: "Mail o contraseña incorrectos." };
  }
  return {};
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
