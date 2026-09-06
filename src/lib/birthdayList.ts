import { escapeHtml } from "./dom";
import { renderVerifiedBadge } from "./verifiedBadge";
import { smartNavigate } from "../shell/router";
import { birthdayWhenLabel, type UpcomingBirthday } from "../services/birthday.service";

const DEFAULT_AVATAR = "/images/avatars/default.svg";

function rowHtml(b: UpcomingBirthday, showAge: boolean): string {
  const fullName = `${b.nombre} ${b.apellido}`.trim() || b.username;
  const meta = showAge && b.turningAge > 0 ? `${birthdayWhenLabel(b)} · cumple ${b.turningAge}` : birthdayWhenLabel(b);
  return `
    <button type="button" class="birthday-row" data-username="${encodeURIComponent(b.username)}">
      <img src="${escapeHtml(b.avatarUrl || DEFAULT_AVATAR)}" alt="" class="birthday-row-avatar" draggable="false">
      <span class="birthday-row-body">
        <span class="birthday-row-name">${escapeHtml(fullName)}${renderVerifiedBadge(b.userType, b.isVerified)}</span>
        <span class="birthday-row-meta">${escapeHtml(meta)}</span>
      </span>
      ${b.isToday ? `<span class="birthday-row-cake" aria-hidden="true">🎂</span>` : ""}
    </button>
  `;
}

/** HTML de una tanda de filas de cumpleaños. `showAge` agrega "· cumple N" al meta. */
export function renderBirthdayRows(list: UpcomingBirthday[], showAge = false): string {
  return list.map((b) => rowHtml(b, showAge)).join("");
}

/** Engancha el click de cada `.birthday-row` dentro de `container` -> perfil. */
export function wireBirthdayRows(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>(".birthday-row").forEach((row) => {
    row.addEventListener("click", () => smartNavigate(`profile.html?u=${row.dataset.username}`));
  });
}
