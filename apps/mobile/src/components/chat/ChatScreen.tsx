import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/profile/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import {
  acceptMessageRequest,
  declineMessageRequest,
  getChatAttachmentUrl,
  getConversationPeerMeta,
  listConversations,
  listMessages,
  markConversationRead,
  MESSAGES_PAGE_SIZE,
  sendMessage,
  uploadChatImageFromUri,
  type ChatMessage,
  type ConversationSummary,
} from "@/lib/chatService";
import { getProfile } from "@/lib/profileService";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/theme/colors";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Hoy";
  if (sameDay(d, yesterday)) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function lastSeenLabel(iso: string | null): string | null {
  if (!iso) return null;
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 2) return "En línea hace un momento";
  if (diffMin < 60) return `Últ. vez hace ${diffMin} min`;
  const hs = Math.floor(diffMin / 60);
  if (hs < 24) return `Últ. vez hace ${hs} h`;
  return `Últ. vez el ${new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}`;
}

export function ChatScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [myId, setMyId] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());

  const [text, setText] = useState("");
  const [pendingImage, setPendingImage] = useState<{ uri: string; mimeType: string | null | undefined } | null>(null);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const renderedIds = useRef(new Set<string>());
  const conversationStatusRef = useRef<{ status: "pending" | "accepted"; isInitiator: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user.id ?? null;
      if (!uid) {
        router.replace("/");
        return;
      }
      setMyId(uid);
      getProfile(uid).then((p) => setMyAvatarUrl(p?.avatar_url ?? null));

      const all = await listConversations().catch(() => []);
      const found = all.find((c) => c.conversationId === conversationId) ?? null;
      if (!found) {
        router.replace("/chats" as never);
        return;
      }
      if (cancelled) return;
      setConversation(found);
      conversationStatusRef.current = { status: found.status, isInitiator: found.isInitiator };

      const [peerMeta, initialMessages] = await Promise.all([getConversationPeerMeta(found.otherUserId), listMessages(conversationId)]);
      if (cancelled) return;
      setReadReceiptsEnabled(peerMeta.readReceiptsEnabled);
      setLastSeenAt(peerMeta.lastSeenAt);

      const ordered = [...initialMessages].reverse();
      ordered.forEach((m) => renderedIds.current.add(m.id));
      setMessages(ordered);
      setHasMore(initialMessages.length >= MESSAGES_PAGE_SIZE);
      setLoading(false);

      const unreadFromOther = ordered.some((m) => m.sender_id !== uid && !m.read_at);
      if (unreadFromOther) void markConversationRead(conversationId);

      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!myId) return;
    const channel = supabase
      .channel(`chat-thread-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const msg = payload.new as ChatMessage;
        if (renderedIds.current.has(msg.id)) return;
        renderedIds.current.add(msg.id);
        setMessages((prev) => [...prev, msg]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        if (msg.sender_id !== myId) {
          void markConversationRead(conversationId);
          if (conversationStatusRef.current?.status === "pending" && conversationStatusRef.current.isInitiator) {
            conversationStatusRef.current = { ...conversationStatusRef.current, status: "accepted" };
            setConversation((prev) => (prev ? { ...prev, status: "accepted" } : prev));
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const updated = payload.new as ChatMessage;
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, myId]);

  async function loadOlderMessages() {
    if (messages.length === 0) return;
    setLoadingMore(true);
    const older = await listMessages(conversationId, messages[0].created_at).catch(() => []);
    setLoadingMore(false);
    if (older.length === 0) {
      setHasMore(false);
      return;
    }
    const ordered = [...older].reverse();
    ordered.forEach((m) => renderedIds.current.add(m.id));
    setMessages((prev) => [...ordered, ...prev]);
    setHasMore(older.length >= MESSAGES_PAGE_SIZE);
  }

  useEffect(() => {
    const missing = messages.filter((m) => m.attachment_type === "image" && m.attachment_path && !imageUrls.has(m.attachment_path));
    if (missing.length === 0) return;
    Promise.all(missing.map(async (m) => [m.attachment_path!, await getChatAttachmentUrl(m.attachment_path!)] as const)).then((pairs) => {
      setImageUrls((prev) => {
        const next = new Map(prev);
        pairs.forEach(([path, url]) => {
          if (url) next.set(path, url);
        });
        return next;
      });
    });
  }, [messages, imageUrls]);

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso necesario", "Necesitamos acceso a tus fotos para enviar una imagen.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setPendingImage({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
  }

  async function handleSend() {
    if (sending) return;
    const content = text.trim();
    if (!content && !pendingImage) return;
    setSending(true);

    let attachmentPath: string | undefined;
    let attachmentType: "image" | undefined;
    if (pendingImage) {
      const { path, error } = await uploadChatImageFromUri(conversationId, pendingImage.uri, pendingImage.mimeType);
      if (error || !path) {
        setSending(false);
        Alert.alert("No se pudo enviar la imagen", error ?? "Probá de nuevo.");
        return;
      }
      attachmentPath = path;
      attachmentType = "image";
    }

    const { message, error } = await sendMessage(conversationId, { content: content || undefined, attachmentPath, attachmentType });
    setSending(false);
    if (error || !message) {
      Alert.alert("No se pudo enviar", error ?? "Probá de nuevo.");
      return;
    }
    setText("");
    setPendingImage(null);
    if (!renderedIds.current.has(message.id)) {
      renderedIds.current.add(message.id);
      setMessages((prev) => [...prev, message]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
    if (conversationStatusRef.current?.status === "pending" && !conversationStatusRef.current.isInitiator) {
      conversationStatusRef.current = { ...conversationStatusRef.current, status: "accepted" };
      setConversation((prev) => (prev ? { ...prev, status: "accepted" } : prev));
    }

    supabase.functions.invoke("send-chat-push", { body: { message_id: message.id } }).catch(() => {});
  }

  async function handleAcceptRequest() {
    await acceptMessageRequest(conversationId);
    setConversation((prev) => (prev ? { ...prev, status: "accepted" } : prev));
  }
  async function handleDeclineRequest() {
    Alert.alert("Rechazar solicitud", "¿Seguro que querés rechazar este mensaje? Se va a borrar la conversación.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Rechazar",
        style: "destructive",
        onPress: async () => {
          await declineMessageRequest(conversationId);
          router.back();
        },
      },
    ]);
  }

  if (loading || !conversation || !myId) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Chat" onBack={() => router.back()} avatarUrl={myAvatarUrl} />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent2} />
        </View>
      </View>
    );
  }

  const otherName = `${conversation.otherNombre} ${conversation.otherApellido}`.trim() || conversation.otherUsername;
  const seenLabel = lastSeenLabel(lastSeenAt);
  const isPendingIncoming = conversation.status === "pending" && !conversation.isInitiator;
  const isPendingOutgoing = conversation.status === "pending" && conversation.isInitiator;

  let lastDay = "";

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={[styles.headerWrap, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Pressable style={styles.headerMain} onPress={() => router.push({ pathname: "/profile/[username]", params: { username: conversation.otherUsername } })}>
            <Avatar uri={conversation.otherAvatarUrl} size={38} />
            <View>
              <View style={styles.headerNameLine}>
                <Text style={styles.headerName}>{otherName}</Text>
                <VerifiedBadge userType={conversation.otherUserType} isVerified={conversation.otherIsVerified} size={13} />
              </View>
              {seenLabel && <Text style={styles.headerSub}>{seenLabel}</Text>}
            </View>
          </Pressable>
        </View>
      </View>

      {isPendingIncoming && (
        <View style={styles.requestBanner}>
          <Text style={styles.requestBannerText}>{otherName} te envió una solicitud de mensaje. Si respondés, la aceptás automáticamente.</Text>
          <View style={styles.requestBannerActions}>
            <Pressable style={styles.acceptBtn} onPress={handleAcceptRequest}>
              <Text style={styles.acceptBtnText}>Aceptar</Text>
            </Pressable>
            <Pressable style={styles.rejectBtn} onPress={handleDeclineRequest}>
              <Text style={styles.rejectBtnText}>Rechazar</Text>
            </Pressable>
          </View>
        </View>
      )}
      {isPendingOutgoing && (
        <View style={styles.pendingNote}>
          <Text style={styles.pendingNoteText}>Le enviaste una solicitud de mensaje. Vas a poder chatear normalmente cuando la acepte.</Text>
        </View>
      )}

      <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.messagesScroll}>
        {hasMore && (
          <Pressable style={styles.loadMoreBtn} onPress={loadOlderMessages} disabled={loadingMore}>
            <Text style={styles.loadMoreText}>{loadingMore ? "Cargando..." : "Cargar mensajes anteriores"}</Text>
          </Pressable>
        )}

        {messages.map((m) => {
          const day = dayLabel(m.created_at);
          const showDivider = day !== lastDay;
          lastDay = day;
          const isMe = m.sender_id === myId;
          const isRead = readReceiptsEnabled && Boolean(m.read_at);
          return (
            <View key={m.id}>
              {showDivider && (
                <View style={styles.dayDividerWrap}>
                  <Text style={styles.dayDividerText}>{day}</Text>
                </View>
              )}
              <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                  {m.attachment_type === "image" && m.attachment_path && (
                    <Pressable onPress={() => imageUrls.get(m.attachment_path!) && Alert.alert("", "")}>
                      {imageUrls.get(m.attachment_path) ? (
                        <Image source={{ uri: imageUrls.get(m.attachment_path)! }} style={styles.bubbleImage} />
                      ) : (
                        <View style={[styles.bubbleImage, styles.bubbleImagePlaceholder]}>
                          <ActivityIndicator color={colors.textMuted} size="small" />
                        </View>
                      )}
                    </Pressable>
                  )}
                  {m.content && <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{m.content}</Text>}
                  <View style={styles.bubbleFooter}>
                    <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{timeLabel(m.created_at)}</Text>
                    {isMe && <Ionicons name="checkmark-done" size={14} color={isRead ? colors.verifiedBlue : "rgba(255,255,255,0.55)"} />}
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {pendingImage && (
          <View style={styles.pendingAttachmentRow}>
            <Image source={{ uri: pendingImage.uri }} style={styles.pendingAttachmentThumb} />
            <Text style={styles.pendingAttachmentText}>Imagen lista para enviar</Text>
            <Pressable onPress={() => setPendingImage(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        )}
        <View style={styles.composerRow}>
          <Pressable style={styles.composerIconBtn} onPress={handlePickImage} hitSlop={8}>
            <Ionicons name="image-outline" size={22} color={colors.accent2} />
          </Pressable>
          <TextInput
            style={styles.composerInput}
            placeholder="Escribí un mensaje..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
          />
          <Pressable style={[styles.sendBtn, sending && styles.sendBtnDisabled]} onPress={handleSend} disabled={sending || (!text.trim() && !pendingImage)}>
            <Ionicons name="send" size={18} color={colors.bg} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerWrap: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerMain: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  headerNameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  headerSub: { color: colors.textMuted, fontSize: 11.5 },
  requestBanner: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, padding: 14, gap: 10 },
  requestBannerText: { color: colors.text, fontSize: 12.5, lineHeight: 18 },
  requestBannerActions: { flexDirection: "row", gap: 10 },
  pendingNote: { backgroundColor: colors.accentSoft, padding: 10 },
  pendingNoteText: { color: colors.accent2, fontSize: 12, textAlign: "center" },
  acceptBtn: { backgroundColor: colors.accent2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  acceptBtnText: { color: colors.bg, fontWeight: "700", fontSize: 12.5 },
  rejectBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  rejectBtnText: { color: colors.text, fontWeight: "700", fontSize: 12.5 },
  messagesScroll: { padding: 16, gap: 4, paddingBottom: 20 },
  loadMoreBtn: { alignSelf: "center", marginBottom: 12 },
  loadMoreText: { color: colors.accent2, fontSize: 12.5, fontWeight: "700" },
  dayDividerWrap: { alignItems: "center", marginVertical: 12 },
  dayDividerText: { color: colors.textMuted, fontSize: 11, fontWeight: "700", backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  bubbleRow: { flexDirection: "row", marginBottom: 6 },
  bubbleRowMe: { justifyContent: "flex-end" },
  bubbleRowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: radius.card, padding: 10, gap: 4 },
  bubbleMe: { backgroundColor: colors.accent2, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleText: { color: colors.text, fontSize: 14.5, lineHeight: 20 },
  bubbleTextMe: { color: colors.bg },
  bubbleImage: { width: 200, height: 200, borderRadius: radius.input, backgroundColor: colors.surface2 },
  bubbleImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  bubbleFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 2 },
  bubbleTime: { color: colors.textMuted, fontSize: 10 },
  bubbleTimeMe: { color: "rgba(10,12,15,0.65)" },
  composerWrap: { borderTopWidth: 1, borderTopColor: colors.border, padding: 10, gap: 8, backgroundColor: colors.bg },
  pendingAttachmentRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.input, padding: 8 },
  pendingAttachmentThumb: { width: 40, height: 40, borderRadius: 8 },
  pendingAttachmentText: { flex: 1, color: colors.textMuted, fontSize: 12 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  composerIconBtn: { padding: 6 },
  composerInput: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14.5,
    maxHeight: 120,
  },
  sendBtn: { backgroundColor: colors.accent2, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.5 },
});
