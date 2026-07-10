# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [1.1.1]

- **`matchKeys` option** — the RIGHT operand of a comparison directive
  (`{{identity: contact.x == <category>.<key>}}`) now autocompletes from a
  data-driven `matchKeys` map (`{ payments: ["email", "customerId"], … }`),
  suggesting `payments.email`, `payments.customerId`, … instead of schema field
  paths. Pass it via the `matchKeys` option or the `setModelData` command.
  Without it, the right operand falls back to field paths (unchanged behavior).

## [1.1.0]

Inline directives (requires `model-language@^1.1`).

- **Inline directives** — tokens like `{{verify_before: payments}}`,
  `{{identity: contact.email == billing.email}}`, `{{assignedTo: [1, 2]}}`. The
  vocabulary is data-driven: pass a `DirectiveSpec[]` via the new `directives`
  option (or the `setModelData` command); nothing is hardcoded.
  - Directive names are highlighted distinctly and validated against the specs,
    surfacing new engine codes `ML240`–`ML244` as inline squiggles (routed by
    document range, since directive diagnostics carry no field path).
  - Autocomplete offers directive names, then an arg stage: enum values for a
    scalar enum, an incrementally-built `[a, b]` list for a list arg, and field
    paths for both operands of a comparison (`identity`).
- **`directiveArgLabel`** option — resolve a directive arg value (e.g. an
  operator id) to a friendly label. The document keeps the raw value
  (`{{assignedTo: [1]}}`); the label drives the autocomplete text and a hover
  title on the value.
- Re-export `DirectiveSpec`, `DirectiveArgSpec` and `parseDirectiveArg` from the
  `model-language` engine.
- Fix: `{{…}}` tokens that wrap across a line break, and diagnostic ranges in
  documents with empty lines / hard breaks, now map to the correct token.

## [1.0.0]

Initial release.

- Raw-text `{{…}}` syntax highlighting (braces, keywords, variables, operators,
  strings, numbers, filter pipelines), including tags that wrap across a line
  break.
- Staged, type-aware autocomplete triggered by `{{`: field, then operator, then
  value. Enum value lists, array-literal builders for `in` / `contains_any` /
  `contains_all`, date-format presets with a live preview, and timezone lists.
- Local validation on every keystroke through the `model-language` `validate()`
  engine, surfaced as inline squiggles with `data-ml-*` metadata.
- Hover diagnostics with one-click quick-fixes (add a type-aware default, insert
  a missing close tag in scope, correct a mistyped operator).
- JS-scoped block-balance checking (a block opened in a branch must close in that
  same branch).
- Full localization: overridable labels and code-based diagnostic translation.
- The `model-language` engine (`parse`, `validate`, `render`, `serialize`) and
  its types are re-exported, so consumers need no separate install.
