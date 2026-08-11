import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";

import { OutlineButton } from "@/components/OutlineButton";
import { colors, radius } from "@/theme/colors";

const HELP_ITEMS: { title: string; body: string }[] = [
  {
    title: "Nombre del día",
    body: 'Viene precargado como Lunes, Martes, etc. Si no entrenás en días fijos, borralo y escribí lo que quieras (por ejemplo "Día 1" o "Día de pierna").',
  },
  { title: "Elegir ejercicio", body: "Tocá el botón para buscar en el catálogo por nombre o categoría." },
  { title: "Series x Repeticiones", body: "Cuántas series vas a hacer y cuántas repeticiones en cada una." },
  {
    title: "Hasta (opcional)",
    body: 'Completalo solo si preferís dejar un rango de repeticiones, por ejemplo "8 a 12" en vez de un número fijo.',
  },
  { title: "Sin peso", body: "Tildalo si el ejercicio no usa peso, como una elongación o un ejercicio de movilidad." },
  {
    title: "Mismo peso en todas las series",
    body: "Tildado, vas a cargar un solo peso para todo el ejercicio. Destildalo si querés anotar un peso distinto en cada serie.",
  },
  { title: "Nota", body: "Un mensaje opcional para quien entrene con esta rutina, como una indicación de técnica." },
  { title: "Visibilidad de la rutina", body: "Pública: otros usuarios con perfil público la pueden ver. Privada: solo la vas a ver vos." },
];

export function BuilderHelpModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>¿Cómo cargo los ejercicios?</Text>
          <Text style={styles.subtitle}>Guía rápida para armar el día de entrenamiento.</Text>
          <ScrollView style={styles.list}>
            {HELP_ITEMS.map((item) => (
              <View key={item.title} style={styles.item}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemBody}>{item.body}</Text>
              </View>
            ))}
          </ScrollView>
          <OutlineButton title="Entendido" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10, 12, 15, 0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "80%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 24,
    gap: 14,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 13.5, marginTop: -8 },
  list: { flexGrow: 0 },
  item: { marginBottom: 14, gap: 3 },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  itemBody: { color: colors.textMuted, fontSize: 13, lineHeight: 18.5 },
});
