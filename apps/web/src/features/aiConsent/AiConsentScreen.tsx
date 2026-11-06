import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/shared/components/ui/item";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import { AI_CONSENT_VERSION, AI_PROVIDERS } from "./aiConsentCopy";

interface AiConsentScreenProps {
  /** Called after "Not now" is saved (the gate uses it to leave review mode). */
  onDeclined?: () => void;
}

/** App Store guidelines 5.1.1(i) / 5.1.2(i): what is sent, to whom, and permission first. */
export function AiConsentScreen({ onDeclined }: AiConsentScreenProps) {
  const grant = useMutation(api.userPreferences.index.grantAiConsent);
  const decline = useMutation(api.userPreferences.index.declineAiConsent);
  const { showError } = useServiceErrorToast();
  const [pending, setPending] = useState<"allow" | "decline" | null>(null);

  const handleAllow = async () => {
    setPending("allow");
    try {
      await grant({ version: AI_CONSENT_VERSION });
    } catch (err) {
      showError(err);
    } finally {
      setPending(null);
    }
  };

  const handleDecline = async () => {
    setPending("decline");
    try {
      await decline({});
      onDeclined?.();
    } catch (err) {
      showError(err);
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="flex min-h-dvh w-full justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-display text-2xl text-foreground">How SolomindLM uses AI</h1>
        <p className="text-muted-foreground">
          To answer your questions and build study materials, SolomindLM sends some of your content
          to these services:
        </p>
        <ItemGroup variant="grouped">
          {AI_PROVIDERS.map((provider) => (
            <Item key={provider.name}>
              <ItemContent>
                <ItemTitle>{provider.name}</ItemTitle>
                <p className="text-sm text-muted-foreground">
                  {provider.data}, {provider.purpose}.
                </p>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
        <p className="text-sm text-muted-foreground">
          Change this any time in the menu.{" "}
          <Link to="/privacy" className="text-link underline">
            Privacy policy
          </Link>
        </p>
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={handleAllow} disabled={pending !== null}>
            Allow and continue
          </Button>
          <Button size="lg" variant="secondary" onClick={handleDecline} disabled={pending !== null}>
            Not now
          </Button>
        </div>
      </div>
    </main>
  );
}
