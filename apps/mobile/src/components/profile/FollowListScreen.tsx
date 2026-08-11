import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenHeader } from "@/components/ScreenHeader";
import { getFollowStatus, listFollowers, listFollowing, type FollowListRow, type FollowStatus } from "@/lib/followService";
import { getProfile, getProfileBasicByUsername, getProfileByUsername } from "@/lib/profileService";
import { USER_TYPE_BADGE } from "@/lib/searchService";
import { listSubscribers, removeSubscriber, type SubscriberListRow } from "@/lib/subscriptionService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

import { Avatar } from "./Avatar";
import { VerifiedBadge } from "./VerifiedBadge";

export type FollowListTab = "followers" | "following" | "subscribers";
type ListRow = FollowListRow | SubscriberListRow;

const DEBOUNCE_MS = 250;

export function FollowListScreen({ username, initialTab }: { username: string; initialTab?: FollowListTab }) {
  const router = useRouter();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerAvatarUrl, setViewerAvatarUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isTrainer, setIsTrainer] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetName, setTargetName] = useState("");
  const [isPrivateForViewer, setIsPrivateForViewer] = useState(false);

  const [tab, setTab] = useState<FollowListTab>(initialTab ?? "followers");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ListRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestIdRef = useRef(0);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const myId = session?.user.id ?? null;
      setViewerId(myId);
      if (myId) getProfile(myId).then((p) => setViewerAvatarUrl(p?.avatar_url ?? null));

      const full = await getProfileByUsername(username);
      const basic = full ? null : await getProfileBasicByUsername(username);
      const target = full ?? basic;
      if (!target || !target.id || !target.username) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const owner = target.id === myId;
      const trainer = target.user_type === "entrenador";
      setIsOwner(owner);
      setIsTrainer(trainer);
      setTargetId(target.id);
      setTargetName(target.nombre || target.username);
      if (!trainer && tab === "subscribers") setTab("followers");

      const status: FollowStatus = owner ? "self" : await getFollowStatus(target.id).catch(() => "none" as FollowStatus);
      const priv = !owner && !full && !basic?.is_public && status !== "accepted";
      setIsPrivateForViewer(priv);
      setLoading(false);
    })();
  }, [username]);

  useEffect(() => {
    if (loading || notFound || isPrivateForViewer || !targetId) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runList(), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [tab, query, targetId, loading, notFound, isPrivateForViewer]);

  async function runList() {
    if (!targetId) return;
    const myRequestId = ++requestIdRef.current;
    setListLoading(true);
    setListError("");
    try {
      const list =
        tab === "followers" ? await listFollowers(targetId, query) : tab === "following" ? await listFollowing(targetId, query) : await listSubscribers(targetId, query);
      if (myRequestId !== requestIdRef.current) return;
      setRows(list);
    } catch {
      if (myRequestId !== requestIdRef.current) return;
      setListError("No se pudo cargar la lista. Probá de nuevo.");
      setRows([]);
    } finally {
      if (myRequestId === requestIdRef.current) setListLoading(false);
    }
  }

  async function handleRemoveSubscriber(subscriberId: string) {
    if (!targetId) return;
    setRemovingId(subscriberId);
    const { error } = await removeSubscriber(targetId, subscriberId);
    setRemovingId(null);
    if (error) {
      Alert.alert("No se pudo completar", error);
      return;
    }
    void runList();
  }

  const title =
    tab === "followers"
      ? isOwner
        ? "Tus seguidores"
        : `Seguidores de ${targetName}`
      : tab === "following"
        ? isOwner
          ? "Tus seguidos"
          : `Seguidos de ${targetName}`
        : isOwner
          ? "Tus suscriptores"
          : `Suscriptores de ${targetName}`;

  const emptyMessage = query.trim()
    ? `Sin resultados para "${query.trim()}".`
    : tab === "followers"
      ? isOwner
        ? "Todavía no tenés seguidores."
        : `${targetName} todavía no tiene seguidores.`
      : tab === "following"
        ? isOwner
          ? "Todavía no seguís a nadie."
          : `${targetName} todavía no sigue a nadie.`
        : isOwner
          ? "Todavía no tenés suscriptores."
          : `${targetName} todavía no tiene suscriptores.`;

  const canRemoveSubscribers = isOwner && tab === "subscribers";

  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Cargando..." onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Perfil" onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />
        <View style={styles.centerWrap}>
          <Text style={styles.emptyTitle}>Este perfil no existe.</Text>
        </View>
      </View>
    );
  }

  if (isPrivateForViewer) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Perfil privado" onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />
        <View style={styles.centerWrap}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No podés ver esta información</Text>
          <Text style={styles.emptyBody}>{targetName} decidió que solo sus seguidores puedan ver quién lo sigue y a quién sigue.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title={title} onBack={() => router.back()} avatarUrl={viewerAvatarUrl} />

      <View style={styles.tabsRow}>
        <TabChip label="Seguidores" active={tab === "followers"} onPress={() => setTab("followers")} />
        <TabChip label="Seguidos" active={tab === "following"} onPress={() => setTab("following")} />
        {isTrainer && <TabChip label="Suscriptores" active={tab === "subscribers"} onPress={() => setTab("subscribers")} />}
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar en la lista..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.listWrap}>
        {listLoading ? (
          <ActivityIndicator color={colors.accent2} style={{ marginTop: 20 }} />
        ) : listError ? (
          <Text style={styles.emptyBody}>{listError}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.emptyBody}>{emptyMessage}</Text>
        ) : (
          rows.map((r) => (
            <Pressable
              key={r.id}
              style={styles.row}
              onPress={() => router.push({ pathname: "/profile/[username]", params: { username: r.username } })}
            >
              <Avatar uri={r.avatarUrl} size={44} />
              <View style={styles.rowBody}>
                <View style={styles.rowNameLine}>
                  <Text style={styles.rowName}>{`${r.nombre} ${r.apellido}`.trim() || r.username}</Text>
                  <VerifiedBadge userType={r.userType} isVerified={r.isVerified} size={14} />
                </View>
                <Text style={styles.rowUsername}>@{r.username}</Text>
              </View>
              {canRemoveSubscribers ? (
                <Pressable
                  style={styles.removeBtn}
                  disabled={removingId === r.id}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleRemoveSubscriber(r.id);
                  }}
                >
                  <Text style={styles.removeBtnText}>Cancelar</Text>
                </Pressable>
              ) : (
                <Text style={styles.badge}>{USER_TYPE_BADGE[r.userType] ?? r.userType}</Text>
              )}
            </Pressable>
          ))
        )}
      </View>
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
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  tabsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  tabChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  tabChipText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  tabChipTextActive: { color: colors.accent2 },
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
  listWrap: { padding: 16, gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptyBody: { color: colors.textMuted, fontSize: 13.5, textAlign: "center", lineHeight: 19, marginTop: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 12,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  rowBody: { flex: 1, gap: 2 },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowName: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
  rowUsername: { color: colors.textMuted, fontSize: 12.5 },
  badge: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  removeBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  removeBtnText: { color: colors.text, fontSize: 12, fontWeight: "700" },
});
