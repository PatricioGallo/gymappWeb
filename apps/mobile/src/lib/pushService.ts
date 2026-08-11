import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabaseClient";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | null {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/** Pide permiso, obtiene el Expo push token del dispositivo y lo guarda en push_tokens
 * para ese usuario. No hace nada (silenciosamente) en simulador/web o si el proyecto
 * todavía no tiene un EAS project id configurado -- ver nota en apps/mobile/README. */
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (!Device.isDevice) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#ff8a3d",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") return;

  const projectId = getProjectId();
  if (!projectId) {
    console.warn("[push] No EAS projectId configured; skipping push token registration.");
    return;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = data;
    if (!token) return;

    await supabase
      .from("push_tokens")
      .upsert({ user_id: userId, token, platform: Platform.OS === "ios" ? "ios" : "android", updated_at: new Date().toISOString() }, { onConflict: "user_id,token" });
  } catch (err) {
    console.warn("[push] Failed to register push token", err);
  }
}

/** Al cerrar sesión, dejamos de mandarle notificaciones a este dispositivo para esta cuenta. */
export async function unregisterCurrentDeviceToken(userId: string): Promise<void> {
  try {
    const projectId = getProjectId();
    if (!projectId) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!data) return;
    await supabase.from("push_tokens").delete().eq("user_id", userId).eq("token", data);
  } catch {
    // best-effort, no bloquea el logout
  }
}
