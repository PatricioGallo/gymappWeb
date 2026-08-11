import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Avatar } from "@/components/profile/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { ScreenHeader } from "@/components/ScreenHeader";
import { followUser, type FollowStatus } from "@/lib/followService";
import { getProfile } from "@/lib/profileService";
import { addRecentSearch, clearRecentSearches, getRecentSearches, removeRecentSearch, type RecentSearchEntry } from "@/lib/recentSearches";
import { getSuggestedProfiles, searchProfiles, type ProfileSearchResult, type SuggestedProfile } from "@/lib/searchService";
import { supabase } from "@/lib/supabaseClient";
import type { Enums } from "@/types/database";
import { colors, radius } from "@/theme/colors";

const DEBOUNCE_MS = 250;

interface ProfileRowData {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  avatar_url: string | null;
  user_type: Enums<"user_type">;
  is_verified: boolean;
}

export function SearchScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<RecentSearchEntry[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedProfile[]>([]);
  const [followState, setFollowState] = useState<Map<string, FollowStatus | "sending">>(new Map());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestIdRef = useRef(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) getProfile(uid).then((p) => setAvatarUrl(p?.avatar_url ?? null));
    });
    void refreshRecents();
    getSuggestedProfiles(6)
      .then(setSuggestions)
      .catch(() => {});
  }, []);

  async function refreshRecents() {
    setRecents(await getRecentSearches());
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => void runSearch(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function runSearch(trimmed: string) {
    const myRequestId = ++requestIdRef.current;
    try {
      const list = await searchProfiles(trimmed, 50);
      if (myRequestId !== requestIdRef.current) return;
      setResults(list);
    } catch {
      if (myRequestId !== requestIdRef.current) return;
      setResults([]);
    } finally {
      if (myRequestId === requestIdRef.current) setSearching(false);
    }
  }

  function handleResultPress(r: ProfileRowData) {
    void addRecentSearch({ id: r.id, username: r.username, nombre: r.nombre, apellido: r.apellido, avatar_url: r.avatar_url, user_type: r.user_type, is_verified: r.is_verified });
    router.push({ pathname: "/profile/[username]", params: { username: r.username } });
  }

  async function handleRemoveRecent(id: string) {
    await removeRecentSearch(id);
    void refreshRecents();
  }

  async function handleClearRecents() {
    await clearRecentSearches();
    void refreshRecents();
  }

  async function handleFollow(target: SuggestedProfile) {
    if (!userId) return;
    setFollowState((prev) => new Map(prev).set(target.id, "sending"));
    const { status, error } = await followUser(userId, target.id);
    if (error) {
      setFollowState((prev) => {
        const next = new Map(prev);
        next.delete(target.id);
        return next;
      });
      Alert.alert("No se pudo seguir", error);
      return;
    }
    setFollowState((prev) => new Map(prev).set(target.id, status ?? "accepted"));
  }

  const showingQuery = query.trim().length >= 2;
  const trimmedQuery = query.trim();

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Buscar" onBack={() => router.back()} avatarUrl={avatarUrl} />

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar usuarios, entrenadores o gimnasios..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoFocus
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {showingQuery ? (
          <>
            {!searching && (
              <Text style={styles.summary}>
                {results.length === 0
                  ? `Sin resultados para "${trimmedQuery}".`
                  : `${results.length} resultado${results.length === 1 ? "" : "s"} para "${trimmedQuery}".`}
              </Text>
            )}
            {results.map((r) => (
              <ProfileRow key={r.id} profile={r} onPress={() => handleResultPress(r)} />
            ))}
          </>
        ) : (
          <>
            {recents.length === 0 ? (
              <Text style={styles.summary}>Escribí al menos 2 letras para buscar.</Text>
            ) : (
              <View style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.groupLabel}>Recientes</Text>
                  <Pressable onPress={handleClearRecents} hitSlop={8}>
                    <Text style={styles.clearAll}>Borrar todo</Text>
                  </Pressable>
                </View>
                {recents.map((r) => (
                  <ProfileRow
                    key={r.id}
                    profile={r}
                    onPress={() => router.push({ pathname: "/profile/[username]", params: { username: r.username } })}
                    trailing={
                      <Pressable onPress={() => handleRemoveRecent(r.id)} hitSlop={8}>
                        <Ionicons name="close" size={18} color={colors.textMuted} />
                      </Pressable>
                    }
                  />
                ))}
              </View>
            )}

            {suggestions.length > 0 && (
              <View style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.groupLabel}>Sugerencias para seguir</Text>
                </View>
                {suggestions.map((s) => {
                  const state = followState.get(s.id);
                  return (
                    <ProfileRow
                      key={s.id}
                      profile={s}
                      onPress={() => router.push({ pathname: "/profile/[username]", params: { username: s.username } })}
                      trailing={
                        <Pressable
                          onPress={() => handleFollow(s)}
                          disabled={state === "sending" || state === "pending" || state === "accepted"}
                          style={styles.followBtn}
                        >
                          <Text style={styles.followBtnText}>{state === "pending" ? "Solicitud enviada" : state ? "Siguiendo" : "Seguir"}</Text>
                        </Pressable>
                      }
                    />
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ProfileRow({ profile, onPress, trailing }: { profile: ProfileRowData; onPress: () => void; trailing?: ReactNode }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Avatar uri={profile.avatar_url} size={44} />
      <View style={styles.rowBody}>
        <View style={styles.rowNameLine}>
          <Text style={styles.rowUsername}>{profile.username}</Text>
          <VerifiedBadge userType={profile.user_type} isVerified={profile.is_verified} size={14} />
        </View>
        <Text style={styles.rowFullname}>{`${profile.nombre} ${profile.apellido}`.trim()}</Text>
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  scroll: { padding: 16, paddingBottom: 40, gap: 8 },
  summary: { color: colors.textMuted, fontSize: 13.5, marginBottom: 8 },
  group: { marginBottom: 18, gap: 8 },
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  groupLabel: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  clearAll: { color: colors.accent2, fontSize: 12.5, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 12,
    backgroundColor: colors.surface,
  },
  rowBody: { flex: 1, gap: 2 },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowUsername: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
  rowFullname: { color: colors.textMuted, fontSize: 13 },
  followBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  followBtnText: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
});
