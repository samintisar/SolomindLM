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
    {
      code: `<div className="group-data-[state=open]:border-primary peer-data-[state=on]:border-primary" />`,
    },
    { code: `<button className="border-collapse border-separate border-spacing-2" />` },
  ],
  invalid: [
    {
      code: `<div className="border-2 border-border" />`,
      errors: [{ messageId: "softSurfaces", data: { token: "border-2" } }],
    },
    { code: `<div className="sm:border-t-4" />`, errors: [err] },
    { code: `<div className="border border-input" />`, errors: [err] },
    { code: `<div className="border-foreground/40" />`, errors: [err] },
    { code: `<div className="shadow-[0_0_0_1px_red]" />`, errors: [err] },
    { code: `<div className="bg-black/50" />`, errors: [err] },
    { code: `<button className="border px-2" />`, errors: [err] },
    { code: `<button className="border-t" />`, errors: [err] },
    { code: `<button className="border-x-border" />`, errors: [err] },
    { code: `<div className="border-l-2" />`, errors: [err] },
    { code: `<div className="border-l-primary" />`, errors: [err] },
    // "l" starts the color "lime", so it must not be parsed as a left side.
    {
      code: `<button className="border-lime-500" />`,
      errors: [{ messageId: "softSurfaces", data: { token: "border-lime-500" } }],
    },
    { code: `<button className={cn("rounded", active ? "border-border" : "")} />`, errors: [err] },
    { code: "<div className={`p-2 ${x} border-2`} />", errors: [err] },
    { code: `const c = cn("p-2", "border-primary");`, errors: [err] },
    { code: `const v = cva("p-2", { variants: { tone: { loud: "border-4" } } });`, errors: [err] },
    { code: `<div className="hover:border-primary" />`, errors: [err] },
    { code: `<div className="!border-2" />`, errors: [err] },
    { code: `<div className="border-2!" />`, errors: [err] },
    { code: `<div className="[&:hover]:border-2" />`, errors: [err] },
    { code: `<div className="bg-white/10" />`, errors: [err] },
    { code: `const c = clsx({ "border-2": on });`, errors: [err] },
    { code: `<div className="border-2 bg-black/50" />`, errors: [err, err] },
    { code: `<div className="border-3" />`, errors: [err] },
    { code: `<div className="border-x-6" />`, errors: [err] },
    { code: `<div className="shadow-(--ring-shadow)" />`, errors: [err] },
    { code: `<div className="border-primary/[0.3]" />`, errors: [err] },
    { code: `<div className="bg-black/[0.4]" />`, errors: [err] },
    {
      code: `const v = cva("p-2", { variants: { a: { b: "border-4" } } } as const);`,
      errors: [err],
    },
    {
      code: `const v = cva("p-2", { variants: { a: { b: "border-4" } } } satisfies X);`,
      errors: [err],
    },
    { code: '<div className={`p-2 ${on ? "border-2" : ""}`} />', errors: [err] },
    // Each nested/wrapped class string is reported once, not once per enclosing call.
    { code: `<div className={cn("border-2")} />`, errors: [err] },
    { code: `const c = cn("p-2", on && cn("border-2"));`, errors: [err] },
    { code: `const c = twMerge(clsx("border-2"));`, errors: [err] },
  ],
});
