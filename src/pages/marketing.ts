import { setupNavToggle, setupRevealObserver, redirectIfAuthenticated } from "../lib/nav";

redirectIfAuthenticated();
setupNavToggle();
setupRevealObserver();
