import { escapeHtml } from "./dom";
import { renderPostCard } from "./postCard";
import type { FeedAd } from "../services/ads.service";
import type { FeedPost } from "../services/post.service";

const DEFAULT_LOGO = "/images/avatars/default.svg";

const ICON_DOTS = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;

// Selecciona las dos formas de anuncio en el feed: el creativo standalone y el Rep promocionado.
const AD_CARD_SELECTOR = ".feed-ad-card[data-campaign-id], .feed-promoted[data-campaign-id]";

export interface AdCardHandlers {
  /** Tocar el creativo o el botón CTA. */
  onAdClick(ad: FeedAd): void;
  /** "Ocultar este anuncio" (una campaña puntual). */
  onHideCampaign(ad: FeedAd): void;
  /** "Ocultar anuncios de <marca>". */
  onHideAdvertiser(ad: FeedAd): void;
  /** Tocar el nombre/logo de un anunciante interno (gimnasio/entrenador con perfil). */
  onAdvertiserClick(ad: FeedAd): void;
  /** Primera vez que esta tarjeta entra en viewport (para registrar la impresión una sola vez). */
  onImpression(ad: FeedAd): void;
}

function mediaHtml(ad: FeedAd): string {
  if (!ad.mediaUrl) return "";
  if (ad.mediaType === "video") {
    // Con controles y sin autoplay: un anuncio que arranca solo con sonido molesta;
    // sin sonido no comunica. Que el usuario decida.
    return `<div class="feed-ad-media-wrap">
      <video class="feed-ad-media" src="${escapeHtml(ad.mediaUrl)}" playsinline muted controls preload="metadata"></video>
    </div>`;
  }
  // La imagen SÍ es zona de clic al CTA (como en Instagram/Twitter).
  return `<button type="button" class="feed-ad-media-wrap" data-action="ad-cta" aria-label="Ver más">
    <img class="feed-ad-media" src="${escapeHtml(ad.mediaUrl)}" alt="" draggable="false" loading="lazy" decoding="async">
  </button>`;
}

/**
 * Tarjeta de anuncio "standalone" (creativo propio de una marca) para intercalar en el feed.
 * El Rep promocionado (creativeKind='post') se renderiza aparte reusando renderPostCard (Fase 3).
 */
export function renderAdCard(ad: FeedAd): string {
  const name = escapeHtml(ad.advertiserName);
  const isLinkable = ad.advertiserKind === "profile" && !!ad.advertiserUsername;
  const headline = ad.headline ? `<p class="feed-ad-headline">${escapeHtml(ad.headline)}</p>` : "";
  const body = ad.bodyText ? `<p class="feed-ad-text">${escapeHtml(ad.bodyText)}</p>` : "";
  const cta = ad.ctaUrl
    ? `<a class="feed-ad-cta" data-action="ad-cta" href="${escapeHtml(ad.ctaUrl)}" target="_blank" rel="noopener sponsored nofollow">
         ${escapeHtml(ad.ctaLabel || "Ver más")}<span aria-hidden="true">→</span>
       </a>`
    : "";

  return `
    <article class="feed-ad-card" data-campaign-id="${escapeHtml(ad.campaignId)}">
      <div class="feed-ad-top">
        <button type="button" class="feed-ad-identity" data-action="ad-advertiser"${isLinkable ? "" : " disabled"}>
          <img class="feed-ad-logo" src="${escapeHtml(ad.advertiserLogoUrl || DEFAULT_LOGO)}" alt="" draggable="false">
          <span class="feed-ad-identity-text">
            <span class="feed-ad-name">${name}</span>
            <span class="feed-ad-label">Publicidad</span>
          </span>
        </button>
        <div class="profile-menu-wrap">
          <button type="button" class="profile-menu-btn" data-action="ad-menu" aria-label="Opciones del anuncio">${ICON_DOTS}</button>
          <div class="profile-menu-panel" hidden>
            <button type="button" class="profile-menu-item" data-action="ad-hide-campaign">Ocultar este anuncio</button>
            <button type="button" class="profile-menu-item" data-action="ad-hide-advertiser">Ocultar anuncios de ${name}</button>
          </div>
        </div>
      </div>
      ${headline || body ? `<div class="feed-ad-body">${headline}${body}</div>` : ""}
      ${mediaHtml(ad)}
      ${cta}
    </article>
  `;
}

/**
 * Rep promocionado (creativeKind='post'): la tarjeta ES el Rep -- se reusa renderPostCard tal
 * cual (mantiene me gusta / comentar / repostear, es un Rep de verdad) y se lo envuelve con una
 * cinta "Publicidad · <anunciante>" arriba y el mismo menú de ocultar. El click al Rep y sus
 * botones los engancha el wirePostCard normal de la página; wireAdCards solo agrega la cinta.
 */
