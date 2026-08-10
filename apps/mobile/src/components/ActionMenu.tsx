import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/theme/colors";

export interface ActionMenuItem {
  label: string;
  onPress: () => void;
  danger?: boolean;
}

export function ActionMenu({ visible, onClose, items }: { visible: boolean; onClose: () => void; items: ActionMenuItem[] }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <SafeAreaView style={styles.sheetWrap} edges={["bottom"]}>
          <Pressable style={styles.sheet}>
            {items.map((item, index) => (
              <Pressable
                key={item.label}
                style={[styles.row, index < items.length - 1 && styles.rowBorder]}
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
              >
                <Text style={[styles.text, item.danger && styles.dangerText]}>{item.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10, 12, 15, 0.6)", justifyContent: "flex-end" },
  sheetWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  sheet: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  row: { paddingVertical: 16, paddingHorizontal: 18 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  text: { color: colors.text, fontSize: 15, fontWeight: "600" },
  dangerText: { color: colors.menuDangerText },
});
