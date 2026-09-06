import { supabase } from "../lib/supabaseClient";

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