export function renderPromotedPostCard(ad: FeedAd, post: FeedPost, viewerId: string | null): string {
  const name = escapeHtml(ad.advertiserName);
  const isLinkable = ad.advertiserKind === "profile" && !!ad.advertiserUsername;
  return `
    <article class="feed-promoted" data-campaign-id="${escapeHtml(ad.campaignId)}">
      <div class="feed-promoted-head">
        <button type="button" class="feed-promoted-by" data-action="ad-advertiser"${isLinkable ? "" : " disabled"}>
          <span class="feed-ad-label">Publicidad</span>
          <span class="feed-promoted-name">· ${name}</span>
        </button>
        <div class="profile-menu-wrap">
          <button type="button" class="profile-menu-btn" data-action="ad-menu" aria-label="Opciones del anuncio">${ICON_DOTS}</button>
          <div class="profile-menu-panel" hidden>
            <button type="button" class="profile-menu-item" data-action="ad-hide-campaign">Ocultar este anuncio</button>
            <button type="button" class="profile-menu-item" data-action="ad-hide-advertiser">Ocultar anuncios de ${name}</button>
          </div>
        </div>
      </div>
      ${renderPostCard(post, viewerId)}
    </article>
  `;
}

/**
 * Engancha los listeners de las tarjetas de anuncio ya renderizadas dentro de `root`.
 * Devuelve un disposer (aborta listeners + corta el IntersectionObserver de impresiones).
 * El caller lo TIENE que registrar y llamarlo antes de un re-render que pise las tarjetas.
 *
 * `firedImpressions` es compartido por toda la sesión de feed: una impresión por campaña
 * y por carga de página, aunque la tarjeta entre y salga del viewport varias veces o
 * aparezca en varias tandas de scroll.
 */
export function wireAdCards(
  root: HTMLElement,
  ads: FeedAd[],
  handlers: AdCardHandlers,
  firedImpressions: Set<string>
): () => void {
  const adsByCampaign = new Map(ads.map((a) => [a.campaignId, a]));
  const ac = new AbortController();
  const opt = { signal: ac.signal };

  root.querySelectorAll<HTMLElement>(AD_CARD_SELECTOR).forEach((card) => {
    const ad = adsByCampaign.get(card.dataset.campaignId!);
    if (!ad) return;

    card.querySelectorAll<HTMLElement>('[data-action="ad-cta"]').forEach((el) => {
      el.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          handlers.onAdClick(ad);
        },
        opt
      );
    });

    card.querySelector<HTMLButtonElement>('[data-action="ad-advertiser"]')?.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        handlers.onAdvertiserClick(ad);
      },
      opt
    );

    const menuBtn = card.querySelector<HTMLButtonElement>('[data-action="ad-menu"]');
    const menuPanel = card.querySelector<HTMLElement>(".profile-menu-panel");
    menuBtn?.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        if (!menuPanel) return;
        menuPanel.hidden = !menuPanel.hidden;
        menuBtn.classList.toggle("open", !menuPanel.hidden);
      },
      opt
    );
    // Tocar afuera cierra el menú.
    document.addEventListener(
      "click",
      (e) => {
        if (menuPanel && !menuPanel.hidden && !card.contains(e.target as Node)) {
          menuPanel.hidden = true;
          menuBtn?.classList.remove("open");
        }
      },
      opt
    );
    menuPanel?.querySelector('[data-action="ad-hide-campaign"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.onHideCampaign(ad);
    }, opt);
    menuPanel?.querySelector('[data-action="ad-hide-advertiser"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.onHideAdvertiser(ad);
    }, opt);
  });

  // Impresiones: una sola vez por campaña cuando la tarjeta se ve de verdad. Un Rep promocionado
  // puede ser más alto que la pantalla y nunca llegar al 50% -- por eso también cuenta si llena
  // media pantalla.
  const pendingCards = [...root.querySelectorAll<HTMLElement>(AD_CARD_SELECTOR)].filter(
    (card) => !firedImpressions.has(card.dataset.campaignId!)
  );
  let impressionObserver: IntersectionObserver | null = null;
  if (pendingCards.length) {
    impressionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const seen = entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight * 0.5;
          if (!seen) continue;
          const card = entry.target as HTMLElement;
          const campaignId = card.dataset.campaignId!;
          impressionObserver!.unobserve(card);
          if (firedImpressions.has(campaignId)) continue;
          firedImpressions.add(campaignId);
          const ad = adsByCampaign.get(campaignId);
          if (ad) handlers.onImpression(ad);
        }
      },
      { threshold: [0.25, 0.5] }
    );
    pendingCards.forEach((card) => impressionObserver!.observe(card));
  }

  return () => {
    ac.abort();
    impressionObserver?.disconnect();
  };
}
