import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useColorScheme } from "@/components/useColorScheme";

export default function NotFoundScreen() {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#fff" : "#000";

  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={[styles.container, { backgroundColor: dark ? "#000" : "#fff" }]}>
        <Text style={[styles.title, { color: textColor }]}>This screen doesn't exist.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: "#2e78b7",
  },
});
