import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenHeader } from "@/components/ScreenHeader";
import { formatFechaCorta } from "@/lib/dias";
import {
  listAllNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notificationService";
import { getProfile } from "@/lib/profileService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

const TYPE_ICON: Record<string, string> = {
  routine_assigned: "🏋️",
  issue_status: "🛠️",
  admin_message: "📣",
  follow: "👥",
  follow_request: "🔔",
  follow_accepted: "✅",
  follow_rejected: "🚫",
  subscription_request: "🔔",
  subscription_accepted: "✅",
  subscription_rejected: "🚫",
  verification_approved: "✅",
  verification_rejected: "🚫",
};

const GROUP_ORDER = ["Recientes", "Últimos 7 días", "Últimos 30 días", "Más antiguas"] as const;
type GroupLabel = (typeof GROUP_ORDER)[number];
const MARK_ALL_BTN_GROUP: GroupLabel = "Últimos 7 días";

function groupLabel(iso: string): GroupLabel {
  const diffDay = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diffDay < 1) return "Recientes";
  if (diffDay < 7) return "Últimos 7 días";
  if (diffDay < 30) return "Últimos 30 días";
  return "Más antiguas";
}

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `Hace ${diffHour} h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `Hace ${diffDay} d`;
  return formatFechaCorta(iso.slice(0, 10));
}

export function NotificationsScreen() {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const [list, profile] = await Promise.all([listAllNotifications(), session ? getProfile(session.user.id) : Promise.resolve(null)]);
    setNotifications(list);
    setAvatarUrl(profile?.avatar_url ?? null);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleItemPress(id: string) {
    const notif = notifications.find((n) => n.id === id);
    if (!notif || notif.is_read) return;
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    void markNotificationRead(id);
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await markAllNotificationsRead();
  }

  const groups = new Map<GroupLabel, AppNotification[]>();
  for (const n of notifications) {
    const label = groupLabel(n.created_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(n);
  }
  const presentLabels = GROUP_ORDER.filter((label) => groups.has(label));
  const btnGroup = presentLabels.includes(MARK_ALL_BTN_GROUP) ? MARK_ALL_BTN_GROUP : presentLabels[0];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Notificaciones" onBack={() => router.back()} avatarUrl={avatarUrl} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent2} />}
        >
          {notifications.length === 0 ? (
            <Text style={styles.empty}>No tenés notificaciones todavía.</Text>
          ) : (
            presentLabels.map((label) => (
              <View key={label} style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.groupLabel}>{label}</Text>
                  {label === btnGroup && (
                    <Pressable onPress={handleMarkAllRead} disabled={unreadCount === 0} hitSlop={8}>
                      <Text style={[styles.markAll, unreadCount === 0 && styles.markAllDisabled]}>Marcar todas como leídas</Text>
                    </Pressable>
                  )}
                </View>

                {groups.get(label)!.map((n) => (
                  <Pressable
                    key={n.id}
                    onPress={() => handleItemPress(n.id)}
                    style={[styles.item, !n.is_read && styles.itemUnread]}
                  >
                    <View style={[styles.dot, n.is_read && styles.dotRead]} />
                    <View style={styles.itemBody}>
                      <Text style={styles.itemTitle}>
                        {TYPE_ICON[n.type] ?? "🔔"} {n.title}
                      </Text>
                      {n.body && <Text style={styles.itemText}>{n.body}</Text>}
                      <Text style={styles.itemTime}>{relativeTime(n.created_at)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, paddingBottom: 40, gap: 8 },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 40 },
  group: { marginBottom: 18, gap: 8 },
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  groupLabel: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  markAll: { color: colors.accent2, fontSize: 12.5, fontWeight: "700" },
  markAllDisabled: { opacity: 0.4 },
  item: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 14,
    backgroundColor: colors.surface,
  },
  itemUnread: { backgroundColor: colors.accentSoft, borderColor: "rgba(255, 77, 77, 0.3)" },
  dot: { width: 9, height: 9, borderRadius: 999, backgroundColor: colors.accent, marginTop: 5 },
  dotRead: { opacity: 0 },
  itemBody: { flex: 1, gap: 4 },
  itemTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  itemText: { color: colors.textMuted, fontSize: 13.5 },
  itemTime: { color: colors.textMuted, fontSize: 12 },
});
