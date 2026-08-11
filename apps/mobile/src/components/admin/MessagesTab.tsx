import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ConfirmModal } from "@/components/profile/ConfirmModal";
import {
  deleteContactMessage,
  deleteErrorReport,
  deleteUserReport,
  listContactMessages,
  listErrorReports,
  listUserReports,
  markContactMessageRead,
  markErrorReportRead,
  markUserReportRead,
  type ContactMessageWithReader,
  type ErrorReportWithReporter,
  type UserReportWithNames,
} from "@/lib/adminMessagesService";
import { colors, radius } from "@/theme/colors";

type SubTab = "contact" | "errors" | "users";
type AnyRow = ContactMessageWithReader | ErrorReportWithReporter | UserReportWithNames;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function MessagesTab({ adminId }: { adminId: string }) {
  const [subTab, setSubTab] = useState<SubTab>("contact");
  const [contact, setContact] = useState<ContactMessageWithReader[]>([]);
  const [errors, setErrors] = useState<ErrorReportWithReporter[]>([]);
  const [users, setUsers] = useState<UserReportWithNames[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<{ row: AnyRow; kind: SubTab } | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  function reload() {
    setLoading(true);
    Promise.all([listContactMessages(), listErrorReports(), listUserReports()])
      .then(([c, e, u]) => {
        setContact(c);
        setErrors(e);
        setUsers(u);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  async function toggleRead(kind: SubTab, id: string, isRead: boolean) {
    if (kind === "contact") {
      await markContactMessageRead(id, !isRead, adminId);
      setContact((prev) => prev.map((r) => (r.id === id ? { ...r, is_read: !isRead } : r)));
    } else if (kind === "errors") {
      await markErrorReportRead(id, !isRead, adminId);
      setErrors((prev) => prev.map((r) => (r.id === id ? { ...r, is_read: !isRead } : r)));
    } else {
      await markUserReportRead(id, !isRead, adminId);
      setUsers((prev) => prev.map((r) => (r.id === id ? { ...r, is_read: !isRead } : r)));
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeletingLoading(true);
    const { row, kind } = deleting;
    const { error } =
      kind === "contact" ? await deleteContactMessage(row.id) : kind === "errors" ? await deleteErrorReport(row.id) : await deleteUserReport(row.id);
    setDeletingLoading(false);
    if (error) return;
    if (kind === "contact") setContact((prev) => prev.filter((r) => r.id !== row.id));
    else if (kind === "errors") setErrors((prev) => prev.filter((r) => r.id !== row.id));
    else setUsers((prev) => prev.filter((r) => r.id !== row.id));
    setDeleteSuccess(true);
    setTimeout(() => {
      setDeleteSuccess(false);
      setDeleting(null);
    }, 1200);
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent2} />
      </View>
    );
  }

  const unreadCounts = { contact: contact.filter((c) => !c.is_read).length, errors: errors.filter((e) => !e.is_read).length, users: users.filter((u) => !u.is_read).length };

  return (
    <View style={styles.flex}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subTabsScroll} contentContainerStyle={styles.subTabsRow}>
        <SubTabChip label="Contacto" count={unreadCounts.contact} active={subTab === "contact"} onPress={() => setSubTab("contact")} />
        <SubTabChip label="Errores" count={unreadCounts.errors} active={subTab === "errors"} onPress={() => setSubTab("errors")} />
        <SubTabChip label="Usuarios" count={unreadCounts.users} active={subTab === "users"} onPress={() => setSubTab("users")} />
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll}>
        {subTab === "contact" &&
          (contact.length === 0 ? (
            <Text style={styles.emptyText}>No hay mensajes de contacto.</Text>
          ) : (
            contact.map((m) => (
              <View key={m.id} style={[styles.row, !m.is_read && styles.rowUnread]}>
                <Text style={styles.rowTitle}>{m.name}</Text>
                <Text style={styles.rowSub}>{m.email}</Text>
                <Text style={styles.rowBody}>{m.message}</Text>
                <Text style={styles.rowDate}>{formatDate(m.created_at)}</Text>
                <RowActions isRead={m.is_read} onToggleRead={() => toggleRead("contact", m.id, m.is_read)} onDelete={() => setDeleting({ row: m, kind: "contact" })} />
              </View>
            ))
          ))}

        {subTab === "errors" &&
          (errors.length === 0 ? (
            <Text style={styles.emptyText}>No hay reportes de errores.</Text>
          ) : (
            errors.map((m) => (
              <View key={m.id} style={[styles.row, !m.is_read && styles.rowUnread]}>
                <Text style={styles.rowTitle}>{m.subject}</Text>
                {m.page && <Text style={styles.rowSub}>{m.page}</Text>}
                {m.reporterName && <Text style={styles.rowSub}>Reportado por {m.reporterName}</Text>}
                {m.message && <Text style={styles.rowBody}>{m.message}</Text>}
                <Text style={styles.rowDate}>{formatDate(m.created_at)}</Text>
                <RowActions isRead={m.is_read} onToggleRead={() => toggleRead("errors", m.id, m.is_read)} onDelete={() => setDeleting({ row: m, kind: "errors" })} />
              </View>
            ))
          ))}

        {subTab === "users" &&
          (users.length === 0 ? (
            <Text style={styles.emptyText}>No hay reportes de usuarios.</Text>
          ) : (
            users.map((m) => (
              <View key={m.id} style={[styles.row, !m.is_read && styles.rowUnread]}>
                <Text style={styles.rowTitle}>
                  {m.reporterName ?? "Alguien"} reportó a {m.reportedName ?? "un usuario"}
                </Text>
                <Text style={styles.rowBody}>{m.reason}</Text>
                <Text style={styles.rowDate}>{formatDate(m.created_at)}</Text>
                <RowActions isRead={m.is_read} onToggleRead={() => toggleRead("users", m.id, m.is_read)} onDelete={() => setDeleting({ row: m, kind: "users" })} />
              </View>
            ))
          ))}
      </ScrollView>

      {deleting && (
        <ConfirmModal
          visible
          title="¿Eliminar este mensaje?"
          subtitle="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          loadingText="Eliminando..."
          successText="Mensaje eliminado."
          loading={deletingLoading}
          success={deleteSuccess}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </View>
  );
}

function SubTabChip({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.subTabChip, active && styles.subTabChipActive]} onPress={onPress}>
      <Text style={[styles.subTabText, active && styles.subTabTextActive]}>
        {label}
        {count > 0 ? ` (${count})` : ""}
      </Text>
    </Pressable>
  );
}

function RowActions({ isRead, onToggleRead, onDelete }: { isRead: boolean; onToggleRead: () => void; onDelete: () => void }) {
  return (
    <View style={styles.rowActions}>
      <Pressable style={styles.rowActionBtn} onPress={onToggleRead}>
        <Ionicons name={isRead ? "mail-open-outline" : "mail-unread-outline"} size={14} color={colors.text} />
        <Text style={styles.rowActionText}>{isRead ? "Marcar no leído" : "Marcar leído"}</Text>
      </Pressable>
      <Pressable style={styles.rowActionBtn} onPress={onDelete}>
        <Ionicons name="trash-outline" size={14} color={colors.dangerText} />
        <Text style={[styles.rowActionText, { color: colors.dangerText }]}>Eliminar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  subTabsScroll: { flexGrow: 0 },
  subTabsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  subTabChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  subTabChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent2 },
  subTabText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
  subTabTextActive: { color: colors.accent2 },
  scroll: { padding: 16, paddingTop: 0, paddingBottom: 48, gap: 10 },
  emptyText: { color: colors.textMuted, fontSize: 13.5, textAlign: "center", paddingVertical: 24 },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 14, gap: 4 },
  rowUnread: { borderColor: colors.accent2 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  rowSub: { color: colors.textMuted, fontSize: 11.5 },
  rowBody: { color: colors.text, fontSize: 13, marginTop: 2 },
  rowDate: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },
  rowActions: { flexDirection: "row", gap: 14, marginTop: 6 },
  rowActionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowActionText: { color: colors.text, fontSize: 11.5, fontWeight: "600" },
});
