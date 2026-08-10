// Mismos tokens que public/css/modern.css (:root) en la web, para que la app
// mobile se vea igual (fondo, tarjetas, botones, textos).
export const colors = {
  bg: "#0a0c0f",
  surface: "#14171c",
  surface2: "#20262f",
  border: "#333b47",
  text: "#f4f5f6",
  textMuted: "#b6bdc7",
  accent: "#ff4d4d",
  accent2: "#ff8a3d",
  accentSoft: "rgba(255, 77, 77, 0.14)",
  errorText: "#ffc2c2",
  errorBg: "rgba(255, 90, 90, 0.08)",
  errorBorder: "rgba(255, 90, 90, 0.35)",
  errorStripe: "#ff5a5a",
  overlayBg: "rgba(10, 12, 15, 0.82)",
  verifiedBlue: "#3897f0",
  verifiedGreen: "#22c55e",
  live: "#2fd971",
  liveSoft: "rgba(47, 217, 113, 0.14)",
  dangerText: "#ff8a8a",
  dangerBorder: "rgba(255, 90, 90, 0.4)",
  dangerSoft: "rgba(255, 90, 90, 0.12)",
  menuDangerText: "#f04438",
} as const;

export const radius = {
  card: 16,
  input: 10,
  pill: 999,
} as const;
