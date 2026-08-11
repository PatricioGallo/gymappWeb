import { unregisterCurrentDeviceToken } from "./pushService";
import { isReservedUsername } from "./reservedUsernames";
import { supabase } from "./supabaseClient";

export interface SignUpFields {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  username: string;
  fechaNacimiento: string;
  nacionalidad: string;
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
      data: {
        nombre: fields.nombre,
        apellido: fields.apellido,
        username,
        fecha_nacimiento: fields.fechaNacimiento,
        nacionalidad: fields.nacionalidad,
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user.id) await unregisterCurrentDeviceToken(session.user.id);
  await supabase.auth.signOut();
}
