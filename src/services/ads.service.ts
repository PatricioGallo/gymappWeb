import { supabase } from "../lib/supabaseClient";
import type { Tables } from "../types/database";

// Publicidad en el feed. La entrega la decide get_feed_ads() en el server (targeting,
// tope de frecuencia, exclusión de seguidores); acá solo se envuelve la RPC y se
// filtra contra los anuncios que el usuario ocultó a mano en ESTE dispositivo
// (localStorage, sin backend -- mismo criterio "preferencia liviana por dispositivo"
// que el resto de la app).

export interface FeedAd {
  campaignId: string;
  advertiserId: string;
  advertiserName: string;
  advertiserLogoUrl: string | null;
  /** 'profile' = gimnasio/entrenador con perfil en la app; 'external' = marca de afuera. */
  advertiserKind: "profile" | "external";
  /** Solo si advertiserKind='profile': su @usuario, para linkear al perfil. */
  advertiserUsername: string | null;
  advertiserUserType: string | null;
  /** 'standalone' = creativo propio (marca externa); 'post' = un Rep promocionado (Fase 3). */
  creativeKind: "standalone" | "post";
  postId: string | null;
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  headline: string | null;
  bodyText: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

const HIDDEN_CAMPAIGNS_KEY = "feed_hidden_ad_campaigns";
const HIDDEN_ADVERTISERS_KEY = "feed_hidden_ad_advertisers";

function readHiddenSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeHiddenSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* almacenamiento no disponible (modo privado, etc) -- ocultar es best-effort */
  }
}

export function hideAdCampaign(campaignId: string): void {
  const set = readHiddenSet(HIDDEN_CAMPAIGNS_KEY);
  set.add(campaignId);
  writeHiddenSet(HIDDEN_CAMPAIGNS_KEY, set);
}

export function hideAdvertiser(advertiserId: string): void {
  const set = readHiddenSet(HIDDEN_ADVERTISERS_KEY);
  set.add(advertiserId);
  writeHiddenSet(HIDDEN_ADVERTISERS_KEY, set);
}

function isHidden(ad: FeedAd): boolean {
  return (
    readHiddenSet(HIDDEN_CAMPAIGNS_KEY).has(ad.campaignId) ||
    readHiddenSet(HIDDEN_ADVERTISERS_KEY).has(ad.advertiserId)
  );
}

/**
 * Anuncios candidatos para intercalar en el feed del usuario actual. `seed` fijo por
 * sesión de scroll (mismo que getPersonalizedFeed) para que el orden con jitter sea
 * estable. Devuelve [] si algo falla -- la publicidad nunca puede tumbar el feed.
 */
export async function getFeedAds(limit = 4, seed?: string): Promise<FeedAd[]> {
  try {
    const { data, error } = await supabase.rpc("get_feed_ads", { p_limit: limit, p_seed: seed });
    if (error) throw error;
    const ads: FeedAd[] = (data ?? []).map((r) => ({
      campaignId: r.campaign_id,
      advertiserId: r.advertiser_id,
      advertiserName: r.advertiser_name,
      advertiserLogoUrl: r.advertiser_logo_url,
      advertiserKind: r.advertiser_kind === "profile" ? "profile" : "external",
      advertiserUsername: r.advertiser_username,
      advertiserUserType: r.advertiser_user_type,
      creativeKind: r.creative_kind === "post" ? "post" : "standalone",
      postId: r.post_id,
      mediaUrl: r.media_url,
      mediaType: r.media_type === "video" ? "video" : r.media_type === "image" ? "image" : null,
      headline: r.headline,
      bodyText: r.body_text,
      ctaLabel: r.cta_label,
      ctaUrl: r.cta_url,
    }));
    return ads.filter((ad) => !isHidden(ad));
  } catch (err) {
    console.error("[ads] get_feed_ads falló:", err);
    return [];
  }
}

/** Registra una impresión o un clic. Fire-and-forget: nunca lanza. */
export async function recordAdEvent(campaignId: string, kind: "impression" | "click"): Promise<void> {
  try {
    await supabase.rpc("record_ad_event", { p_campaign_id: campaignId, p_kind: kind });
  } catch (err) {
    console.error("[ads] record_ad_event falló:", err);
  }
}

