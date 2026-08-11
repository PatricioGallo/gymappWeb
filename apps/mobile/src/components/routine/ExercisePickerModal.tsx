import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ScreenHeader";
import { CATEGORY_LABELS, EXERCISE_CATEGORIES, type Exercise, type ExerciseCategory } from "@/lib/exerciseService";
import { colors, radius } from "@/theme/colors";

import { CreateExerciseModal } from "./CreateExerciseModal";

export function ExercisePickerModal({
  visible,
  catalog,
  userId,
  avatarUrl,
  onSelect,
  onClose,
  onExerciseCreated,
}: {
  visible: boolean;
  catalog: Exercise[];
  userId: string;
  avatarUrl: string | null;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
  onExerciseCreated: (exercise: Exercise) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ExerciseCategory | "">("");
  const [createOpen, setCreateOpen] = useState(false);

  const sections = useMemo(() => {
    const term = query.trim().toLowerCase();
    const categories = activeCategory ? [activeCategory] : EXERCISE_CATEGORIES;
    return categories
      .map((cat) => ({
        category: cat,
        items: catalog.filter((exc) => exc.category === cat && exc.name.toLowerCase().includes(term)),
      }))
      .filter((section) => section.items.length > 0);
  }, [catalog, activeCategory, query]);

  function handleSelect(exercise: Exercise) {
    onSelect(exercise);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.wrap} edges={["bottom"]}>
        <ScreenHeader title="Elegir ejercicio" onBack={onClose} avatarUrl={avatarUrl} />
        <Text style={styles.subtitle}>Buscá por nombre o filtrá por categoría.</Text>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar ejercicio..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
          <Pressable style={[styles.chip, !activeCategory && styles.chipActive]} onPress={() => setActiveCategory("")}>
            <Text style={[styles.chipText, !activeCategory && styles.chipTextActive]}>Todos</Text>
          </Pressable>
          {EXERCISE_CATEGORIES.map((cat) => (
            <Pressable key={cat} style={[styles.chip, activeCategory === cat && styles.chipActive]} onPress={() => setActiveCategory(cat)}>
              <Text style={[styles.chipText, activeCategory === cat && styles.chipTextActive]}>{CATEGORY_LABELS[cat]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView style={styles.resultsScroll} contentContainerStyle={styles.results}>
          {sections.length === 0 ? (
            <Text style={styles.emptyText}>No encontramos ejercicios con ese nombre.</Text>
          ) : (
            sections.map(({ category, items }) => (
              <View key={category} style={styles.section}>
                <Text style={styles.sectionTitle}>{CATEGORY_LABELS[category]}</Text>
                <View style={styles.grid}>
                  {items.map((exc) => (
                    <Pressable key={exc.id} style={styles.card} onPress={() => handleSelect(exc)}>
                      {exc.image_url ? (
                        <Image source={{ uri: exc.image_url }} style={styles.thumb} />
                      ) : (
                        <View style={styles.thumbPlaceholder}>
                          <Ionicons name="barbell-outline" size={26} color={colors.textMuted} />
                        </View>
                      )}
                      <Text style={styles.cardName} numberOfLines={3}>
                        {exc.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.footerButton} onPress={() => setCreateOpen(true)}>
            <Text style={styles.footerButtonText}>+ Crear ejercicio nuevo</Text>
          </Pressable>
          <Pressable style={styles.footerButton} onPress={onClose}>
            <Text style={styles.footerButtonText}>Cerrar</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <CreateExerciseModal
        visible={createOpen}
        userId={userId}
        avatarUrl={avatarUrl}
        onClose={() => setCreateOpen(false)}
        onCreated={(exercise) => {
          onExerciseCreated(exercise);
          setCreateOpen(false);
          handleSelect(exercise);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 12, marginHorizontal: 16 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    marginBottom: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  chipsScroll: { flexGrow: 0, marginBottom: 18 },
  chipsRow: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexShrink: 0,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
  },
  chipActive: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  chipText: { fontSize: 13.5, fontWeight: "700", color: colors.textMuted },
  chipTextActive: { color: colors.bg },
  resultsScroll: { flex: 1 },
  results: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 20 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 32 },
  section: { gap: 10 },
  sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    width: "47%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    padding: 10,
    alignItems: "center",
    gap: 8,
  },
  thumb: { width: "100%", aspectRatio: 1, borderRadius: radius.input - 2 },
  thumbPlaceholder: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.input - 2,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: { color: colors.text, fontSize: 13, textAlign: "center", lineHeight: 17 },
  footer: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  footerButtonText: { color: colors.text, fontWeight: "700", fontSize: 13.5 },
});
