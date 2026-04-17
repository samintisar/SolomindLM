import React, { useMemo, useState } from "react";
import { X, Copy, Check, Users, GitFork, Ban, Loader2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useToast } from "@/shared/contexts/ToastContext";

interface ShareNotebookModalProps {
  notebookId: string;
  onClose: () => void;
}

function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

type ShareLinkRow = {
  id: string;
  kind: "collaborate" | "fork";
  createdAt: number;
  revokedAt: number | null;
  active: boolean;
};

export const ShareNotebookModal: React.FC<ShareNotebookModalProps> = ({ notebookId, onClose }) => {
  const { success, error: showError } = useToast();

  const shareListArgs = useMemo(
    () => ({ notebookId: notebookId as Id<"notebooks"> }),
    [notebookId]
  );

  const links = useQuery(api.notebooks.sharing.listShareLinks, shareListArgs);

  const createLink = useMutation(api.notebooks.sharing.createShareLink);
  const revokeLinkMutation = useMutation(
    api.notebooks.sharing.revokeShareLink
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.notebooks.sharing.listShareLinks, shareListArgs);
    if (current === undefined) return;
    localStore.setQuery(
      api.notebooks.sharing.listShareLinks,
      shareListArgs,
      current.map((entry: ShareLinkRow) =>
        entry.id === args.shareLinkId ? { ...entry, active: false, revokedAt: Date.now() } : entry
      )
    );
  });

  const [busy, setBusy] = useState<"collaborate" | "fork" | null>(null);
  const [coworkUrl, setCoworkUrl] = useState<string | null>(null);
  const [forkUrl, setForkUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const activeLinks = useMemo(() => (links ?? []).filter((l: ShareLinkRow) => l.active), [links]);

  const handleCreate = async (kind: "collaborate" | "fork") => {
    setBusy(kind);
    try {
      const res = await createLink({
        notebookId: notebookId as Id<"notebooks">,
        kind,
      });
      const url =
        kind === "collaborate"
          ? `${origin}/notebook/${notebookId}?share=${res.token}`
          : `${origin}/share/fork/${res.token}`;
      if (kind === "collaborate") {
        setCoworkUrl(url);
        setForkUrl(null);
      } else {
        setForkUrl(url);
        setCoworkUrl(null);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not create share link");
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    await copyText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleRevoke = async (shareLinkId: Id<"notebookShareLinks">) => {
    setRevokingId(shareLinkId);
    try {
      await revokeLinkMutation({ shareLinkId });
      success("Link removed");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not remove link");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h3 className="text-lg font-bold font-sans">Share notebook</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
              <Users className="w-4 h-4" />
              Work in the same notebook
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              People with the link can sign in and edit sources and Studio content with you. Chat
              stays private per person.
            </p>
            <div className="flex justify-center">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleCreate("collaborate")}
                className="w-fit py-2 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {busy === "collaborate" ? "Creating…" : "Create cowork link"}
              </button>
            </div>
            {coworkUrl && (
              <div className="mt-2 flex gap-2">
                <input
                  readOnly
                  className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-muted/40 truncate"
                  value={coworkUrl}
                />
                <button
                  type="button"
                  onClick={() => void handleCopy("cowork", coworkUrl)}
                  className="shrink-0 p-2 rounded border border-border hover:bg-secondary"
                  title="Copy link"
                >
                  {copied === "cowork" ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
              <GitFork className="w-4 h-4" />
              Duplicate to their account
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Anyone with the link can create their own copy (sources, Studio, manual notes).
              Conversations are not copied.
            </p>
            <div className="flex justify-center">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleCreate("fork")}
                className="w-fit py-2 px-4 rounded-lg border border-border bg-secondary/50 text-sm font-medium hover:bg-secondary disabled:opacity-50"
              >
                {busy === "fork" ? "Creating…" : "Create fork link"}
              </button>
            </div>
            {forkUrl && (
              <div className="mt-2 flex gap-2">
                <input
                  readOnly
                  className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-muted/40 truncate"
                  value={forkUrl}
                />
                <button
                  type="button"
                  onClick={() => void handleCopy("fork", forkUrl)}
                  className="shrink-0 p-2 rounded border border-border hover:bg-secondary"
                  title="Copy link"
                >
                  {copied === "fork" ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>

          {activeLinks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Active links
              </p>
              <ul className="space-y-2">
                {activeLinks.map((l: ShareLinkRow) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border/60 last:border-0"
                  >
                    <span>
                      {l.kind === "collaborate" ? "Cowork" : "Fork"} · created{" "}
                      {new Date(l.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      disabled={revokingId === l.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRevoke(l.id as Id<"notebookShareLinks">);
                      }}
                      className="shrink-0 p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-50"
                      title="Remove link"
                      aria-label="Remove share link"
                    >
                      {revokingId === l.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Ban className="w-4 h-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
