import { Item, ItemContent, ItemGroup, ItemTitle } from "@/shared/components/ui/item";
import { AI_PROVIDERS } from "./aiConsentCopy";

/** The AI-provider disclosure, shared so the consent screen and the Turn off dialog read the same. */
export function AiProviderList() {
  return (
    <ItemGroup variant="grouped">
      {AI_PROVIDERS.map((provider) => (
        <Item key={provider.name}>
          <ItemContent>
            <ItemTitle>{provider.name}</ItemTitle>
            {/* Plain <p>, not ItemDescription: its line clamp would cut the disclosure off. */}
            <p className="text-sm text-muted-foreground">
              {provider.data}, {provider.purpose}.
            </p>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
