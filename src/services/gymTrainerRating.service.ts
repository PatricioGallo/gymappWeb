import { supabase } from "../lib/supabaseClient";

export interface GymTrainerRatingRow {
  trainerId: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  isVerified: boolean;
  avgRating: number;
  ratingCount: number;
  myRating: number | null;
  myComment: string | null;
}

export interface GymTrainerReview {
  memberId: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export async function listGymTrainerRatings(gymId: string): Promise<GymTrainerRatingRow[]> {
  const { data, error } = await supabase.rpc("list_gym_trainer_ratings", { p_gym_id: gymId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    trainerId: r.trainer_id,
    username: r.username ?? "",
    nombre: r.nombre ?? "",
    apellido: r.apellido ?? "",
    avatarUrl: r.avatar_url,
    isVerified: r.is_verified,
    avgRating: Number(r.avg_rating ?? 0),
    ratingCount: r.rating_count ?? 0,
    myRating: r.my_rating,
    myComment: r.my_comment,
  }));
}

export async function listGymTrainerReviews(gymId: string, trainerId: string): Promise<GymTrainerReview[]> {
  const { data, error } = await supabase.rpc("list_gym_trainer_reviews", { p_gym_id: gymId, p_trainer_id: trainerId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    memberId: r.member_id,
    username: r.username ?? "",
    nombre: r.nombre ?? "",
    apellido: r.apellido ?? "",
    avatarUrl: r.avatar_url,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}

/** Crea o actualiza (upsert) la calificacion del socio logueado para un handle puntual. La
 * elegibilidad (socio activo del gym + handle activo del gym) la valida el trigger server-side. */
export async function rateGymTrainer(
  gymId: string,
  trainerId: string,
  memberId: string,
  rating: number,
  comment: string | null
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("gym_trainer_ratings")
    .upsert({ gym_id: gymId, trainer_id: trainerId, member_id: memberId, rating, comment: comment || null }, { onConflict: "gym_id,trainer_id,member_id" });
  if (error) {
    if (error.message?.includes("not an active member")) return { error: "Tenés que ser socio de este gimnasio para calificar." };
    if (error.message?.includes("not an active handle")) return { error: "Este entrenador ya no es handle activo de este gimnasio." };
    return { error: "No se pudo guardar la calificación. Probá de nuevo." };
  }
  return {};
}

export async function deleteGymTrainerRating(gymId: string, trainerId: string, memberId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("gym_trainer_ratings").delete().eq("gym_id", gymId).eq("trainer_id", trainerId).eq("member_id", memberId);
  if (error) return { error: "No se pudo quitar la calificación. Probá de nuevo." };
  return {};
}
