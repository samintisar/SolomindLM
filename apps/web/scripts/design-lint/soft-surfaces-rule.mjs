/**
 * solomind/soft-surfaces — the soft layered house style (docs/design/principles.md):
 * separate with fill and shadow, not borders. Flags outline patterns in static class strings.
 */
const CLASS_FUNCTIONS = new Set(["cn", "cva", "clsx", "twMerge"]);
const THICK_BORDER = /^border(?:-[xytrbse])?-(?:2|4|8)$/;
const LOUD_BORDER = /^border(?:-[xytrbse])?-(?:input|foreground|black|primary)(?:\/\d+)?$/;
const ANY_BORDER = /^border(?:-[xytrbse])?(?:-(?!0$|none$|transparent$)[\w/[\].-]+)?$/;
const STATE_PREFIX =
  /^(?:focus|focus-visible|focus-within|aria-invalid|data-\[state|has-data-\[state|group-data-\[state|peer-data-\[state|group-focus|peer-focus)/;

/** "hover:sm:border-2" → { variants: ["hover", "sm"], utility: "border-2" } (brackets may contain ':'). */
function splitToken(token) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of token) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  return { variants: parts, utility: current.replace(/^!/, "").replace(/!$/, "") };
}

function violation(token, onButton) {
  const { variants, utility } = splitToken(token);
  if (THICK_BORDER.test(utility)) return true;
  if (utility.startsWith("shadow-[")) return true;
  if (/^bg-(?:black|white)\/\d+$/.test(utility)) return true;
  const stateOnly = variants.some((v) => STATE_PREFIX.test(v));
  if (LOUD_BORDER.test(utility) && !stateOnly) return true;
  if (onButton && !stateOnly && ANY_BORDER.test(utility)) return true;
  return false;
}

/** Collect static string pieces (with their nodes) from a className value or class-function arg. */
function collect(node, out) {
  if (!node) return;
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") out.push({ node, text: node.value });
      break;
    case "TemplateLiteral":
      for (const q of node.quasis) out.push({ node, text: q.value.cooked ?? "" });
      break;
    case "JSXExpressionContainer":
      collect(node.expression, out);
      break;
    case "ConditionalExpression":
      collect(node.consequent, out);
      collect(node.alternate, out);
      break;
    case "LogicalExpression":
      collect(node.left, out);
      collect(node.right, out);
      break;
    case "ArrayExpression":
      for (const el of node.elements) collect(el, out);
      break;
    case "ObjectExpression":
      for (const p of node.properties) {
        if (p.type !== "Property") continue;
        if (p.key.type === "Literal") collect(p.key, out);
        collect(p.value, out);
      }
      break;
    case "CallExpression":
      if (node.callee.type === "Identifier" && CLASS_FUNCTIONS.has(node.callee.name)) {
        for (const a of node.arguments) collect(a, out);
      }
      break;
    default:
      break;
  }
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Soft layered design: no outline borders or hand-rolled shadows on controls.",
    },
    messages: {
      softSurfaces:
        "Soft layered design: separate with fill and shadow, not borders (`{{token}}`). Use a ui variant (see docs/design/principles.md).",
    },
    schema: [],
  },
  create(context) {
    const seen = new WeakSet();
    const report = (pieces, onButton) => {
      for (const { node, text } of pieces) {
        for (const token of text.split(/\s+/).filter(Boolean)) {
          if (violation(token, onButton)) {
            context.report({ node, messageId: "softSurfaces", data: { token } });
          }
        }
      }
    };
    return {
      JSXAttribute(node) {
        if (node.name.name !== "className" || !node.value) return;
        const opening = node.parent;
        const onButton = opening.name?.type === "JSXIdentifier" && opening.name.name === "button";
        const pieces = [];
        collect(node.value, pieces);
        for (const p of pieces) seen.add(p.node);
        report(pieces, onButton);
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !CLASS_FUNCTIONS.has(node.callee.name)) return;
        const pieces = [];
        for (const a of node.arguments) collect(a, pieces);
        report(
          pieces.filter((p) => !seen.has(p.node)),
          false
        );
      },
    };
  },
};
