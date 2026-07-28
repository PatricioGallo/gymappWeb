// GymApp — UI compartida para paginas ya autenticadas (pages/profile.html y afines).
// A diferencia de app.js, este script NO redirige segun localStorage: en estas
// paginas ya estamos logueados, y app.js redirigiria a profile.html en loop
// si se lo incluyera aca.

// Menu mobile
const navToggle = document.getElementById("navToggle");
const siteNav = document.getElementById("siteNav");

if (navToggle && siteNav) {
    navToggle.addEventListener("click", () => {
        const isOpen = siteNav.classList.toggle("open");
        navToggle.classList.toggle("open", isOpen);
        navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    siteNav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            siteNav.classList.remove("open");
            navToggle.classList.remove("open");
            navToggle.setAttribute("aria-expanded", "false");
        });
    });
}

// Reveal on scroll. Usa un MutationObserver ademas del IntersectionObserver
// porque en estas paginas el contenido ".reveal" suele llegar despues (main.js
// lo inserta recien cuando resuelve el fetch a la API) y no existe todavia
// cuando este script corre por primera vez.
function setupRevealObserver() {
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

    const observe = (el) => observer.observe(el);
    document.querySelectorAll(".reveal").forEach(observe);

    const mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                if (node.classList && node.classList.contains("reveal")) observe(node);
                if (node.querySelectorAll) node.querySelectorAll(".reveal").forEach(observe);
            });
        });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
}

setupRevealObserver();
