import { supabase } from "../lib/supabaseClient";

export async function upsertPushSubscription(userId: string, sub: PushSubscription): Promise<{ error?: string }> {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { error: "Suscripción inválida." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" }
  );
  if (error) return { error: "No se pudo activar las notificaciones. Probá de nuevo." };
  return {};
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function hasStoredPushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const { data } = await supabase.from("push_subscriptions").select("id").eq("user_id", userId).eq("endpoint", endpoint).maybeSingle();
  return !!data;
}
