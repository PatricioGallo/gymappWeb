import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabaseClient";

type ConnectionStatus = "idle" | "checking" | "ok" | "error";

export default function HomeScreen() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [detail, setDetail] = useState<string>("");

  async function testConnection() {
    setStatus("checking");
    const { error } = await supabase.auth.getSession();
    if (error) {
      setStatus("error");
      setDetail(error.message);
      return;
    }
    setStatus("ok");
    setDetail("Conectado al mismo proyecto de Supabase que la web.");
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>gymapp mobile</Text>
      <Text style={styles.subtitle}>Arranque de la app en React Native + Expo.</Text>

      <Pressable style={styles.button} onPress={testConnection}>
        <Text style={styles.buttonText}>Probar conexión a Supabase</Text>
      </Pressable>

      {status !== "idle" && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>
            {status === "checking" && "Conectando..."}
            {status === "ok" && `✅ ${detail}`}
            {status === "error" && `❌ ${detail}`}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#111",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  resultBox: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
  resultText: {
    textAlign: "center",
  },
});
