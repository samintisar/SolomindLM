import { Text, View } from "react-native";

/** Reserved for native sign-up. */
export function NativeSignUpPlaceholder() {
  return (
    <View style={{ padding: 16 }}>
      <Text>Sign-up runs in the web session.</Text>
    </View>
  );
}
