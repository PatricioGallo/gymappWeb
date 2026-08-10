import { supabase } from "./supabaseClient";

export async function getSubscriberCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_subscriber_count", { p_user_id: userId });
  if (error) throw error;
  return data ?? 0;
}
