"use node";

import { describe, expect, it } from "vitest";
import { deepResearchWorkflow, planApprovedEvent } from "./DeepResearchGraph";

describe("DeepResearchGraph", () => {
  it("workflow definition exists", () => {
    expect(deepResearchWorkflow).toBeDefined();
  });

  it("planApprovedEvent exists with correct name", () => {
    expect(planApprovedEvent).toBeDefined();
    expect(planApprovedEvent.name).toBe("planApproved");
  });

  it("planApprovedEvent has correct validator shape", () => {
    expect(planApprovedEvent.validator).toBeDefined();
    expect((planApprovedEvent.validator as Record<string, unknown>).fields).toBeDefined();
    expect((planApprovedEvent.validator as Record<string, unknown>).fields).toHaveProperty(
      "planId"
    );
    expect((planApprovedEvent.validator as Record<string, unknown>).fields).toHaveProperty(
      "modifiedSubQuestions"
    );
  });

  it("workflow is a function", () => {
    expect(typeof deepResearchWorkflow).toBe("function");
  });

  it("workflow and event are both exported", () => {
    expect(deepResearchWorkflow).toBeDefined();
    expect(planApprovedEvent).toBeDefined();
  });
});
