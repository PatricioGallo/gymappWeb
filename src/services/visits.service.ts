import { supabase } from "../lib/supabaseClient";

const THROTTLE_KEY = "gs_last_visit_logged_at";
const THROTTLE_MS = 30 * 60 * 1000;

export async function logVisitOncePerSession(): Promise<void> {
  try {
    const last = Number(localStorage.getItem(THROTTLE_KEY) ?? 0);
    if (Date.now() - last < THROTTLE_MS) return;
    localStorage.setItem(THROTTLE_KEY, String(Date.now()));

    const { data } = await supabase.auth.getSession();
    await supabase.from("site_visits").insert({
      path: window.location.pathname,
      user_id: data.session?.user.id ?? null,
    });
  } catch {
    // el tracking de visitas nunca debe romper la navegacion del usuario
  }
}
