import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";
import rule from "./soft-surfaces-rule.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const err = { messageId: "softSurfaces" } as const;

tester.run("soft-surfaces", rule, {
  valid: [
    { code: `<div className="rounded-xl bg-card shadow-xs ring-1 ring-border/50" />` },
    { code: `<div className="border-b border-border/50" />` },
    { code: `<input className="focus-visible:border-ring aria-invalid:border-destructive" />` },
    { code: `<div className={cn("p-4", isOn && "bg-muted")} />` },
    { code: `<button className="rounded-lg hover:bg-muted" />` },
    { code: `<button className="border-0 bg-transparent" />` },
    { code: `<button className="border-t-0 border-x-0" />` },
    { code: `<button className="border-b-transparent" />` },
    { code: `const v = cva("flex gap-2", { variants: { a: { b: "shadow-md" } } });` },
    { code: `<div className="focus-visible:border-primary data-[state=open]:border-primary" />` },
    { code: `<div className="has-data-[state=checked]:border-primary" />` },
  ],
  invalid: [
    { code: `<div className="border-2 border-border" />`, errors: [err] },
    { code: `<div className="sm:border-t-4" />`, errors: [err] },
    { code: `<div className="border border-input" />`, errors: [err] },
    { code: `<div className="border-foreground/40" />`, errors: [err] },
    { code: `<div className="shadow-[0_0_0_1px_red]" />`, errors: [err] },
    { code: `<div className="bg-black/50" />`, errors: [err] },
    { code: `<button className="border px-2" />`, errors: [err] },
    { code: `<button className="border-t" />`, errors: [err] },
    { code: `<button className="border-x-border" />`, errors: [err] },
    { code: `<button className={cn("rounded", active ? "border-border" : "")} />`, errors: [err] },
    { code: "<div className={`p-2 ${x} border-2`} />", errors: [err] },
    { code: `const c = cn("p-2", "border-primary");`, errors: [err] },
    { code: `const v = cva("p-2", { variants: { tone: { loud: "border-4" } } });`, errors: [err] },
  ],
});
