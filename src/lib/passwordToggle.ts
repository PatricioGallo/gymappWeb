/** Botón "ver contraseña" (ojito) para cada <input type="password"> envuelto en .password-field
 * (ver login.html/register.html). No-op en páginas sin ese markup. */
export function setupPasswordToggles(): void {
  document.querySelectorAll<HTMLButtonElement>(".password-toggle").forEach((btn) => {
    const input = btn.closest(".password-field")?.querySelector<HTMLInputElement>("input");
    if (!input) return;
    const eyeIcon = btn.querySelector<SVGElement>(".password-toggle-eye");
    const eyeOffIcon = btn.querySelector<SVGElement>(".password-toggle-eye-off");

    btn.addEventListener("click", () => {
      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";
      // Ojo tachado = contraseña oculta (estado actual), ojo abierto = se esta mostrando.
      eyeIcon?.toggleAttribute("hidden", !willShow);
      eyeOffIcon?.toggleAttribute("hidden", willShow);
      btn.setAttribute("aria-label", willShow ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  });
}
