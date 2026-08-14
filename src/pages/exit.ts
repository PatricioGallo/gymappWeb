import { signOut } from "../services/auth.service";
import { clearChatCache } from "../lib/chatDb";
import { clearProfileCache } from "../lib/profileDb";

await Promise.all([signOut(), clearChatCache(), clearProfileCache()]);
window.location.href = "../index.html";
