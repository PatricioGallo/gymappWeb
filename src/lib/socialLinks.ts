export type SocialPlatformKey = "instagram" | "facebook" | "whatsapp" | "tiktok" | "youtube" | "x" | "other";

export interface SocialPlatform {
  key: SocialPlatformKey;
  label: string;
  icon: string;
  /** Placeholder del input de handle/numero. No aplica a "other" (usa label+url libres). */
  placeholder: string;
  inputPrefix?: string;
  /** Arma la URL final a partir de lo que tipeo el usuario (handle, @usuario, numero, o un link pegado entero). Null si quedo vacio. */
  buildUrl: (input: string) => string | null;
  /** Reconstruye lo que hay que mostrar en el input a partir de la URL guardada (best-effort). */
  extractHandle: (url: string) => string;
}

function cleanHandleInput(raw: string): string {
  // Acepta "usuario", "@usuario", "https://instagram.com/usuario" o incluso
  // "instagram.com/usuario" (dominio pegado sin protocolo): en todos los casos
  // el handle real es el ultimo segmento no vacio de la ruta.
  let v = raw.trim().split("?")[0].split("#")[0];
  v = v.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const parts = v.split("/").filter(Boolean);
  v = parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? v);
  return v.replace(/^@/, "").trim();
}

function handleFromUrl(url: string, host: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.replace(/^www\./, "").includes(host)) return url;
    return decodeURIComponent(u.pathname.replace(/^\/+|\/+$/g, "").replace(/^@/, ""));
  } catch {
    return url;
  }
}

const LINK_ICON = `<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>`;

export const OTHER_PLATFORM: SocialPlatform = {
  key: "other",
  label: "Otro",
  icon: LINK_ICON,
  placeholder: "https://tu-sitio.com",
  buildUrl: (input) => (input.trim() ? input.trim() : null),
  extractHandle: (url) => url,
};

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    key: "instagram",
    label: "Instagram",
    icon: `<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/>`,
    placeholder: "tuusuario",
    inputPrefix: "instagram.com/",
    buildUrl: (input) => {
      const handle = cleanHandleInput(input);
      return handle ? `https://instagram.com/${handle}` : null;
    },
    extractHandle: (url) => handleFromUrl(url, "instagram.com"),
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: `<circle cx="12" cy="12" r="9"/><path d="M13.5 21v-6.5h2.1l.3-2.6h-2.4V10c0-.8.2-1.3 1.3-1.3H16V6.1c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H7.9v2.6H10V21" fill="none"/>`,
    placeholder: "tuusuario",
    inputPrefix: "facebook.com/",
    buildUrl: (input) => {
      const handle = cleanHandleInput(input);
      return handle ? `https://facebook.com/${handle}` : null;
    },
    extractHandle: (url) => handleFromUrl(url, "facebook.com"),
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: `<path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Z"/><path d="M8.3 8.1c.2-.4.4-.4.6-.4h.4c.2 0 .4 0 .5.4.2.4.6 1.4.6 1.5.1.1.1.3 0 .4-.1.2-.2.3-.3.4-.1.2-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1.9 1.9 1.2 2.3 1.4.3.1.4.1.6-.1.2-.2.6-.7.8-1 .2-.2.4-.2.6-.1.2.1 1.4.6 1.6.7.3.1.4.2.5.3 0 .2 0 .8-.3 1.5-.3.7-1.5 1.3-2.1 1.4-.6.1-1.3.2-4-1S9 15.3 8 14c-.2-.2-1.6-2-1.6-4 0-.3 0-.8.2-1.2z" fill="currentColor" stroke="none"/>`,
    placeholder: "+54 9 11 1234 5678",
    buildUrl: (input) => {
      const digits = input.replace(/\D/g, "");
      return digits ? `https://wa.me/${digits}` : null;
    },
    extractHandle: (url) => {
      const m = /wa\.me\/(\d+)/i.exec(url);
      return m ? m[1] : url;
    },
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: `<path d="M14 3v10.3a3.3 3.3 0 1 1-2.8-3.3V12a1.3 1.3 0 1 0 1.1 1.3V3z" fill="currentColor" stroke="none"/><path d="M14 3a4.8 4.8 0 0 0 4.7 4.3V9.6A7.9 7.9 0 0 1 14 8.1z" fill="currentColor" stroke="none"/>`,
    placeholder: "tuusuario",
    inputPrefix: "tiktok.com/@",
    buildUrl: (input) => {
      const handle = cleanHandleInput(input);
      return handle ? `https://tiktok.com/@${handle}` : null;
    },
    extractHandle: (url) => handleFromUrl(url, "tiktok.com"),
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: `<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.3v5.4l4.8-2.7z" fill="currentColor" stroke="none"/>`,
    placeholder: "tucanal",
    inputPrefix: "youtube.com/@",
    buildUrl: (input) => {
      const handle = cleanHandleInput(input);
      return handle ? `https://youtube.com/@${handle}` : null;
    },
    extractHandle: (url) => handleFromUrl(url, "youtube.com"),
  },
  {
    key: "x",
    label: "X",
    icon: `<path d="M5 5l14 14M19 5L5 19"/>`,
    placeholder: "tuusuario",
    inputPrefix: "x.com/",
    buildUrl: (input) => {
      const handle = cleanHandleInput(input);
      return handle ? `https://x.com/${handle}` : null;
    },
    extractHandle: (url) => handleFromUrl(url, "x.com") || handleFromUrl(url, "twitter.com"),
  },
];

export const ALL_PLATFORMS: SocialPlatform[] = [...SOCIAL_PLATFORMS, OTHER_PLATFORM];

export function getPlatform(key: string | undefined): SocialPlatform {
  return ALL_PLATFORMS.find((p) => p.key === key) ?? OTHER_PLATFORM;
}
