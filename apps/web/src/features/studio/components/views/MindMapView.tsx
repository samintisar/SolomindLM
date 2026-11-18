import { Network, XCircle } from "lucide-react";
import type React from "react";
import { useMemo } from "react";
import { useChatStreamingContext } from "@/features/chat/useChatStreaming";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";
import type { MindMapNote } from "@/shared/types/index";
import { studioErrorMessage } from "../../utils/studioErrorMessage";
import { MindMapOutline } from "../mindmap/MindMapOutline";
import { sanitizeNodeTree } from "../mindmap/outline";

export interface MindMapViewProps {
  note: MindMapNote;
  onAskInChat?: (prompt: string, documentIds?: string[]) => void;
}

/** A mind map note as a collapsible outline; clicking a topic asks the notebook chat about it. */
export const MindMapView: React.FC<MindMapViewProps> = ({ note, onAskInChat }) => {
  const { isChatStreaming, remoteGenerationBlocksSend } = useChatStreamingContext();
  const title = note.title?.trim() || "Mind Map";
  const root = useMemo(
    () => sanitizeNodeTree(note.mindMapData?.nodeData, title, true),
    [note.mindMapData, title]
  );

  if (note.status === "failed") {
    return (
      <div className="flex h-full flex-col gap-4 bg-background p-4 duration-300 ease-out animate-in fade-in slide-in-from-right-4">
        <Alert variant="destructive">
          <XCircle />
          <AlertTitle>Mind map generation failed</AlertTitle>
          <AlertDescription>{studioErrorMessage(note.metadata?.error)}</AlertDescription>
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MindMapOutline
          key={note.id}
          title={title}
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
