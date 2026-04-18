import { Platform } from "react-native";

export function getNativePlatform(): "ios" | "android" {
  return Platform.OS === "ios" ? "ios" : "android";
}
