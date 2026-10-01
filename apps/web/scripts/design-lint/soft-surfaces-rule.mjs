/**
 * solomind/soft-surfaces — the soft layered house style (docs/design/principles.md):
 * separate with fill and shadow, not borders. Flags outline patterns in static class strings.
 *
 * Known limitations: only string literals inside className and cn/cva/clsx/twMerge calls are
 * checked; class strings held in identifiers or constants (`const base = "border-2"`) are not followed.
 */
const CLASS_FUNCTIONS = new Set(["cn", "cva", "clsx", "twMerge"]);
const THICK_BORDER = /^border(?:-[xytrbse])?-(?:[2-9]|\d{2,})$/;
const OPACITY = String.raw`(?:\/(?:\d+|\[[^\]]+\]))?`;
const LOUD_BORDER = new RegExp(
  String.raw`^border(?:-[xytrbse])?-(?:input|foreground|black|primary)${OPACITY}$`
);
const OVERLAY_BG = new RegExp(String.raw`^bg-(?:black|white)\/(?:\d+|\[[^\]]+\])$`);
// The side is only a side when followed by "-" or the end, so "border-t-0" is side t + value 0, never value "t-0".
const BORDER_PARTS = /^border(?:-([xytrbse])(?=-|$))?(?:-(.+))?$/;
const NO_BORDER = /^(?:0|none|transparent)$/;
// Table layout utilities that share the `border-` prefix but draw nothing.
const TABLE_BORDER = /^(?:collapse|separate|spacing(?:-.+)?)$/;
// Variants that gate a border on interaction or validity state; those are allowed.
const STATE_PREFIX =
  /^(?:focus|aria-invalid|data-\[state|has-data-\[state|group-data-\[state|peer-data-\[state|group-focus|peer-focus)/;

/** Any border utility (width, color, style, with or without a side) except the 0/none/transparent ones. */
function isVisibleBorder(utility) {
  const match = BORDER_PARTS.exec(utility);
  if (match === null) return false;
  const value = match[2];
  return value === undefined || !(NO_BORDER.test(value) || TABLE_BORDER.test(value));
}

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
  if (utility.startsWith("shadow-[") || utility.startsWith("shadow-(")) return true;
  if (OVERLAY_BG.test(utility)) return true;
  const stateGated = variants.some((v) => STATE_PREFIX.test(v));
  if (LOUD_BORDER.test(utility) && !stateGated) return true;
  if (onButton && !stateGated && isVisibleBorder(utility)) return true;
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
      for (const e of node.expressions) collect(e, out);
      break;
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
      collect(node.expression, out);
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
    // Nodes already reported by an enclosing className/class call. Relies on ESLint visiting parents before children.
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
        const fresh = pieces.filter((p) => !seen.has(p.node));
        for (const p of fresh) seen.add(p.node);
        report(fresh, false);
      },
    };
  },
};
