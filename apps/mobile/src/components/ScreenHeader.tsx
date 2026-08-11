import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/profile/Avatar";
import { Logo } from "@/components/Logo";
import { signOut } from "@/lib/authService";
import { getUnreadConversationCount } from "@/lib/chatService";
import { getUnreadNotificationCount, markAllNotificationsRead } from "@/lib/notificationService";
import { colors } from "@/theme/colors";

import { ActionMenu, type ActionMenuItem } from "./ActionMenu";

const AVATAR_MENU_ITEMS: ActionMenuItem[] = [{ label: "Cerrar sesión", onPress: () => signOut(), danger: true }];

// Igual que en la web (src/lib/notifications.ts): polling, no realtime.
const POLL_INTERVAL_MS = 60000;

/**
 * Header consistente en todas las pantallas: flecha atrás (si aplica) +
 * título centrado (o el logo, en el perfil) + lupa de búsqueda, campana de
 * notificaciones y foto de perfil a la derecha (la foto abre el menú de salir).
 */
export function ScreenHeader({ title, onBack, avatarUrl }: { title?: string; onBack?: () => void; avatarUrl: string | null }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      getUnreadNotificationCount()
        .then((count) => {
          if (!cancelled) setUnreadCount(count);
        })
        .catch(() => {});
      getUnreadConversationCount()
        .then((count) => {
          if (!cancelled) setUnreadChatCount(count);
        })
        .catch(() => {});
    }

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  async function handleBellPress() {
    // Igual que en el header mobile de la web: abrir la campana marca todo
    // como leído y lleva directo al listado completo (no hay dropdown).
    setUnreadCount(0);
    router.push("/notifications");
    await markAllNotificationsRead().catch(() => {});
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
      {title ? (
        <>
          <View style={styles.side}>
            {onBack && (
              <Pressable onPress={onBack} hitSlop={10}>
                <Ionicons name="chevron-back" size={26} color={colors.text} />
              </Pressable>
            )}
          </View>
          <View style={styles.center}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
        </>
      ) : (
        <Logo height={40} />
      )}

      <View style={styles.rightGroup}>
        <Pressable onPress={() => router.push("/search")} hitSlop={8} style={styles.bellBtn}>
          <Ionicons name="search" size={22} color={colors.text} />
        </Pressable>

        <Pressable onPress={() => router.push("/chats" as never)} hitSlop={8} style={styles.bellBtn}>
          <Ionicons name={unreadChatCount > 0 ? "chatbubble" : "chatbubble-outline"} size={21} color={colors.text} />
          {unreadChatCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadChatCount > 9 ? "9+" : String(unreadChatCount)}</Text>
            </View>
          )}
        </Pressable>

        <Pressable onPress={handleBellPress} hitSlop={8} style={styles.bellBtn}>
          <Ionicons name={unreadCount > 0 ? "notifications" : "notifications-outline"} size={22} color={colors.text} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
            </View>
          )}
        </Pressable>

        <Pressable onPress={() => setMenuOpen(true)} hitSlop={8}>
          <Avatar uri={avatarUrl} size={44} />
        </Pressable>
      </View>

      <ActionMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={AVATAR_MENU_ITEMS} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  side: { width: 40, justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  rightGroup: { flexDirection: "row", alignItems: "center", gap: 14 },
  bellBtn: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.text, fontSize: 10, fontWeight: "700" },
});
