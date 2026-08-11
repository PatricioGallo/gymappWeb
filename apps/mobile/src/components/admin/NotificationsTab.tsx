import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AlertMessage } from "@/components/AlertMessage";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { adminSendNotification, listAllUsersAdmin, type AdminUserRow } from "@/lib/adminService";
import { colors, radius } from "@/theme/colors";

export function NotificationsTab() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const [broadcast, setBroadcast] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState("");

  useEffect(() => {
    listAllUsersAdmin()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return users.filter((u) => u.username.toLowerCase().includes(term) || `${u.nombre} ${u.apellido}`.toLowerCase().includes(term)).slice(0, 8);
  }, [users, search]);

  function selectTarget(u: AdminUserRow) {
    setTarget(u);
    setBroadcast(false);
    setSearch("");
  }

  async function handleSend() {
    if (!broadcast && !target) {
      setError("Elegí un destinatario o marcá enviar a todos.");
      return;
    }
    if (!title.trim() || !body.trim()) {
      setError("Completá el título y el mensaje.");
      return;
    }
    setError("");
    setSending(true);
    const { error: sendError, count } = await adminSendNotification(broadcast ? null : (target?.id ?? null), title, body, link);
    setSending(false);
    if (sendError) {
      setError(sendError);
      return;
    }
    setSentMsg(broadcast ? `Notificación enviada a ${count ?? 0} usuarios.` : `Notificación enviada a @${target?.username}.`);
    setTitle("");
    setBody("");
    setLink("");
    setTarget(null);
    setBroadcast(false);
    setTimeout(() => setSentMsg(""), 3000);
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent2} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Enviar notificación</Text>

        <Pressable style={[styles.broadcastRow, broadcast && styles.broadcastRowActive]} onPress={() => setBroadcast((b) => !b)}>
          <Ionicons name={broadcast ? "checkbox" : "square-outline"} size={20} color={broadcast ? colors.accent2 : colors.textMuted} />
          <Text style={styles.broadcastText}>Enviar a todos los usuarios</Text>
        </Pressable>

        {!broadcast && (
          <View style={styles.field}>
            <Text style={styles.label}>Destinatario</Text>
            {target ? (
              <View style={styles.targetChip}>
                <Text style={styles.targetChipText}>@{target.username}</Text>
                <Pressable onPress={() => setTarget(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar usuario por nombre o @usuario..."
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                />
                {filtered.map((u) => (
                  <Pressable key={u.id} style={styles.suggestionRow} onPress={() => selectTarget(u)}>
                    <Text style={styles.suggestionText}>
                      {u.nombre} {u.apellido} · @{u.username}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        )}

        <FormField label="Título" value={title} onChangeText={setTitle} />
        <FormField label="Mensaje" value={body} onChangeText={setBody} multiline numberOfLines={4} style={{ minHeight: 90, textAlignVertical: "top" }} />
        <FormField label="Link (opcional)" value={link} onChangeText={setLink} placeholder="/profile/usuario" autoCapitalize="none" />

        <AlertMessage message={error} />
        <PrimaryButton title="Enviar" onPress={handleSend} loading={sending} />
        {sentMsg ? <Text style={styles.sentText}>{sentMsg}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 18, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 6 },
  broadcastRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  broadcastRowActive: {},
  broadcastText: { color: colors.text, fontSize: 13.5, fontWeight: "600" },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  searchInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14.5,
  },
  suggestionRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { color: colors.text, fontSize: 13.5 },
  targetChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  targetChipText: { color: colors.accent2, fontWeight: "700", fontSize: 13.5 },
  sentText: { color: colors.live, fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: 4 },
});
