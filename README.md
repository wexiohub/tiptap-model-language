# tiptap-model-language

> Type-safe template authoring inside your Tiptap editor. Variables, conditions,
> loops and filters with live validation, quick-fixes and staged autocomplete.

[![npm](https://img.shields.io/npm/v/tiptap-model-language?label=npm&color=cb3837&logo=npm)](https://www.npmjs.com/package/tiptap-model-language)
[![CI](https://github.com/wexiohub/tiptap-model-language/actions/workflows/ci.yml/badge.svg)](https://github.com/wexiohub/tiptap-model-language/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/tiptap-model-language?label=bundle%20size)](https://bundlephobia.com/package/tiptap-model-language)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![powered by wexio.io](https://img.shields.io/badge/powered%20by-wexio.io-0b0b0b)](https://wexio.io)

A [Tiptap](https://tiptap.dev) / [ProseMirror](https://prosemirror.net) extension
for the [`model-language`](https://www.npmjs.com/package/model-language) template
syntax. Writers get VS Code-style feedback while they type: `{{…}}` syntax
highlighting, staged type-aware autocomplete (variables, filters, control
blocks), hover diagnostics with one-click quick-fixes, and live validation that
runs fully in-process, with no server round-trip.

**Live demo and docs:** [ml.wexio.io](https://ml.wexio.io)

## Installation

```bash
npm install tiptap-model-language @tiptap/react @tiptap/starter-kit
```

The `model-language` engine ships inside the package, so there is nothing else to
add. `react`, `react-dom` and the `@tiptap/*` packages are peer dependencies you
already have in a Tiptap app.

## Quick start

Add `ModelSyntax` to any Tiptap editor and hand it a set of namespaces (for
autocomplete) and a field schema (for validation).

```tsx
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ModelSyntax } from "tiptap-model-language";

const namespaces = [
  { key: "contact", label: "Contact", fields: [
    { key: "first_name", type: "string", label: "First name" },
    { key: "priority", type: "enum", label: "Priority",
      values: ["high", "low"] },
  ]},
];

const schema = [
  { path: "contact.first_name", type: "string", nullable: true },
  { path: "contact.priority", type: "enum", values: ["high", "low"] },
];

export function TemplateEditor() {
  const editor = useEditor({
    extensions: [
      StarterKit,
      ModelSyntax.configure({
        namespaces,
        schema,
        onResult: (r) => console.log(r.diagnostics, r.maxTokenEstimate),
      }),
    ],
  });

  return <EditorContent editor={editor} />;
}
```

When the schema loads asynchronously or changes at runtime, push it in with the
`setModelData` command instead of the static options; it re-validates the
document right away.

```ts
editor.commands.setModelData({ namespaces, schema });
```

## What you get

- **Syntax highlighting** for raw-text `{{…}}` tokens: braces, keywords,
  variables, operators, strings, numbers and filter pipelines, each in its own
  colour, even when a tag wraps across a line break.
- **Staged autocomplete** triggered by `{{`: field, then operator, then value.
  Enums list their options, array operators build a `["a", "b"]` list, dates
  offer format presets with a live preview, timezones come from a dropdown.
- **Local validation** on every keystroke via the `model-language` `validate()`
  engine: unknown fields, missing defaults, unbalanced blocks, mistyped
  operators. Zero round-trips.
- **Hover diagnostics + quick-fixes**: hover a squiggle for the message and a
  one-click fix (add a type-aware default, insert the missing `{{/if}}` in the
  right scope, correct a mistyped operator).
- **Localizable**: every user-facing string is overridable, and engine
  diagnostics translate by their stable code.

## Options

Pass any of these to `ModelSyntax.configure({…})`. Only `namespaces` and `schema`
are usually needed.

| Option | Type | Default | Description |
|---|---|---|---|
| `namespaces` | `MlNamespace[]` | `[]` | Autocomplete + highlighting groups. Static case; push via `setModelData` for async data. |
| `schema` | `FieldSchema` | `[]` | Flattened field schema for local validation. Static case. |
| `directives` | `DirectiveSpec[]` | `[]` | Inline-directive vocabulary (see below). Static case. |
| `directiveArgLabel` | `(name, value) => string \| undefined` | `undefined` | Friendly label for a directive arg value (e.g. operator id → name). |
| `matchKeys` | `Record<string, string[]>` | `undefined` | Right-operand suggestions for a comparison directive (`{{identity: contact.x == <category>.<key>}}`), keyed by category. See below. |
| `skipValidation` | `boolean` | `false` | Turn off the `validate()` pass. Structural squiggles still render. |
| `debounceMs` | `number` | `300` | Debounce for the validation pass. |
| `severities` | `DiagnosticSeverity[]` | all | Which severities render inline. |
| `labels` | `Partial<ModelLanguageLabels>` | `{}` | Override any user-facing string. |
| `translateDiagnostic` | `(d) => string \| undefined` | `undefined` | Localize an engine diagnostic by its stable code. |
| `onResult` | `(result) => void` | `undefined` | Full result hook (diagnostics + token estimate). |

Full reference: [ml.wexio.io/docs](https://ml.wexio.io/docs).

## Inline directives

Directives are tokens like `{{verify_before: payments}}`,
`{{identity: contact.email == billing.email}}` or `{{assignedTo: [1, 2]}}`. The
vocabulary is **data** (a `DirectiveSpec[]`), fetched from your backend and handed
to the extension exactly like the field schema, so nothing about the directive
names is hardcoded.

```ts
import { ModelSyntax, type DirectiveSpec } from "tiptap-model-language";

const directives: DirectiveSpec[] = [
  { name: "verify_before", hasBody: false,
    arg: { kind: "scalar", type: "enum", values: ["payments", "calendar"] } },
  { name: "identity", hasBody: false,
    arg: { kind: "comparison", type: "field",
           comparison: { operators: ["=="], operandType: "field" } } },
  { name: "assignedTo", hasBody: false,
    arg: { kind: "list", type: "id", values: ["1", "2", "3"] } },
];

ModelSyntax.configure({
  namespaces,
  schema,
  directives,
  // Show operator ids as names in autocomplete + a hover title; the document
  // keeps the raw id, so `{{assignedTo: [1]}}` is what serialises.
  directiveArgLabel: (name, value) =>
    name === "assignedTo" ? operators.find((o) => o.id === value)?.name : undefined,
});
```

Directives are highlighted distinctly, autocompleted (name, then an arg stage
that lists enum values, builds `[a, b]` lists, or completes comparison operands),
and validated against the specs. New diagnostic codes:
`ML240` unknown-directive, `ML241` missing-required-argument, `ML242`
argument-type-mismatch, `ML243` value-not-in-`values`, `ML244` unexpected-argument.

### Comparison right operand — `matchKeys`

For a comparison directive like `identity`, the **left** operand completes with
field paths, but the **right** operand is a `<category>.<key>` match key
(`payments.email`, `payments.customerId`, …), not a schema field. Supply those
per category via `matchKeys`:

```ts
ModelSyntax.configure({
  namespaces,
  schema,
  directives,
  // Right operand of `{{identity: contact.x == …}}` autocompletes from these.
  matchKeys: { payments: ["email", "customerId"], calendar: ["attendeeEmail"] },
});
// → `{{identity: contact.email == payments.email}}`
```

Without `matchKeys`, the right operand falls back to field paths (unchanged).

## The engine, re-exported

The `model-language` engine is re-exported from this package, so you can validate
and render templates with the exact engine the editor uses, no extra install.

```ts
import { parse, render, validate } from "tiptap-model-language";

const { diagnostics, maxTokenEstimate } = validate(template, schema);

const { ast } = parse(template);
const { text } = render(ast, snapshot, schema, { now: new Date() });
```

## Development

```bash
pnpm install
pnpm test          # vitest (unit)
pnpm test:cov      # vitest + coverage
pnpm lint          # Biome
pnpm typecheck     # tsc --noEmit
pnpm build         # tsup -> dist (ESM + CJS + .d.ts)
```

The landing page and end-to-end (Playwright) suite live in the separate
[demo repository](https://ml.wexio.io).

## License

MIT (c) [Wexio](https://wexio.io)

---

<p align="center">Built and maintained by <a href="https://wexio.io"><b>Wexio</b></a>, wexio.io</p>
