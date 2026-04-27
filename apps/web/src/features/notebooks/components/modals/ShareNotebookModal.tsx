import React, { useMemo, useState } from "react";
import { X, Copy, Check, Users, GitFork, Ban, Loader2, Lock } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useToast } from "@/shared/contexts/ToastContext";
import { Button } from "@/shared/components/ui/button";

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

function formatLinkTimestamp(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function LinkUrlRow({
  url,
  copyKey,
  copied,
  onCopy,
}: {
  url: string;
  copyKey: string;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const done = copied === copyKey;
  return (
    <div className="mt-4 animate-in fade-in duration-200">
      <p className="mb-2 text-xs text-muted-foreground">Copy and share this URL with your invitee.</p>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div
          className="min-w-0 flex-1 rounded-lg border border-border/80 bg-muted/40 px-3 py-2.5 shadow-sm"
          title={url}
        >
          <p className="truncate font-mono text-[11px] leading-normal text-foreground/90 sm:text-xs">
            {url}
          </p>
        </div>
        <Button
          type="button"
          variant={done ? "outline" : "default"}
          size="sm"
          className="h-9 w-full shrink-0 gap-1.5 px-4 sm:w-auto"
          onClick={() => void onCopy(copyKey, url)}
        >
          {done ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy link</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

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
      } else {
        setForkUrl(url);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-notebook-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <div className="min-w-0 pr-2">
            <h3 id="share-notebook-title" className="text-lg font-bold text-foreground">
              Share notebook
            </h3>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">
              Generate a signed-in link to collaborate or to let someone duplicate this notebook into
              their account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-0 md:grid-cols-2 md:divide-x md:divide-border">
            {/* Cowork */}
            <section className="flex flex-col border-b border-border p-6 md:border-b-0 md:pr-8">
              <div className="mb-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Cowork
                </div>
                <p className="text-sm font-semibold text-foreground">Shared workspace</p>
                <p className="text-sm text-muted-foreground">
                  Editors can manage sources, folders, Studio, and chat. Chat threads stay in sync for
                  everyone on this notebook.
                </p>
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={busy !== null}
                onClick={() => void handleCreate("collaborate")}
              >
                {busy === "collaborate" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating link…
                  </span>
                ) : (
                  "Create cowork link"
                )}
              </Button>
              {coworkUrl ? (
                <LinkUrlRow url={coworkUrl} copyKey="cowork" copied={copied} onCopy={handleCopy} />
              ) : null}
            </section>

            {/* Duplicate */}
            <section className="flex flex-col p-6 md:pl-8">
              <div className="mb-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <GitFork className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Duplicate
                </div>
                <p className="text-sm font-semibold text-foreground">Copy to their account</p>
                <p className="text-sm text-muted-foreground">
                  Recipients get sources, Studio work, and manual notes they own. Conversations are
                  not copied.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full border-border/80 bg-background/50 font-medium hover:bg-secondary/80"
                disabled={busy !== null}
                onClick={() => void handleCreate("fork")}
              >
                {busy === "fork" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating link…
                  </span>
                ) : (
                  "Create duplicate link"
                )}
              </Button>
              {forkUrl ? (
                <LinkUrlRow url={forkUrl} copyKey="fork" copied={copied} onCopy={handleCopy} />
              ) : null}
            </section>
          </div>

          {activeLinks.length > 0 ? (
            <div className="border-t border-border px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <h4 className="text-sm font-medium text-foreground">Active links</h4>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {activeLinks.length}
                </span>
              </div>
              <ul className="overflow-hidden rounded-lg border border-border/80 bg-muted/20">
                {activeLinks.map((l: ShareLinkRow, i: number) => (
                  <li
                    key={l.id}
                    className={`flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-3 py-3 sm:px-4 ${
                      i > 0 ? "border-t border-border/60" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={
                            l.kind === "collaborate"
                              ? "rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                              : "rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-foreground"
                          }
                        >
                          {l.kind === "collaborate" ? "Cowork" : "Duplicate"}
                        </span>
                        <time
                          className="text-xs text-muted-foreground"
                          dateTime={new Date(l.createdAt).toISOString()}
                        >
                          {formatLinkTimestamp(l.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1 text-xs leading-snug text-muted-foreground/90">
                        Anyone with this link can use it until you revoke it.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={revokingId === l.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRevoke(l.id as Id<"notebookShareLinks">);
                      }}
                      className="w-full justify-center text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto sm:justify-end sm:shrink-0"
                      title="Revoke this link"
                    >
                      {revokingId === l.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Ban className="mr-1.5 h-3.5 w-3.5" />
                          Revoke
                        </>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex gap-3 border-t border-border bg-secondary/10 px-6 py-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Links require sign-in. You remain the owner; coworkers join as editors until you remove
              access or revoke a link.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
