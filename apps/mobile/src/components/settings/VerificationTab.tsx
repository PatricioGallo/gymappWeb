import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { AlertMessage } from "@/components/AlertMessage";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import type { Profile } from "@/lib/profileService";
import {
  CREDENTIAL_COMPLETION_STATUS_LABELS,
  CREDENTIAL_COMPLETION_STATUS_OPTIONS,
  CREDENTIAL_SPECIALTY_LABELS,
  CREDENTIAL_SPECIALTY_OPTIONS,
  CREDENTIAL_TYPE_LABELS,
  CREDENTIAL_TYPE_OPTIONS,
  MAX_CREDENTIALS,
  MAX_VERIFICATION_DOCUMENTS,
  getMyVerificationRequest,
  getVerificationDocumentUrl,
  resubmitVerificationRequest,
  submitVerificationRequest,
  uploadVerificationDocumentFromUri,
  type Credential,
  type CredentialCompletionStatus,
  type CredentialSpecialty,
  type CredentialType,
  type VerificationRequest,
} from "@/lib/verificationService";
import { colors, radius } from "@/theme/colors";

const STATUS_LABELS: Record<string, string> = {
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
};

function emptyCredential(): Credential {
  return { type: "terciario", institution: "", specialty: "profesor_ed_fisica", completionStatus: "recibido" };
}

