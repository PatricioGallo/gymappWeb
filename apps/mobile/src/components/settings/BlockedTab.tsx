import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { listBlockedUsers, unblockUser, type BlockedUserRow } from "@/lib/blockService";
import { colors, radius } from "@/theme/colors";

export function BlockedTab({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<BlockedUserRow[]>([]);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setBlocked(await listBlockedUsers(userId));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUnblock(blockedId: string) {
    setUnblockingId(blockedId);
    await unblockUser(userId, blockedId);
    setUnblockingId(null);
    await load();
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Usuarios bloqueados</Text>
      <Text style={styles.cardHint}>Bloqueá usuarios desde el menú de tres puntos en su perfil. Acá podés ver y gestionar tus bloqueos.</Text>

      {loading ? (
        <ActivityIndicator color={colors.accent2} style={{ marginTop: 12 }} />
      ) : blocked.length === 0 ? (
        <Text style={styles.emptyText}>No bloqueaste a nadie todavía.</Text>
      ) : (
        blocked.map((b) => (
          <View key={b.id} style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowName}>
                {b.nombre} {b.apellido}
              </Text>
              <Text style={styles.rowUsername}>@{b.username}</Text>
            </View>
            <Pressable style={styles.unblockBtn} onPress={() => handleUnblock(b.blockedId)} disabled={unblockingId === b.blockedId}>
              <Text style={styles.unblockText}>Desbloquear</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 18,
    gap: 4,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardHint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 4 },
  emptyText: { color: colors.textMuted, fontSize: 13.5, marginTop: 10, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowInfo: { gap: 2 },
  rowName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  rowUsername: { color: colors.textMuted, fontSize: 12.5 },
  unblockBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  unblockText: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
});
