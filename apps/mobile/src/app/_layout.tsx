import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "@/theme/colors";

export default function RootLayout() {
  useEffect(() => {
    // Si la app estaba cerrada/en background y el usuario toca una notificacion de
    // chat, la llevamos directo a esa conversacion (misma logica para foreground/cold-start).
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string; conversationId?: string } | undefined;
      if (data?.type === "chat_message" && data.conversationId) {
        router.push({ pathname: "/chat/[conversationId]", params: { conversationId: data.conversationId } } as never);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </SafeAreaProvider>
  );
}
