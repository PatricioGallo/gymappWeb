import { signOut } from "../services/auth.service";
import { clearChatCache } from "../lib/chatDb";
import { clearProfileCache } from "../lib/profileDb";
import { clearFeedCache } from "../lib/feedDb";

await Promise.all([signOut(), clearChatCache(), clearProfileCache(), clearFeedCache()]);
window.location.href = "../index.html";