// ===========================================================================
// Panel admin (pestaña "Publicidad"). Todo esto lo protege la RLS staff-only de
// advertisers / ad_campaigns y la RPC get_ad_stats -- un no-staff que llame estas
// funciones recibe filas vacías / errores de permiso.
// ===========================================================================

export type Advertiser = Tables<"advertisers">;
export type AdCampaign = Tables<"ad_campaigns">;

export const AD_TARGET_USER_TYPES = ["usuario", "entrenador", "gimnasio"] as const;
export type AdTargetUserType = (typeof AD_TARGET_USER_TYPES)[number];
export const AD_TARGET_USER_TYPE_LABELS: Record<AdTargetUserType, string> = {
  usuario: "Usuarios",
  entrenador: "Entrenadores",
  gimnasio: "Gimnasios",
};

export const AD_CAMPAIGN_STATUSES = ["draft", "active", "paused", "ended"] as const;
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];
export const AD_CAMPAIGN_STATUS_LABELS: Record<AdCampaignStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  paused: "Pausada",
  ended: "Finalizada",
};

export interface AdStats {
  impressions: number;
  clicks: number;
  uniqueViewers: number;
}

export interface AdCampaignWithMeta extends AdCampaign {
  advertiserName: string;
  advertiserKind: "profile" | "external";
  stats: AdStats;
}

export interface AdvertiserProfileMatch {
  id: string;
  username: string;
  userType: string;
}

