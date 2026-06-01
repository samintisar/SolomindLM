import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  pickDocument,
  pickFromCamera,
  pickFromLibrary,
} from "@mobile/services/fileUpload/nativeFilePicker";
import { uploadPickedFileToNotebook } from "@mobile/services/fileUpload/uploadService";
import { useConvexAuth, useMutation } from "convex/react";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";

export function FileUploadButton({ notebookId, style }: { notebookId: string; style?: ViewStyle }) {
  const { isAuthenticated } = useConvexAuth();
  const generateUploadUrl = useMutation(api.documents.index.generateUploadUrl);
  const createDocument = useMutation(api.documents.index.upload);
  const [busy, setBusy] = useState(false);

  const runUpload = async (
    picker: () => Promise<{
      uri: string;
      name: string;
      mimeType?: string;
      size?: number;
    } | null>
  ) => {
    if (!isAuthenticated) {
      Alert.alert(
        "Sign in required",
        "Open the Home tab and complete sign-in in the web view so your session syncs to the app. Then try again."
      );
      return;
    }
    try {
      setBusy(true);
      const picked = await picker();
      if (!picked) return;
      await uploadPickedFileToNotebook({
        generateUploadUrl: () => generateUploadUrl(),
        createDocument: (args) =>
          createDocument({
            notebookId: notebookId as Id<"notebooks">,
            type: "file",
            storageId: args.storageId,
            fileName: args.fileName,
            fileSize: args.fileSize,
            contentType: args.contentType,
          }),
        notebookId,
        fileUri: picked.uri,
        fileName: picked.name,
        mimeType: picked.mimeType,
        fileSize: picked.size,
      });
      Alert.alert("Uploaded", "Your file was added to this notebook.");
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      style={[styles.fab, style]}
      disabled={busy}
      onPress={() =>
        Alert.alert("Add source", "Choose a source", [
          { text: "File", onPress: () => void runUpload(pickDocument) },
          { text: "Photo library", onPress: () => void runUpload(pickFromLibrary) },
          { text: "Camera", onPress: () => void runUpload(pickFromCamera) },
          { text: "Cancel", style: "cancel" },
        ])
      }
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.fabText}>＋</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2f95dc",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: "#fff", fontSize: 28, lineHeight: 32, marginTop: -2 },
});
