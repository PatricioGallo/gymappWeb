import { supabase } from "./supabaseClient";

export function setupNavToggle(): void {
  const navToggle = document.getElementById("navToggle");
  const siteNav = document.getElementById("siteNav");
  if (!navToggle || !siteNav) return;

  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    navToggle.classList.toggle("open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest("a")) return;
    siteNav.classList.remove("open");
    navToggle.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  });
}

export function setupRevealObserver(): void {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  const observe = (el: Element) => observer.observe(el);
  document.querySelectorAll(".reveal").forEach(observe);

  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        const el = node as Element;
        if (el.classList?.contains("reveal")) observe(el);
        el.querySelectorAll?.(".reveal").forEach(observe);
      });
    });
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

export async function redirectIfAuthenticated(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const enPages = location.pathname.includes("/pages/");
  window.location.href = enPages ? "profile.html" : "pages/profile.html";
}

/** Para paginas que requieren sesion iniciada: devuelve el user id o redirige a login.html. */
export async function requireAuth(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) {
    window.location.href = "login.html";
    throw new Error("not authenticated");
  }
  return userId;
}
