import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isNativeShell } from "@/utils/platformDetection";
import { useForkNotebookFromToken, usePeekShareToken } from "../../services/notebooksApi";

/**
 * Landing page for fork-only share links: /share/fork/:token
 */
export function ForkNotebookPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useMemo(() => {
    const m = location.pathname.match(/^\/share\/fork\/([^/]+)\/?$/);
    return m?.[1] ?? null;
  }, [location.pathname]);
  const fork = useForkNotebookFromToken();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const preview = usePeekShareToken(token);

  const handleFork = async () => {
    if (!token) return;
    setWorking(true);
    setError(null);
    try {
      const { newNotebookId } = await fork({ token });
      navigate(`/notebook/${newNotebookId}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not duplicate notebook");
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-bold font-sans mb-2">Duplicate notebook</h1>
      {preview === undefined && <p className="text-muted-foreground text-sm">Loading…</p>}
      {preview === null && (
        <p className="text-destructive text-sm">This link is invalid or has been revoked.</p>
      )}
      {preview && preview.kind !== "fork" && (
        <p className="text-destructive text-sm">This link is not a fork link.</p>
      )}
      {preview && preview.kind === "fork" && (
        <>
          <p className="text-muted-foreground text-sm mb-6">
            You will get a copy of{" "}
            <span className="font-medium text-foreground">{preview.title}</span> in your account
            (sources, Studio, manual notes). Chat history is not copied.
          </p>
          <button
            type="button"
            disabled={working}
            onClick={() => void handleFork()}
            className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
          >
            {working ? "Duplicating…" : "Duplicate to my account"}
          </button>
        </>
      )}
      {error && <p className="text-destructive text-sm mt-4">{error}</p>}
      {!isNativeShell() && (
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="mt-8 text-sm text-muted-foreground hover:text-foreground underline"
        >
          Back to home
        </button>
      )}
    </main>
  );
}
