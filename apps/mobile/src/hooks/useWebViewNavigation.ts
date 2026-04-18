import { useCallback, useState } from "react";

export function useWebViewNavigation() {
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const onUrlChange = useCallback((url: string) => {
    setLastUrl(url);
  }, []);
  return { lastUrl, onUrlChange };
}