export function VerificationTab({ profile, userId }: { profile: Profile; userId: string }) {
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [docUrls, setDocUrls] = useState<string[]>([]);

  const isTrainer = profile.user_type === "entrenador";
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [draft, setDraft] = useState<Credential>(emptyCredential());
  const [documents, setDocuments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [pickerFor, setPickerFor] = useState<"type" | "specialty" | "status" | null>(null);

  async function load() {
    setLoading(true);
    const req = await getMyVerificationRequest(userId).catch(() => null);
    setRequest(req);
    if (req && (req.status === "pending" || req.status === "approved")) {
      const urls = await Promise.all(((req.documents as string[]) ?? []).map((p) => getVerificationDocumentUrl(p)));
      setDocUrls(urls.filter((u): u is string => Boolean(u)));
    } else {
      setDocuments((req?.documents as string[]) ?? []);
      setCredentials(req?.credentials ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function addCredential() {
    if (credentials.length >= MAX_CREDENTIALS) return;
    if (!draft.institution.trim()) {
      setError("Ingresá la institución para agregar el título.");
      return;
    }
    setError("");
    setCredentials((prev) => [...prev, draft]);
    setDraft(emptyCredential());
  }

  function removeCredential(index: number) {
    setCredentials((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAddPhoto() {
    if (documents.length >= MAX_VERIFICATION_DOCUMENTS) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso necesario", "Necesitamos acceso a tus fotos para subir la documentación.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    const asset = result.assets[0];
    const { path, error: uploadError } = await uploadVerificationDocumentFromUri(userId, asset.uri, asset.mimeType);
    setUploading(false);
    if (uploadError || !path) {
      Alert.alert("No se pudo subir la foto", uploadError ?? "Probá de nuevo.");
      return;
    }
    setDocuments((prev) => [...prev, path]);
  }

  function removeDocument(index: number) {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError("");
    if (isTrainer && credentials.length === 0) {
      setError("Agregá al menos un título o certificación.");
      return;
    }
    if (documents.length === 0) {
      setError("Subí al menos una foto de tu documentación.");
      return;
    }
    setSaving(true);
    const result =
      request && request.status === "rejected" ? await resubmitVerificationRequest(request.id, isTrainer ? credentials : [], documents) : await submitVerificationRequest(userId, isTrainer ? credentials : [], documents);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSavedMsg("¡Solicitud enviada! Te avisamos cuando la revisemos.");
    await load();
    setTimeout(() => setSavedMsg(""), 2600);
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.accent2} />
      </View>
    );
  }

  const readOnly = request && (request.status === "pending" || request.status === "approved");

  const typeItems: ActionMenuItem[] = CREDENTIAL_TYPE_OPTIONS.map((t) => ({ label: CREDENTIAL_TYPE_LABELS[t], onPress: () => setDraft((d) => ({ ...d, type: t })) }));
  const specialtyItems: ActionMenuItem[] = CREDENTIAL_SPECIALTY_OPTIONS.map((s) => ({ label: CREDENTIAL_SPECIALTY_LABELS[s], onPress: () => setDraft((d) => ({ ...d, specialty: s })) }));
  const statusItems: ActionMenuItem[] = CREDENTIAL_COMPLETION_STATUS_OPTIONS.map((s) => ({
    label: CREDENTIAL_COMPLETION_STATUS_LABELS[s],
    onPress: () => setDraft((d) => ({ ...d, completionStatus: s })),
  }));

  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Verificación</Text>
        <Text style={styles.cardSubtitle}>
          {profile.user_type === "gimnasio" ? "Subí documentación que acredite tu gimnasio para obtener el tilde verde." : "Subí tu título o certificación para obtener el tilde verde de entrenador."}
        </Text>

        {request && <Text style={styles.statusPill}>Estado: {STATUS_LABELS[request.status] ?? request.status}</Text>}
        {request?.admin_note && <Text style={styles.adminNote}>Nota del equipo: {request.admin_note}</Text>}

        {readOnly ? (
          <View style={styles.docsGrid}>
            {docUrls.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.docThumb} />
            ))}
          </View>
        ) : (
          <>
            {isTrainer && (
              <View style={styles.credentialsSection}>
                <Text style={styles.sectionLabel}>Tus títulos / certificaciones ({credentials.length}/{MAX_CREDENTIALS})</Text>
                {credentials.map((c, i) => (
                  <View key={i} style={styles.credentialRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.credentialTitle}>{CREDENTIAL_TYPE_LABELS[c.type]} — {CREDENTIAL_SPECIALTY_LABELS[c.specialty]}</Text>
                      <Text style={styles.credentialSub}>
                        {c.institution} · {CREDENTIAL_COMPLETION_STATUS_LABELS[c.completionStatus]}
                      </Text>
                    </View>
                    <Pressable onPress={() => removeCredential(i)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ))}

                {credentials.length < MAX_CREDENTIALS && (
                  <View style={styles.draftCard}>
                    <Pressable style={styles.pickerField} onPress={() => setPickerFor("type")}>
                      <Text style={styles.pickerFieldText}>{CREDENTIAL_TYPE_LABELS[draft.type]}</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                    </Pressable>
                    <Pressable style={styles.pickerField} onPress={() => setPickerFor("specialty")}>
                      <Text style={styles.pickerFieldText}>{CREDENTIAL_SPECIALTY_LABELS[draft.specialty]}</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                    </Pressable>
                    <Pressable style={styles.pickerField} onPress={() => setPickerFor("status")}>
                      <Text style={styles.pickerFieldText}>{CREDENTIAL_COMPLETION_STATUS_LABELS[draft.completionStatus]}</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                    </Pressable>
                    <FormField label="Institución" placeholder="Nombre de la institución" value={draft.institution} onChangeText={(v) => setDraft((d) => ({ ...d, institution: v }))} />
                    <Pressable style={styles.addCredentialBtn} onPress={addCredential}>
                      <Text style={styles.addCredentialBtnText}>+ Agregar título</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            <View style={styles.credentialsSection}>
              <Text style={styles.sectionLabel}>
                Fotos de la documentación ({documents.length}/{MAX_VERIFICATION_DOCUMENTS})
              </Text>
              <View style={styles.docsGrid}>
                {documents.map((path, i) => (
                  <View key={path} style={styles.docThumbWrap}>
                    <View style={styles.docThumbPending}>
                      <Ionicons name="document-attach-outline" size={22} color={colors.textMuted} />
                    </View>
                    <Pressable style={styles.docRemoveBtn} onPress={() => removeDocument(i)}>
                      <Ionicons name="close" size={14} color={colors.text} />
                    </Pressable>
                  </View>
                ))}
                {documents.length < MAX_VERIFICATION_DOCUMENTS && (
                  <Pressable style={styles.addPhotoBtn} onPress={handleAddPhoto} disabled={uploading}>
                    {uploading ? <ActivityIndicator size="small" color={colors.accent2} /> : <Ionicons name="add" size={22} color={colors.accent2} />}
                  </Pressable>
                )}
              </View>
            </View>

            <AlertMessage message={error} />
            <PrimaryButton title={request?.status === "rejected" ? "Reenviar solicitud" : "Enviar solicitud"} onPress={handleSubmit} loading={saving} />
            {savedMsg ? <Text style={styles.savedText}>{savedMsg}</Text> : null}
          </>
        )}
      </View>

      <ActionMenu visible={pickerFor === "type"} onClose={() => setPickerFor(null)} items={typeItems} />
      <ActionMenu visible={pickerFor === "specialty"} onClose={() => setPickerFor(null)} items={specialtyItems} />
      <ActionMenu visible={pickerFor === "status"} onClose={() => setPickerFor(null)} items={statusItems} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: 40, alignItems: "center" },
  stack: { gap: 16 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 18, gap: 10 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardSubtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: -4 },
  statusPill: {
    alignSelf: "flex-start",
    color: colors.accent2,
    backgroundColor: colors.accentSoft,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  adminNote: { color: colors.textMuted, fontSize: 12.5, fontStyle: "italic" },
  sectionLabel: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700", marginTop: 6 },
  credentialsSection: { gap: 8 },
  credentialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    padding: 12,
    backgroundColor: colors.surface2,
  },
  credentialTitle: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  credentialSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  draftCard: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.card, padding: 12, gap: 4 },
  pickerField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  pickerFieldText: { color: colors.text, fontSize: 14 },
  addCredentialBtn: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingVertical: 10, alignItems: "center" },
  addCredentialBtnText: { color: colors.accent2, fontWeight: "700", fontSize: 13.5 },
  docsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  docThumb: { width: 72, height: 72, borderRadius: radius.input, backgroundColor: colors.surface2 },
  docThumbWrap: { position: "relative" },
  docThumbPending: { width: 72, height: 72, borderRadius: radius.input, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  docRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: radius.input,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  savedText: { color: colors.live, fontSize: 13, fontWeight: "600", textAlign: "center" },
});
