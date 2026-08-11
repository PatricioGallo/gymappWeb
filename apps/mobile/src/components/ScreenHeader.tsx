import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/profile/Avatar";
import { Logo } from "@/components/Logo";
import { signOut } from "@/lib/authService";
import { colors } from "@/theme/colors";

import { ActionMenu, type ActionMenuItem } from "./ActionMenu";

const AVATAR_MENU_ITEMS: ActionMenuItem[] = [{ label: "Cerrar sesión", onPress: () => signOut(), danger: true }];

/**
 * Header consistente en todas las pantallas: flecha atrás (si aplica) +
 * título centrado (o el logo, en el perfil) + foto de perfil a la derecha
 * que abre el menú de salir.
 */
export function ScreenHeader({ title, onBack, avatarUrl }: { title?: string; onBack?: () => void; avatarUrl: string | null }) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

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

      <Pressable onPress={() => setMenuOpen(true)} hitSlop={8}>
        <Avatar uri={avatarUrl} size={44} />
      </Pressable>

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
});
