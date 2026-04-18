import { Text, View } from "react-native";

/** Reserved for native @convex-dev/auth (currently WebView-first). */
export function NativeSignInPlaceholder() {
  return (
    <View style={{ padding: 16 }}>
      <Text>Sign-in runs in the web session (Notebook tab).</Text>
    </View>
  );
}
