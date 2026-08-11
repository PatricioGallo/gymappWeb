import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenHeader } from "@/components/ScreenHeader";
import { getProfile } from "@/lib/profileService";
import { acceptSubscriptionRequest, listSubscriptionRequests, rejectSubscriptionRequest, type SubscriptionRequestRow } from "@/lib/subscriptionService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

import { Avatar } from "./Avatar";
import { VerifiedBadge } from "./VerifiedBadge";

export function SubscriptionRequestsScreen() {
  const router = useRouter();
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SubscriptionRequestRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const myId = session?.user.id ?? null;
    if (!myId) {
      router.replace("/");
      return;
    }
    getProfile(myId).then((p) => setMyAvatarUrl(p?.avatar_url ?? null));
    setLoading(true);
    try {
      setRows(await listSubscriptionRequests(myId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRespond(row: SubscriptionRequestRow, accept: boolean) {
    setBusyId(row.id);
    const { error } = accept ? await acceptSubscriptionRequest(row.id) : await rejectSubscriptionRequest(row.id);
    setBusyId(null);
    if (error) return;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Solicitudes de suscripción" onBack={() => router.back()} avatarUrl={myAvatarUrl} />

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      ) : (
        <View style={styles.listWrap}>
          <Text style={styles.summary}>
            {rows.length === 0
              ? "No tenés solicitudes de suscripción pendientes."
              : `${rows.length} solicitud${rows.length === 1 ? "" : "es"} pendiente${rows.length === 1 ? "" : "s"}.`}
          </Text>
          {rows.map((r) => (
            <View key={r.id} style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => router.push({ pathname: "/profile/[username]", params: { username: r.username } })}>
                <Avatar uri={r.avatarUrl} size={44} />
                <View style={styles.rowBody}>
                  <View style={styles.rowNameLine}>
                    <Text style={styles.rowName}>{`${r.nombre} ${r.apellido}`.trim() || r.username}</Text>
                    <VerifiedBadge userType={r.userType} isVerified={r.isVerified} size={14} />
                  </View>
                  <Text style={styles.rowUsername}>@{r.username}</Text>
                </View>
              </Pressable>
              <View style={styles.actions}>
                <Pressable style={styles.acceptBtn} disabled={busyId === r.id} onPress={() => handleRespond(r, true)}>
                  <Text style={styles.acceptBtnText}>Aceptar</Text>
                </Pressable>
                <Pressable style={styles.rejectBtn} disabled={busyId === r.id} onPress={() => handleRespond(r, false)}>
                  <Text style={styles.rejectBtnText}>Rechazar</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  listWrap: { padding: 16, gap: 10 },
  summary: { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 14,
    backgroundColor: colors.surface,
    gap: 12,
  },
  rowMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowBody: { flex: 1, gap: 2 },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowName: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
  rowUsername: { color: colors.textMuted, fontSize: 12.5 },
  actions: { flexDirection: "row", gap: 10 },
  acceptBtn: { flex: 1, backgroundColor: colors.accent2, borderRadius: radius.pill, paddingVertical: 10, alignItems: "center" },
  acceptBtnText: { color: colors.bg, fontWeight: "700", fontSize: 13.5 },
  rejectBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 10, alignItems: "center" },
  rejectBtnText: { color: colors.text, fontWeight: "700", fontSize: 13.5 },
});
