import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenHeader } from "@/components/ScreenHeader";
import { acceptMessageRequest, declineMessageRequest, getOrCreateConversation, listConversations, type ConversationSummary } from "@/lib/chatService";
import { listFollowers, listFollowing, type FollowListRow } from "@/lib/followService";
import { getProfile } from "@/lib/profileService";
import { supabase } from "@/lib/supabaseClient";
import { getUserTypeLabel } from "@/lib/verifiedBadge";
import { colors, radius } from "@/theme/colors";

import { Avatar } from "../profile/Avatar";
import { VerifiedBadge } from "../profile/VerifiedBadge";

type Tab = "messages" | "requests";
const DEBOUNCE_MS = 250;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Ahora";
  if (min < 60) return `${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `${hs} h`;
  const days = Math.floor(hs / 24);
  if (days < 7) return `${days} d`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

export function ChatListScreen() {
  const router = useRouter();
  const [myId, setMyId] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("messages");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [query, setQuery] = useState("");
  const [peopleResults, setPeopleResults] = useState<FollowListRow[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user.id ?? null;
    if (!uid) {
      router.replace("/");
      return;
    }
    setMyId(uid);
    getProfile(uid).then((p) => setMyAvatarUrl(p?.avatar_url ?? null));
    setConversations(await listConversations().catch(() => []));
  }, [router]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!myId) return;
    clearTimeout(debounceRef.current);
    const term = query.trim();
    if (term.length < 2) {
      setPeopleResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const [followers, following] = await Promise.all([listFollowers(myId, term, 8).catch(() => []), listFollowing(myId, term, 8).catch(() => [])]);
      const merged = new Map<string, FollowListRow>();
      [...followers, ...following].forEach((r) => merged.set(r.id, r));
      setPeopleResults([...merged.values()].slice(0, 6));
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query, myId]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const requests = useMemo(() => conversations.filter((c) => c.status === "pending" && !c.isInitiator), [conversations]);
  const mainList = useMemo(() => {
    const term = query.trim().toLowerCase();
    return conversations
      .filter((c) => c.status === "accepted" || c.isInitiator)
      .filter((c) => !term || c.otherUsername.toLowerCase().includes(term) || `${c.otherNombre} ${c.otherApellido}`.toLowerCase().includes(term));
  }, [conversations, query]);

  async function handleRespond(c: ConversationSummary, accept: boolean) {
    setRespondingId(c.conversationId);
    const { error } = accept ? await acceptMessageRequest(c.conversationId) : await declineMessageRequest(c.conversationId);
    setRespondingId(null);
    if (error) return;
    if (accept) {
      setTab("messages");
      router.push({ pathname: "/chat/[conversationId]", params: { conversationId: c.conversationId } });
    }
    setConversations((prev) => (accept ? prev.map((x) => (x.conversationId === c.conversationId ? { ...x, status: "accepted" as const } : x)) : prev.filter((x) => x.conversationId !== c.conversationId)));
  }

  async function handleStartConversation(personId: string) {
    setStarting(personId);
    const existing = conversations.find((c) => c.otherUserId === personId);
    if (existing) {
      setStarting(null);
      router.push({ pathname: "/chat/[conversationId]", params: { conversationId: existing.conversationId } });
      return;
    }
    const { id, error } = await getOrCreateConversation(personId);
    setStarting(null);
    if (error || !id) return;
    router.push({ pathname: "/chat/[conversationId]", params: { conversationId: id } });
  }

  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Mensajes" onBack={() => router.back()} avatarUrl={null} />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Mensajes" onBack={() => router.back()} avatarUrl={myAvatarUrl} />

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar o empezar una conversación..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {peopleResults.length > 0 && (
        <View style={styles.peopleWrap}>
          {peopleResults.map((p) => {
            const hasConvo = conversations.some((c) => c.otherUserId === p.id);
            return (
              <View key={p.id} style={styles.peopleRow}>
                <Avatar uri={p.avatarUrl} size={36} />
                <Text style={styles.peopleName} numberOfLines={1}>
                  {p.nombre} {p.apellido} · @{p.username}
                </Text>
                <Pressable style={styles.peopleBtn} disabled={starting === p.id} onPress={() => handleStartConversation(p.id)}>
                  <Text style={styles.peopleBtnText}>{starting === p.id ? "..." : hasConvo ? "Ver chat" : "Mensaje"}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.tabsRow}>
        <TabChip label="Tus mensajes" active={tab === "messages"} onPress={() => setTab("messages")} />
        <TabChip label={`Solicitudes${requests.length > 0 ? ` (${requests.length})` : ""}`} active={tab === "requests"} onPress={() => setTab("requests")} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent2} />}>
        {tab === "requests" ? (
          requests.length === 0 ? (
            <Text style={styles.emptyText}>No tenés solicitudes de mensaje pendientes.</Text>
          ) : (
            requests.map((c) => (
              <View key={c.conversationId} style={styles.row}>
                <Pressable style={styles.rowMain} onPress={() => router.push({ pathname: "/chat/[conversationId]", params: { conversationId: c.conversationId } })}>
                  <Avatar uri={c.otherAvatarUrl} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.nameLine}>
                      <Text style={styles.name}>{`${c.otherNombre} ${c.otherApellido}`.trim() || c.otherUsername}</Text>
                      <VerifiedBadge userType={c.otherUserType} isVerified={c.otherIsVerified} size={13} />
                    </View>
                    <Text style={styles.preview} numberOfLines={1}>
                      {c.lastMessagePreview ?? getUserTypeLabel(c.otherUserType, c.otherIsVerified)}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.reqActions}>
                  <Pressable style={styles.acceptBtn} disabled={respondingId === c.conversationId} onPress={() => handleRespond(c, true)}>
                    <Text style={styles.acceptBtnText}>Aceptar</Text>
                  </Pressable>
                  <Pressable style={styles.rejectBtn} disabled={respondingId === c.conversationId} onPress={() => handleRespond(c, false)}>
                    <Text style={styles.rejectBtnText}>Rechazar</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )
        ) : mainList.length === 0 ? (
          <Text style={styles.emptyText}>Todavía no tenés conversaciones. Buscá a alguien arriba para empezar a chatear.</Text>
        ) : (
          mainList.map((c) => {
            const seen = c.unreadCount > 0 ? null : c.lastMessageSenderIsMe && c.lastMessageRead ? "Visto" : null;
            return (
              <Pressable
                key={c.conversationId}
                style={styles.row}
                onPress={() => router.push({ pathname: "/chat/[conversationId]", params: { conversationId: c.conversationId } })}
              >
                <Avatar uri={c.otherAvatarUrl} size={44} />
                <View style={styles.rowBody}>
                  <View style={styles.nameLine}>
                    <Text style={styles.name} numberOfLines={1}>
                      {`${c.otherNombre} ${c.otherApellido}`.trim() || c.otherUsername}
                    </Text>
                    <VerifiedBadge userType={c.otherUserType} isVerified={c.otherIsVerified} size={13} />
                  </View>
                  <Text style={styles.preview} numberOfLines={1}>
                    {c.lastMessageSenderIsMe ? "Vos: " : ""}
                    {c.lastMessagePreview ?? ""}
                    {c.status === "pending" ? " · Pendiente de aceptar" : ""}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.time}>{relativeTime(c.lastMessageAt)}</Text>
                  {c.unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{c.unreadCount > 9 ? "9+" : c.unreadCount}</Text>
                    </View>
                  ) : seen ? (
                    <Text style={styles.seenText}>{seen}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function TabChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tabChip, active && styles.tabChipActive]} onPress={onPress}>
      <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14.5 },
  peopleWrap: { marginHorizontal: 16, marginTop: 10, gap: 8 },
  peopleRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 10 },
  peopleName: { flex: 1, color: colors.text, fontSize: 12.5 },
  peopleBtn: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  peopleBtnText: { color: colors.accent2, fontSize: 11.5, fontWeight: "700" },
  tabsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  tabChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  tabChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  tabChipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
  tabChipTextActive: { color: colors.accent2 },
  scroll: { padding: 16, gap: 8, paddingBottom: 48 },
  emptyText: { color: colors.textMuted, fontSize: 13.5, textAlign: "center", paddingVertical: 24, lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 12 },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  rowBody: { flex: 1, gap: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { color: colors.text, fontSize: 14, fontWeight: "700" },
  preview: { color: colors.textMuted, fontSize: 12.5 },
  rowRight: { alignItems: "flex-end", gap: 4 },
  time: { color: colors.textMuted, fontSize: 11 },
  unreadBadge: { backgroundColor: colors.accent2, borderRadius: 999, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  unreadBadgeText: { color: colors.bg, fontSize: 10.5, fontWeight: "800" },
  seenText: { color: colors.textMuted, fontSize: 10.5 },
  reqActions: { flexDirection: "row", gap: 6 },
  acceptBtn: { backgroundColor: colors.accent2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  acceptBtnText: { color: colors.bg, fontWeight: "700", fontSize: 12 },
  rejectBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  rejectBtnText: { color: colors.text, fontWeight: "700", fontSize: 12 },
});
