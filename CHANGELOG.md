# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

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
