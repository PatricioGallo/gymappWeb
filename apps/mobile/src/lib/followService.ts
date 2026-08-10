import { supabase } from "./supabaseClient";

export interface FollowCounts {
  followers: number;
  following: number;
}

export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  const { data, error } = await supabase.rpc("get_follow_counts", { p_user_id: userId });
  if (error) throw error;
  const row = data?.[0];
  return { followers: row?.followers ?? 0, following: row?.following ?? 0 };
}
