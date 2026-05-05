# Design: ChatPanel Component Refactoring

## Problem Statement

`ChatPanel.tsx` has grown to 942 lines, violating the Single Responsibility Principle. It mixes:
- UI rendering (header, messages list, input)
- Complex tooltip/citation positioning logic
- Conversation pinning state + localStorage persistence
- Chat action handlers (export, save, config)
- Research plan approval/reject flows
- Message sending logic with validation

This makes the component hard to reason about, test, and maintain.

## Goals

1. Reduce `ChatPanel.tsx` to ~150 lines (composition root only)
2. Extract business logic into testable custom hooks
3. Extract presentational sub-components
4. Maintain exact existing behavior — no functional changes
5. Keep all types and prop interfaces well-defined

## Approach

### Phase 1: Extract Custom Hooks

Move stateful logic into focused, reusable hooks:

**`hooks/useReferenceTooltip.ts`** (~120 lines)
- Manages: `hoveredRefId`, `hoveredMessageId`, `tooltipPosition`, `tooltipStyle`, `isTooltipHovered`
- Handlers: `handleRefHover`, `handleRefLeave`, `handleRefClick`, `closeTooltip`
- Computes: `tooltipContent` with positioning math
- Returns: state + handlers + computed content

**`hooks/useChatActions.ts`** (~80 lines)
- Handlers: `handleExportChat`, `handleSaveToNote`, `handleSaveChatConfig`
- Dependencies: `messages`, `notebookId`, `saveChat`, `updateNotebook`
- Returns: action handlers + loading states

**`hooks/useConversationPinning.ts`** (~50 lines)
- State: `pinnedIds` (Set, backed by localStorage)
- Handlers: `handleTogglePin`, `handlePinActiveChat`
- Returns: pinnedIds + handlers

**`hooks/useResearchPlanActions.ts`** (~60 lines)
- Mutations: `approvePlanMutation`, `rejectPlanMutation`
- Handlers: `handleApproveResearchPlan`, `handleRejectResearchPlan`
- Returns: approval/rejection handlers

### Phase 2: Extract Presentational Components

**`components/ChatHeader.tsx`** (~130 lines)
- Props: all toolbar state + callbacks
- Contains: sidebar toggles, history dropdown, new chat, dropdown menu

**`components/ChatMessages.tsx`** (~150 lines)
- Props: messages, virtuoso ref, tooltip state, message handlers
- Contains: `Virtuoso` setup, `MessageBubble` / `ResearchPlanMessage` rendering, `ReferenceTooltip` overlay

**`components/ChatToolbar.tsx`** (~60 lines)
- Props: action callbacks + active states
- Contains: dropdown menu items (export, save, pin, configure)

### Phase 3: Composition Root

`ChatPanel.tsx` becomes:
```tsx
export const ChatPanel = (props) => {
  const state = useChatPanel(props); // composed hook
  return (
    <SelectionQuoteProvider>
      <div className="...">
        <ChatHeader {...state} />
        <ChatMessages {...state} />
        <ChatInputWrapper {...state} />
        <ConfirmDialogComponent />
        <ConfigureChatModal {...state} />
      </div>
    </SelectionQuoteProvider>
  );
};
```

## Success Criteria

- [ ] `ChatPanel.tsx` under 200 lines
- [ ] All extracted hooks have zero JSX
- [ ] All existing props and callbacks preserved
- [ ] No behavioral changes (verified by typecheck + manual smoke test)
- [ ] File structure follows existing conventions (`hooks/`, `components/`)

## Non-Goals

- No changes to `ChatInput`, `MessageBubble`, `ConfigureChatModal`, or other child components
- No changes to chat business logic (sending, streaming, etc.)
- No new features or UI changes

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Missing prop drill | Use existing `useChatStreamingContext` and `useSourcesContext` in hooks |
| Broken tooltip positioning | Extract verbatim, verify with visual smoke test |
| Race conditions in pinning | Keep `useCallback` dependencies identical |

## Order of Implementation

1. `useReferenceTooltip` (self-contained, low risk)
2. `useConversationPinning` (simple state)
3. `useChatActions` (straightforward extraction)
4. `useResearchPlanActions` (mutation wrappers)
5. `ChatToolbar` (pure JSX)
6. `ChatHeader` (combines toolbar + history)
7. `ChatMessages` (Virtuoso + message rendering)
8. Final `ChatPanel` composition + cleanup
