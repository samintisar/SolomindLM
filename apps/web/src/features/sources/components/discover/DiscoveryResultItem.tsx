import { Check, ExternalLink, GraduationCap, Plus, Quote } from "lucide-react";
import { useId } from "react";
import { Favicon } from "@/shared/components/Favicon";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/shared/components/ui/item";
import { Spinner } from "@/shared/components/ui/spinner";
import type { UnifiedDiscoveryResult } from "@/shared/types/index";
import {
  accessInfo,
  formatAcademicByline,
  getHostname,
  isSnippetMeaningful,
  relevanceLevel,
} from "./discoveryFormat";
import { SOURCE_TYPE_META } from "./sourceTypes";

const RELEVANCE_LABEL = { high: "High match", medium: "Medium match", low: "Low match" } as const;

interface DiscoveryResultItemProps {
  result: UnifiedDiscoveryResult;
  selected: boolean;
  inNotebook: boolean;
  adding: boolean;
  limitReached: boolean;
  onToggle: () => void;
  onAdd: () => void;
}

export function DiscoveryResultItem({
  result,
  selected,
  inNotebook,
  adding,
  limitReached,
  onToggle,
  onAdd,
}: DiscoveryResultItemProps) {
  const checkboxId = useId();
  const hostname = getHostname(result.url).replace(/^www\./, "");
  const title = result.title || hostname;
  const byline = formatAcademicByline(result);
  const access = accessInfo(result);
  const showSnippet = isSnippetMeaningful(result.title, result.snippet);
  const citations = result.metadata.citationCount;

  return (
    <div role="listitem">
      <Item asChild size="sm">
        <label
          htmlFor={checkboxId}
          className="cursor-pointer items-start has-disabled:cursor-default"
        >
          <ItemMedia>
            <Checkbox
              id={checkboxId}
              checked={selected || inNotebook}
              disabled={inNotebook}
              onCheckedChange={onToggle}
              aria-label={`Include ${title}`}
            />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <div className="flex items-start gap-2">
              {result.sourceType === "academic" ? (
                <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                  <GraduationCap aria-hidden className="size-4" />
                </span>
              ) : (
                <Favicon url={result.url} size={16} className="mt-0.5" />
              )}
              <span className="line-clamp-2 font-medium">{title}</span>
            </div>
            {byline && <p className="text-sm text-muted-foreground">{byline}</p>}
            {showSnippet && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{result.snippet}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">{SOURCE_TYPE_META[result.sourceType].label}</Badge>
              <Badge variant="outline">{hostname}</Badge>
              <Badge variant="outline">{RELEVANCE_LABEL[relevanceLevel(result.score)]}</Badge>
              {access && (
                <Badge variant="outline" title={access.title}>
                  {access.label}
                </Badge>
              )}
              {citations != null && (
                <Badge variant="outline">
                  <Quote aria-hidden /> {citations.toLocaleString()} citations
                </Badge>
              )}
            </div>
          </ItemContent>
          {/* Controls here must not toggle the row's checkbox through the surrounding label. */}
          <ItemActions onClick={(e) => e.preventDefault()}>
            <Button variant="ghost" size="icon-sm" asChild>
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${title} in new tab`}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink aria-hidden />
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={inNotebook || adding || limitReached}
              aria-label={!inNotebook && !adding && !limitReached ? `Add ${title}` : undefined}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdd();
              }}
            >
              {inNotebook ? (
                <>
                  <Check aria-hidden /> Added
                </>
              ) : adding ? (
                <>
                  <Spinner aria-hidden /> Adding…
                </>
              ) : limitReached ? (
                "Limit reached"
              ) : (
                <>
                  <Plus aria-hidden /> Add
                </>
              )}
            </Button>
          </ItemActions>
        </label>
      </Item>
    </div>
  );
}
