// chat.html?c=ID fue reemplazada por la vista fusionada de chats.html?c=ID (Fase 4 de la
// migracion a SPA -- ver chats.ts). Esta pagina se deja como redirect de compatibilidad para
// bookmarks viejos y, sobre todo, para el payload de las push notifications de mensajes (se
// arma en un backend fuera de este repo; hasta que se actualice a apuntar directo a
// chats.html, este redirect cubre el caso).
const id = new URLSearchParams(location.search).get("c");
location.replace(id ? `chats.html?c=${encodeURIComponent(id)}` : "chats.html");
