// Reemplazo del <select> nativo para listas cortas de opciones (ej. "orden": mas
// recientes/antiguos): el popup nativo de un <select> es renderizado por el sistema
// operativo y no se puede redondear/estilar para que combine con el resto del sitio (se ve
// como un rectangulo comun aunque el trigger sea una pildora). Este helper arma un
// boton+panel con las mismas clases que ya usa el menu de tres puntos del perfil
// (.profile-menu-panel/.profile-menu-item), asi el dropdown se ve igual de "profesional".

export interface DropdownOption {
  value: string;
  label: string;
}

/** Engancha un trigger+panel ya presentes en el DOM (ver markup de socios.ts/entrenadores.ts).
 * signal: para que el listener de "click afuera cierra" se saque solo al desmontar la vista,
 * mismo patron que el resto del shell (ver ctx.signal). */
export function wireCustomDropdown(
  triggerId: string,
  panelId: string,
  options: DropdownOption[],
  initialValue: string,
  onChange: (value: string) => void,
  signal: AbortSignal
): void {
  const trigger = document.getElementById(triggerId) as HTMLButtonElement | null;
  const panel = document.getElementById(panelId);
  if (!trigger || !panel) return;

  let value = initialValue;
  const CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>`;

  function labelFor(v: string): string {
    return options.find((o) => o.value === v)?.label ?? "";
  }

  function paintTrigger(): void {
    trigger!.innerHTML = `<span>${labelFor(value)}</span>${CHEVRON}`;
  }

  function renderPanel(): void {
    panel!.innerHTML = options
      .map((o) => `<button type="button" class="profile-menu-item" data-value="${o.value}">${o.label}</button>`)
      .join("");
    panel!.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        value = btn.dataset.value!;
        paintTrigger();
        panel!.hidden = true;
        trigger!.setAttribute("aria-expanded", "false");
        onChange(value);
      });
    });
  }

  paintTrigger();
  renderPanel();

  trigger.addEventListener(
    "click",
    () => {
      const willOpen = panel!.hidden;
      panel!.hidden = !willOpen;
      trigger!.setAttribute("aria-expanded", String(willOpen));
    },
    { signal }
  );

  document.addEventListener(
    "click",
    (e) => {
      if (panel!.hidden) return;
      const target = e.target as Node;
      if (trigger!.contains(target) || panel!.contains(target)) return;
      panel!.hidden = true;
      trigger!.setAttribute("aria-expanded", "false");
    },
    { signal }
  );
}
