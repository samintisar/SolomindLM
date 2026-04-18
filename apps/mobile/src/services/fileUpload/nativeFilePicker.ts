import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

export type PickedFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*", "text/*"],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return {
    uri: a.uri,
    name: a.name,
    mimeType: a.mimeType ?? undefined,
    size: a.size ?? undefined,
  };
}

export async function pickFromCamera(): Promise<PickedFile | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Camera permission denied");
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.9,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  const name = a.fileName ?? `photo-${Date.now()}.jpg`;
  return {
    uri: a.uri,
    name,
    mimeType: a.mimeType ?? "image/jpeg",
    size: a.fileSize,
  };
}

export async function pickFromLibrary(): Promise<PickedFile | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Photo library permission denied");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.9,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  const name = a.fileName ?? `image-${Date.now()}.jpg`;
  return {
    uri: a.uri,
    name,
    mimeType: a.mimeType ?? "image/jpeg",
    size: a.fileSize,
  };
}
