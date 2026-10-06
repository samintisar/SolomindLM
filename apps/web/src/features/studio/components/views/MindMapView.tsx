import { ArrowLeft, Network, XCircle } from "lucide-react";
import type React from "react";
import { useMemo } from "react";
import { useChatStreamingContext } from "@/features/chat/useChatStreaming";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";
import type { MindMapNote } from "@/shared/types/index";
import { MindMapOutline } from "../mindmap/MindMapOutline";
import { sanitizeNodeTree } from "../mindmap/outline";

export interface MindMapViewProps {
  note: MindMapNote;
  onBack?: () => void;
  onAskInChat?: (prompt: string, documentIds?: string[]) => void;
}

/** The stored error as text. Metadata isn't validated, so only a non-empty string is shown. */
function errorMessage(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string" && message) return message;
  }
  return "An unknown error occurred";
}

/** A mind map note as a collapsible outline; clicking a topic asks the notebook chat about it. */
export const MindMapView: React.FC<MindMapViewProps> = ({ note, onBack, onAskInChat }) => {
  const { isChatStreaming, remoteGenerationBlocksSend } = useChatStreamingContext();
  const nodeData = note.mindMapData?.nodeData;
  const root = useMemo(
    () => sanitizeNodeTree(nodeData, note.title?.trim() || "Mind Map", true),
    [nodeData, note.title]
  );

  if (note.status === "failed") {
    return (
      <div className="flex h-full flex-col gap-4 bg-background p-4 duration-300 ease-out animate-in fade-in slide-in-from-right-4">
        <Alert variant="destructive">
          <XCircle />
          <AlertTitle>Mind map generation failed</AlertTitle>
          <AlertDescription>{errorMessage(note.metadata?.error)}</AlertDescription>
        </Alert>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <XCircle />
            </EmptyMedia>
            <EmptyTitle>Failed to generate mind map</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!note.mindMapData) {
    return (
      <div className="flex h-full flex-col bg-background">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Network />
            </EmptyMedia>
            <EmptyTitle>No mind map data available</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (root.children.length === 0) {
    return (
      <div className="flex h-full flex-col bg-background">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Network />
            </EmptyMedia>
            <EmptyTitle>This mind map has no topics</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-card duration-300 ease-out animate-in fade-in slide-in-from-right-4">
      {onBack && (
        <div className="flex shrink-0 items-center px-2 py-2 md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MindMapOutline
          key={note.id}
          title={note.title}
          root={root}
          onAsk={
            onAskInChat ? (prompt) => onAskInChat(prompt, note.metadata?.documentIds) : undefined
          }
          askDisabled={isChatStreaming || remoteGenerationBlocksSend}
        />
      </div>
    </div>
  );
};
