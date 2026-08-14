import { signOut } from "../services/auth.service";
import { clearChatCache } from "../lib/chatDb";

await Promise.all([signOut(), clearChatCache()]);
window.location.href = "../index.html";
