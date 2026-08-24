import type { MlField, MlNamespace } from "../schema/namespaces";

/**
 * A `for` loop the cursor is inside, and what it iterates.
 *
 * `{{for product in flow.order.products}}` binds `product` to one element of
 * `flow.order.products`. The engine walks into that element at render time;
 * the editor has no element to walk, so it rewrites the prefix and looks the
 * result up in the schema it does have - `product.name` becomes
 * `flow.order.products.name`, resolved by stepping into the array field's
 * own `schema`.
 *
 * Loops nest, and a loop variable can iterate another loop variable's array
 * (`{{for v in product.variants}}`), so a binding's own path may itself start
 * with an outer loop variable. Rewriting therefore repeats until the path
 * lands on a real namespace.
 */
export interface LoopBinding {
  /** The loop variable, e.g. `product`. */
  name: string;
  /** What it iterates, e.g. `flow.order.products` or `product.variants`. */
  path: string;
}

/** `{{for x in a.b}}` and `{{/for}}`, in one pass. */
const LOOP_TOKEN = /\{\{\s*(\/?)\s*for\b(?:\s+(\w+)\s+in\s+([\w.]+))?/g;

/** The namespace the engine fills in inside any loop body: `{{loop.index}}`. */
export const LOOP_META_NAMESPACE = "loop";

/** What it holds. */
export const LOOP_META_FIELDS: MlField[] = [
  { key: "index", type: "number", label: "Position in the loop (from 1)" },
  { key: "count", type: "number", label: "Number of items" },
  { key: "first", type: "boolean", label: "Is the first item" },
  { key: "last", type: "boolean", label: "Is the last item" },
];

/**
 * The loops still open at the end of `textBefore`, outermost first.
 *
 * Reading only the text before the cursor is what makes this cheap and what
 * makes it right: a loop that closes before the cursor cannot be enclosing it,
 * and one that opens after it cannot either.
 *
 * A malformed document degrades quietly - an unmatched `{{/for}}` pops
 * nothing, an unclosed `{{for}}` simply stays open - because the point here is
 * to offer completions, not to diagnose syntax. `validate()` does that.
 */
export function openLoopsAt(textBefore: string): LoopBinding[] {
  const stack: LoopBinding[] = [];
  LOOP_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LOOP_TOKEN.exec(textBefore))) {
    const [, closing, name, path] = match;
    if (closing) {
      stack.pop();
      continue;
    }
    // `{{for` with no target yet - the person is still typing it. It opens a
    // scope all the same, so the ones around it stay correct.
    stack.push({ name: name ?? "", path: path ?? "" });
  }
  return stack.filter((binding) => binding.name && binding.path);
}

/**
 * Rewrite a loop-variable path into the path it stands for.
 *
 * The innermost binding wins, which is how shadowing works in the engine: the
 * nearest `for` owns the name. Repeats while it keeps resolving, so a loop
 * over a loop variable unwinds to a real namespace path; the loop count is
 * bounded by the nesting depth, and an unresolvable name is returned as-is.
 */
export function resolveLoopPath(
  loops: readonly LoopBinding[],
  path: string,
): string {
  let current = path;
  for (let step = 0; step <= loops.length; step++) {
    let rewritten = current;
    for (let i = loops.length - 1; i >= 0; i--) {
      const { name, path: target } = loops[i];
      if (current === name) {
        rewritten = target;
        break;
      }
      if (current.startsWith(`${name}.`)) {
        rewritten = target + current.slice(name.length);
        break;
      }
    }
    if (rewritten === current) return current;
    current = rewritten;
  }
  return current;
}

/**
 * Resolve a dotted path to the field it names, stepping into nested schemas.
 *
 * The first segment is the namespace; after that each segment is either a
 * field of the namespace (whose key may itself contain dots, as flow variables
 * do) or a step into the previous field's `schema`.
 */
export function fieldAt(
  namespaces: readonly MlNamespace[],
  path: string,
): MlField | undefined {
  const dot = path.indexOf(".");
  if (dot < 0) return undefined;
  const ns = namespaces.find((n) => n.key === path.slice(0, dot));
  if (!ns) return undefined;
  const rest = path.slice(dot + 1);
  if (!rest) return undefined;

  // A flat key wins outright: `order.summary` is one field named with a dot,
  // not a walk into `order`.
  const flat = ns.fields.find((f) => f.key === rest);
  if (flat) return flat;

  // Otherwise walk: take the longest field key that prefixes the path, then
  // step through its schema for what remains.
  const head = ns.fields
    .filter((f) => rest.startsWith(`${f.key}.`))
    .sort((a, b) => b.key.length - a.key.length)[0];
  if (!head) return undefined;

  let field: MlField = head;
  for (const segment of rest.slice(head.key.length + 1).split(".")) {
    const next = field.schema?.find((f) => f.key === segment);
    if (!next) return undefined;
    field = next;
  }
  return field;
}

/**
 * The fields a loop variable offers, as `<var>.<field>` paths.
 *
 * Only the immediate level: a nested array or object shows up as one entry of
 * its own type, which is what a person picks before opening another `for` over
 * it or stepping into it.
 */
export function loopVarFields(
  namespaces: readonly MlNamespace[],
  loops: readonly LoopBinding[],
): { path: string; f: MlField }[] {
  const out: { path: string; f: MlField }[] = [];
  loops.forEach((binding, index) => {
    // Resolve against the loops OUTSIDE this one only. A loop that iterates
    // something named after itself (`for product in product.related`) would
    // otherwise resolve through its own binding.
    const array = fieldAt(
      namespaces,
      resolveLoopPath(loops.slice(0, index), binding.path),
    );
    for (const f of array?.schema ?? [])
      out.push({ path: `${binding.name}.${f.key}`, f });
  });
  return out;
}
