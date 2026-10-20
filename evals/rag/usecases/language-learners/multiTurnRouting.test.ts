import { describe, expect, it } from "vitest";
import { routeChatMessage } from "../../../../convex/_agents/chat/chatRouter";
import { getPack } from "../index";

/**
 * Multi-turn fixtures must reach retrieval. ChatAgent routes with the history it is given, which
 * ends with the current message (production's conversationHistory does too), so the same history
 * is passed here.
 */
describe("language-learners multi-turn fixtures route to retrieval", () => {
  const multiTurn = getPack("language-learners").fixtures.filter(
    (f) => f.turns && f.turns.length > 0
  );

  it("has the four multi-turn fixtures", () => {
    expect(multiTurn).toHaveLength(4);
  });

  it.each(multiTurn.map((f) => [f.id, f] as const))("%s", (_id, f) => {
    const history = [...(f.turns ?? []), { role: "user", content: f.question }];
    const route = routeChatMessage(f.question, history, f.chatSettings);
    expect(route.type).toBe("retrieve");
  });
});