export interface AdvertiserInput {
  kind: "profile" | "external";
  profileId: string | null;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface AdCampaignInput {
  advertiserId: string;
  status: AdCampaignStatus;
  startsAt: string;
  endsAt: string;
  headline: string | null;
  bodyText: string | null;
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  targetProvincia: string | null;
  targetCiudad: string | null;
  targetUserTypes: string[];
  dailyImpressionCapPerUser: number;
  priceTotal: number | null;
  billingNotes: string | null;
}

export async function listAdvertisers(): Promise<Advertiser[]> {
  const { data, error } = await supabase.from("advertisers").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Gimnasios/entrenadores para elegir como anunciante interno. */
export async function searchAdvertiserProfiles(term: string): Promise<AdvertiserProfileMatch[]> {
  let q = supabase
    .from("profiles_public")
    .select("id, username, user_type")
    .in("user_type", ["gimnasio", "entrenador"])
    .limit(10);
  if (term.trim()) q = q.ilike("username", `%${term.trim()}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? [])
    .filter((r) => !!r.id && !!r.username)
    .map((r) => ({ id: r.id!, username: r.username!, userType: r.user_type ?? "" }));
}

function advertiserRow(input: AdvertiserInput) {
  return {
    kind: input.kind,
    profile_id: input.kind === "profile" ? input.profileId : null,
    name: input.name.trim(),
    logo_url: input.logoUrl,
    website_url: input.websiteUrl,
    contact_email: input.contactEmail,
    contact_phone: input.contactPhone,
  };
}

export async function createAdvertiser(input: AdvertiserInput): Promise<{ error?: string; id?: string }> {
  if (!input.name.trim()) return { error: "Ponele un nombre al anunciante." };
  if (input.kind === "profile" && !input.profileId) return { error: "Elegí el perfil del gimnasio o entrenador." };
  const { data, error } = await supabase.from("advertisers").insert(advertiserRow(input)).select("id").single();
  if (error) return { error: error.message.includes("advertisers_profile_uniq") ? "Ese perfil ya tiene una ficha de anunciante." : "No se pudo crear el anunciante." };
  return { id: data.id };
}

export async function updateAdvertiser(id: string, input: AdvertiserInput): Promise<{ error?: string }> {
  if (!input.name.trim()) return { error: "Ponele un nombre al anunciante." };
  const { error } = await supabase.from("advertisers").update(advertiserRow(input)).eq("id", id);
  if (error) return { error: "No se pudo guardar el anunciante." };
  return {};
}

export async function deleteAdvertiser(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("advertisers").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar (¿tiene campañas?). Borralas primero." };
  return {};
}

export async function listAdCampaigns(): Promise<AdCampaignWithMeta[]> {
  const [{ data, error }, statsRes] = await Promise.all([
    supabase
      .from("ad_campaigns")
      .select("*, advertiser:advertisers(name, kind)")
      .order("created_at", { ascending: false }),
    supabase.rpc("get_ad_stats"),
  ]);
  if (error) throw error;
  const statsByCampaign = new Map<string, AdStats>();
  for (const s of statsRes.data ?? []) {
    statsByCampaign.set(s.campaign_id, {
      impressions: Number(s.impressions) || 0,
      clicks: Number(s.clicks) || 0,
      uniqueViewers: Number(s.unique_viewers) || 0,
    });
  }
  return (data ?? []).map((row) => {
    const { advertiser, ...campaign } = row as typeof row & { advertiser: { name: string; kind: string } | null };
    return {
      ...(campaign as AdCampaign),
      advertiserName: advertiser?.name ?? "—",
      advertiserKind: advertiser?.kind === "profile" ? "profile" : "external",
      stats: statsByCampaign.get(campaign.id) ?? { impressions: 0, clicks: 0, uniqueViewers: 0 },
    };
  });
}

function campaignRow(input: AdCampaignInput) {
  return {
    advertiser_id: input.advertiserId,
    status: input.status,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    creative_kind: "standalone" as const,
    headline: input.headline,
    body_text: input.bodyText,
    media_url: input.mediaUrl,
    media_type: input.mediaType,
    cta_label: input.ctaLabel,
    cta_url: input.ctaUrl,
    target_provincia: input.targetProvincia,
    target_ciudad: input.targetCiudad,
    target_user_types: input.targetUserTypes,
    daily_impression_cap_per_user: input.dailyImpressionCapPerUser,
    price_total: input.priceTotal,
    billing_notes: input.billingNotes,
  };
}

function validateCampaign(input: AdCampaignInput): string | null {
  if (!input.advertiserId) return "Elegí un anunciante.";
  if (!input.mediaUrl || !input.mediaType) return "Subí la imagen o el video del anuncio.";
  if (!input.ctaUrl?.trim()) return "Poné el link de destino (a dónde lleva el anuncio).";
  if (!input.startsAt || !input.endsAt) return "Poné las fechas de inicio y fin.";
  if (new Date(input.endsAt) <= new Date(input.startsAt)) return "La fecha de fin tiene que ser posterior a la de inicio.";
  return null;
}

export async function createAdCampaign(input: AdCampaignInput): Promise<{ error?: string }> {
  const v = validateCampaign(input);
  if (v) return { error: v };
  const { error } = await supabase.from("ad_campaigns").insert(campaignRow(input));
  if (error) return { error: "No se pudo crear la campaña." };
  return {};
}

export async function updateAdCampaign(id: string, input: AdCampaignInput): Promise<{ error?: string }> {
  const v = validateCampaign(input);
  if (v) return { error: v };
  const { error } = await supabase.from("ad_campaigns").update(campaignRow(input)).eq("id", id);
  if (error) return { error: "No se pudo guardar la campaña." };
  return {};
}

export async function setAdCampaignStatus(id: string, status: AdCampaignStatus): Promise<{ error?: string }> {
  const { error } = await supabase.from("ad_campaigns").update({ status }).eq("id", id);
  if (error) return { error: "No se pudo cambiar el estado." };
  return {};
}

export async function deleteAdCampaign(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("ad_campaigns").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar la campaña." };
  return {};
}

const AD_MEDIA_IMAGE_MAX = 20 * 1024 * 1024;
const AD_MEDIA_VIDEO_MAX = 300 * 1024 * 1024;

/** Sube un logo o creativo al bucket público ad-media (solo staff). */
export async function uploadAdMedia(
  file: File,
  slot: "logo" | "creative"
): Promise<{ url?: string; mediaType?: "image" | "video"; error?: string }> {
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) return { error: "Subí una imagen o un video." };
  if (isImage && file.size > AD_MEDIA_IMAGE_MAX) return { error: "La imagen es muy pesada. Máximo 20MB." };
  if (isVideo && file.size > AD_MEDIA_VIDEO_MAX) return { error: "El video es muy pesado. Máximo 300MB." };
  if (slot === "logo" && !isImage) return { error: "El logo tiene que ser una imagen." };

  const ext = file.name.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "jpg");
  const path = `${slot}s/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("ad-media").upload(path, file, { contentType: file.type || undefined });
  if (error) return { error: `No se pudo subir el archivo: ${error.message}` };
  const { data } = supabase.storage.from("ad-media").getPublicUrl(path);
  return { url: data.publicUrl, mediaType: isVideo ? "video" : "image" };
}
