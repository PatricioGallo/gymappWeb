import { signOut } from "../services/auth.service";

await signOut();
window.location.href = "../index.html";
