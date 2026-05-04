import { Text } from "./Themed";
import { TextProps } from "./Themed.utils";

export function MonoText(props: TextProps) {
  return <Text {...props} style={[props.style, { fontFamily: "SpaceMono" }]} />;
}
