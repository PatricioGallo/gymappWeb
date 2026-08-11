import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ConfirmModal } from "@/components/profile/ConfirmModal";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { deleteUserAsAdmin, listAllUsersAdmin, USER_TYPE_LABELS, type AdminUserRow } from "@/lib/adminService";
import { colors, radius } from "@/theme/colors";

import { EditUserModal } from "./EditUserModal";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function UsersTab({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAllUsersAdmin()
      .then((rows) => {
        if (!cancelled) setUsers(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => [u.username, u.nombre, u.apellido, u.email].some((f) => f.toLowerCase().includes(term)));
  }, [users, search]);

  async function handleConfirmDelete() {
    if (!deletingUser) return;
    setDeleting(true);
    const { error } = await deleteUserAsAdmin(deletingUser.id);
    setDeleting(false);
    if (error) return;
    setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
    setDeleteSuccess(true);
    setTimeout(() => {
      setDeleteSuccess(false);
      setDeletingUser(null);
    }, 1200);
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent2} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre, usuario o mail..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {filtered.length === 0 ? (
        <Text style={styles.emptyText}>No encontramos usuarios con ese criterio.</Text>
      ) : (
        filtered.map((u) => (
          <Pressable key={u.id} style={styles.row} onPress={() => router.push({ pathname: "/profile/[username]", params: { username: u.username } })}>
            <View style={styles.rowMain}>
              <View style={styles.rowNameLine}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {u.nombre} {u.apellido}
                </Text>
                <VerifiedBadge userType={u.user_type} isVerified={u.is_verified} size={14} />
              </View>
              <Text style={styles.rowSub} numberOfLines={1}>
                @{u.username} · {u.email}
              </Text>
              <View style={styles.rowMeta}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{USER_TYPE_LABELS[u.user_type]}</Text>
                </View>
                <Text style={styles.metaText}>{u.routines_count} rutinas</Text>
                <Text style={styles.metaText}>Registrado {formatDate(u.created_at)}</Text>
              </View>
            </View>

            {isAdmin && (
              <View style={styles.rowActions}>
                <Pressable
                  style={styles.actionBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    setEditingUser(u);
                  }}
                >
                  <Ionicons name="create-outline" size={18} color={colors.text} />
                </Pressable>
                {!["admin", "colaborador"].includes(u.user_type) && (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      setDeletingUser(u);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.dangerText} />
                  </Pressable>
                )}
              </View>
            )}
          </Pressable>
        ))
      )}

      {editingUser && (
        <EditUserModal
          visible
          user={editingUser}
          avatarUrl={editingUser.avatar_url}
          onClose={() => setEditingUser(null)}
          onSaved={(patch) => {
            setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? { ...u, ...patch } : u)));
            setEditingUser(null);
          }}
        />
      )}

      {deletingUser && (
        <ConfirmModal
          visible
          title={`¿Eliminar a @${deletingUser.username}?`}
          subtitle="Esta acción no se puede deshacer. Se van a borrar también sus rutinas, pesos registrados, notificaciones y relaciones de seguimiento."
          confirmLabel="Eliminar"
          loadingText="Eliminando usuario..."
          successText="Usuario eliminado."
          loading={deleting}
          success={deleteSuccess}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingUser(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, padding: 16, gap: 10 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14.5 },
  emptyText: { color: colors.textMuted, fontSize: 13.5, textAlign: "center", paddingVertical: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 14,
  },
  rowMain: { flex: 1, gap: 4 },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowName: { color: colors.text, fontSize: 14.5, fontWeight: "700", flexShrink: 1 },
  rowSub: { color: colors.textMuted, fontSize: 12.5 },
  rowMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 },
  roleBadge: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleBadgeText: { color: colors.text, fontSize: 11, fontWeight: "700" },
  metaText: { color: colors.textMuted, fontSize: 11 },
  rowActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
