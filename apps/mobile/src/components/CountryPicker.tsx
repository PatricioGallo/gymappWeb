import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/theme/colors";

export function CountryPicker({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.toLowerCase().includes(q));
  }, [options, query]);

  function handleSelect(option: string) {
    onChange(option);
    setQuery("");
    setOpen(false);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <Text style={value ? styles.valueText : styles.placeholderText}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modalWrap}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar país..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoFocus
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => handleSelect(item)}>
                <Text style={item === value ? styles.rowTextActive : styles.rowText}>{item}</Text>
                {item === value && <Ionicons name="checkmark" size={18} color={colors.accent2} />}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  valueText: { color: colors.text, fontSize: 14.5 },
  placeholderText: { color: colors.textMuted, fontSize: 14.5 },
  modalWrap: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowText: { color: colors.text, fontSize: 15 },
  rowTextActive: { color: colors.accent2, fontSize: 15, fontWeight: "700" },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 20 },
});
