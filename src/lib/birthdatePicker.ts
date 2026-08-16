const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

// Nadie que se registra hoy nacio antes de esto ni es menor de 1 año -- acota el año a un rango
// razonable en vez de arrastrar un siglo entero de opciones.
const MAX_AGE_YEARS = 100;
const MIN_AGE_YEARS = 1;

const CARET_PATH = `<path d="m6 9 6 6 6-6"/>`;

export interface BirthdatePickerIds {
  dayId: string;
  monthId: string;
  yearId: string;
  hiddenId: string;
}

interface PickerOption {
  value: string;
  label: string;
}

function optionsHtml(pickerId: string, options: PickerOption[], selectedValue?: string): string {
  return options
    .map(
      (o) => `
        <li id="${pickerId}-opt-${o.value}" class="birthdate-picker-option${o.value === selectedValue ? " active" : ""}" role="option" data-value="${o.value}" aria-selected="${o.value === selectedValue}">${o.label}</li>
      `
    )
    .join("");
}

function pickerHtml(id: string, ariaLabel: string, placeholder: string, options: PickerOption[], selectedValue?: string): string {
  const selected = options.find((o) => o.value === selectedValue);
  return `
    <div class="birthdate-picker" id="${id}">
      <button type="button" class="birthdate-picker-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${ariaLabel}">
        <span class="birthdate-picker-value${selected ? "" : " placeholder"}">${selected ? selected.label : placeholder}</span>
        <svg class="birthdate-picker-caret" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CARET_PATH}</svg>
      </button>
      <ul class="birthdate-picker-list" role="listbox" hidden>${optionsHtml(id, options, selectedValue)}</ul>
    </div>
  `;
}

/**
 * 3 dropdowns propios (día/mes/año), no <select> nativos: un <select> con 31 o 100 opciones no
 * deja limitar cuántas se ven antes de scrollear (ni sacarle la scrollbar en todos los
 * navegadores -- el popup es del sistema operativo en Firefox/Safari, el CSS no llega ahí). Una
 * lista armada a mano sí lo permite: hasta 5 opciones visibles, el resto scrollea (ver
 * max-height de .birthdate-picker-list en el CSS). Terminan sincronizados en un <input type="hidden"> con
 * el mismo id/formato "YYYY-MM-DD" que antes tenía el <input type="date">, así el resto del
 * código (register.ts/settings.ts, validación de edad incluida) sigue igual.
 */
export function birthdateFieldHtml(ids: BirthdatePickerIds, initialValue?: string | null): string {
  const [yRaw, mRaw, dRaw] = (initialValue ?? "").split("-");
  const d = dRaw ? String(Number(dRaw)) : undefined;
  const m = mRaw ? String(Number(mRaw)) : undefined;
  const y = yRaw || undefined;

  const dayOptions: PickerOption[] = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  const monthOptions: PickerOption[] = MONTHS.map((name, i) => ({ value: String(i + 1), label: name }));
  const currentYear = new Date().getFullYear();
  const yearOptions: PickerOption[] = Array.from({ length: MAX_AGE_YEARS - MIN_AGE_YEARS + 1 }, (_, i) => {
    const year = currentYear - MIN_AGE_YEARS - i;
    return { value: String(year), label: String(year) };
  });

  return `
    <div class="birthdate-select-row">
      ${pickerHtml(ids.dayId, "Día", "Día", dayOptions, d)}
      ${pickerHtml(ids.monthId, "Mes", "Mes", monthOptions, m)}
      ${pickerHtml(ids.yearId, "Año", "Año", yearOptions, y)}
    </div>
    <input type="hidden" id="${ids.hiddenId}" value="${initialValue ?? ""}">
  `;
}

/** Engancha los 3 dropdowns armados por birthdateFieldHtml (abrir/cerrar, click, teclado,
 * sincronizar el input oculto). No-op si falta el markup. */
export function setupBirthdatePicker(ids: BirthdatePickerIds): void {
  const hiddenEl = document.getElementById(ids.hiddenId) as HTMLInputElement | null;
  const pickerEls = [ids.dayId, ids.monthId, ids.yearId].map((id) => document.getElementById(id));
  if (!hiddenEl || pickerEls.some((el) => !el)) return;
  const [dayEl, monthEl, yearEl] = pickerEls as HTMLElement[];

  const pickerValues = new Map<HTMLElement, string>();

  function sync(): void {
    const d = pickerValues.get(dayEl) ?? "";
    const m = pickerValues.get(monthEl) ?? "";
    const y = pickerValues.get(yearEl) ?? "";
    hiddenEl!.value = d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
  }

  function closeAll(): void {
    pickerEls.forEach((el) => {
      el!.classList.remove("open");
      el!.querySelector<HTMLUListElement>(".birthdate-picker-list")!.hidden = true;
      el!.querySelector<HTMLButtonElement>(".birthdate-picker-btn")!.setAttribute("aria-expanded", "false");
    });
  }

  [dayEl, monthEl, yearEl].forEach((el) => {
    const btn = el.querySelector<HTMLButtonElement>(".birthdate-picker-btn")!;
    const list = el.querySelector<HTMLUListElement>(".birthdate-picker-list")!;
    const valueEl = el.querySelector<HTMLSpanElement>(".birthdate-picker-value")!;
    const options = Array.from(list.querySelectorAll<HTMLLIElement>(".birthdate-picker-option"));

    const initiallySelected = options.find((o) => o.classList.contains("active"));
    if (initiallySelected) pickerValues.set(el, initiallySelected.dataset.value!);

    let highlighted = Math.max(
      0,
      options.findIndex((o) => o.classList.contains("active"))
    );

    function highlight(idx: number): void {
      options[highlighted]?.classList.remove("highlight");
      highlighted = Math.max(0, Math.min(options.length - 1, idx));
      const opt = options[highlighted];
      opt?.classList.add("highlight");
      opt?.scrollIntoView({ block: "nearest" });
      btn.setAttribute("aria-activedescendant", opt?.id ?? "");
    }

    function choose(opt: HTMLLIElement): void {
      options.forEach((o) => {
        o.classList.remove("active");
        o.setAttribute("aria-selected", "false");
      });
      opt.classList.add("active");
      opt.setAttribute("aria-selected", "true");
      valueEl.textContent = opt.textContent;
      valueEl.classList.remove("placeholder");
      pickerValues.set(el, opt.dataset.value!);
      sync();
    }

    function open(): void {
      closeAll();
      list.hidden = false;
      el.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      highlight(highlighted);
    }

    function close(): void {
      list.hidden = true;
      el.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }

    btn.addEventListener("click", () => (list.hidden ? open() : close()));

    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (list.hidden) open();
        else highlight(highlighted + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (list.hidden) open();
        else highlight(highlighted - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (list.hidden) open();
        else {
          choose(options[highlighted]);
          close();
        }
      } else if (e.key === "Escape" && !list.hidden) {
        e.preventDefault();
        close();
      }
    });

    options.forEach((opt, idx) => {
      opt.addEventListener("click", () => {
        choose(opt);
        close();
        btn.focus();
      });
      opt.addEventListener("mouseenter", () => highlight(idx));
    });
  });

  document.addEventListener("click", (e) => {
    if (![dayEl, monthEl, yearEl].some((el) => el.contains(e.target as Node))) closeAll();
  });

  sync();
}
