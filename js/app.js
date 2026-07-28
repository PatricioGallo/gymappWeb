// GymApp — paginas publicas (index.html y pages/*.html)

// Si ya hay sesion iniciada, vamos directo al area personal.
// (variable con prefijo propio para no chocar con el "gymapp_id" que
// declaran los scripts especificos de cada pagina, ej. login.js, main.js)
const gymappAppJsSessionId = localStorage.getItem("gymapp_id");
if (gymappAppJsSessionId != null) {
    const enPages = location.pathname.includes("/pages/");
    window.location.href = enPages ? "profile.html" : "pages/profile.html";
}

// Menu mobile
const navToggle = document.getElementById("navToggle");
const siteNav = document.getElementById("siteNav");

if (navToggle && siteNav) {
    navToggle.addEventListener("click", () => {
        const isOpen = siteNav.classList.toggle("open");
        navToggle.classList.toggle("open", isOpen);
        navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    // Delegado en el contenedor (no en cada <a>) para que tambien funcione
    // con links agregados dinamicamente despues de esta carga inicial.
    siteNav.addEventListener("click", (e) => {
        if (!e.target.closest("a")) return;
        siteNav.classList.remove("open");
        navToggle.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
    });
}

// Reveal on scroll. Con MutationObserver por si en el futuro se agrega
// contenido ".reveal" de forma dinamica despues de la carga inicial.
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
