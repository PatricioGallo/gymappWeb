import { escapeHtml } from "./dom";
import { renderVerifiedBadge } from "./verifiedBadge";
import { formatTiempoRelativo } from "./dias";
import { resultFullName } from "./search";
import { ICON_HEART, ICON_HEART_FILLED } from "./postCard";
import type { FeedComment } from "../services/post.service";

const DEFAULT_AVATAR = "/images/avatars/default.svg";

export interface CommentListHandlers {
  viewerId: string;
  onAuthorClick(username: string): void;
  onLikeToggle(comment: FeedComment): void;
  onReplyClick(comment: FeedComment): void;
  onDeleteClick(comment: FeedComment): void;
}

// Arbol armado en el cliente a partir de la lista plana (parent_comment_id): permite responder
// un comentario puntual y que las respuestas queden anidadas debajo, formando hilos.
export function buildCommentTree(rows: FeedComment[]): Map<string | null, FeedComment[]> {
  const byParent = new Map<string | null, FeedComment[]>();
  for (const c of rows) {
    const key = c.parent_comment_id;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }
  return byParent;
}

// El boton de borrar arranca oculto: wireCommentsList lo muestra solo si el comentario es del
// viewer (necesita el viewerId, que no esta disponible aca en el render puro).
function commentRowHtml(c: FeedComment, depth: number): string {
  return `
    <div class="post-comment" data-id="${c.id}" style="margin-left:${Math.min(depth, 6) * 24}px">
      <button type="button" class="post-comment-avatar-btn" data-action="author" data-username="${escapeHtml(c.author.username)}" aria-label="Ver perfil de ${escapeHtml(c.author.username)}">
        <img class="post-comment-avatar" src="${escapeHtml(c.author.avatarUrl || DEFAULT_AVATAR)}" alt="">
      </button>
      <div class="post-comment-body">
        <div class="post-comment-head">
          <button type="button" class="post-comment-name" data-action="author" data-username="${escapeHtml(c.author.username)}">${escapeHtml(resultFullName(c.author))}${renderVerifiedBadge(c.author.userType, c.author.isVerified, 12)}</button>
          <span class="post-comment-username">@${escapeHtml(c.author.username)}</span>
          <span class="post-comment-dot">·</span>
          <span class="post-comment-time">${formatTiempoRelativo(c.created_at)}</span>
        </div>
        <p class="post-comment-text">${escapeHtml(c.content).replace(/\n/g, "<br>")}</p>
        <div class="post-comment-actions">
          <button type="button" class="post-comment-reply" data-action="reply" data-id="${c.id}">Responder</button>
          <button type="button" class="post-comment-like${c.likedByMe ? " is-active" : ""}" data-action="like" data-id="${c.id}" aria-label="Me gusta">${c.likedByMe ? ICON_HEART_FILLED : ICON_HEART}<span>${c.likes_count}</span></button>
        </div>
      </div>
      <button type="button" class="post-comment-delete" data-action="delete" data-id="${c.id}" aria-label="Eliminar comentario" hidden>✕</button>
    </div>
  `;
}

function renderCommentBranch(byParent: Map<string | null, FeedComment[]>, parentId: string | null, depth: number): string {
  const children = byParent.get(parentId) ?? [];
  return children.map((c) => commentRowHtml(c, depth) + renderCommentBranch(byParent, c.id, depth + 1)).join("");
}

/** HTML de la lista completa de comentarios (arbol), o el estado vacio si no hay ninguno. */
export function renderCommentsHtml(comments: FeedComment[]): string {
  if (comments.length === 0) return `<p class="exc-pick-empty post-comments-empty">Sé el primero en comentar.</p>`;
  const byParent = buildCommentTree(comments);
  return renderCommentBranch(byParent, null, 0);
}

/** Engancha los listeners de una lista ya pintada con renderCommentsHtml() adentro de `root`. */
export function wireCommentsList(root: HTMLElement, comments: FeedComment[], handlers: CommentListHandlers): void {
  const byId = new Map(comments.map((c) => [c.id, c]));

  root.querySelectorAll<HTMLButtonElement>('[data-action="author"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const username = btn.dataset.username;
      if (username) handlers.onAuthorClick(username);
    });
  });

  root.querySelectorAll<HTMLButtonElement>(".post-comment-delete").forEach((btn) => {
    const comment = byId.get(btn.dataset.id!);
    if (!comment) return;
    if (comment.author_id === handlers.viewerId) btn.hidden = false;
    btn.addEventListener("click", () => handlers.onDeleteClick(comment));
  });

  root.querySelectorAll<HTMLButtonElement>('[data-action="reply"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const comment = byId.get(btn.dataset.id!);
      if (comment) handlers.onReplyClick(comment);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-action="like"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const comment = byId.get(btn.dataset.id!);
      if (comment) handlers.onLikeToggle(comment);
    });
  });
}

/** Borrar un comentario con respuestas las borra tambien en la base (cascade); usado para reflejar lo mismo del lado local antes del proximo refresh. */
export function collectCommentAndDescendantIds(comments: FeedComment[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  let added = true;
  while (added) {
    added = false;
    for (const c of comments) {
      if (c.parent_comment_id && ids.has(c.parent_comment_id) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }
  return ids;
}
