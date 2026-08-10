// No pueden usarse como username porque colisionarian con una pagina real
// (pages/*.html), una carpeta publica (/css, /images) o un archivo de
// infraestructura (/robots.txt, /404.html), o porque generarian confusion
// de marca al aparecer en gymsocial.com.ar/<username>.
export const RESERVED_USERNAMES = new Set([
  // pages/*.html
  "about",
  "addexc",
  "admin",
  "contact",
  "deleterutins",
  "excview",
  "exit",
  "login",
  "pesos",
  "profile",
  "progress",
  "register",
  "rutinsview",
  "services",
  "showexc",
  "terms",
  // raiz / carpetas publicas / infraestructura
  "index",
  "home",
  "css",
  "images",
  "assets",
  "src",
  "public",
  "cname",
  "robots",
  "sitemap",
  "favicon",
  "api",
  "www",
  "static",
  // reservado por si en el futuro se usa un esquema /u/<username>
  "u",
  // varios
  "null",
  "undefined",
  "help",
  "support",
  "gymsocial",
]);

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}
