# Contributing

Thanks for your interest in improving `tiptap-model-language`.

## Development

```bash
pnpm install
pnpm test          # vitest (unit)
pnpm test:cov      # vitest + coverage
pnpm lint          # Biome
pnpm typecheck     # tsc --noEmit
pnpm build         # tsup -> dist (ESM + CJS + .d.ts)
```

## Ground rules

- Keep the extension framework-agnostic: it owns highlighting, autocomplete,
  diagnostics and validation, and takes namespaces + schema from the host. No
  app-specific coupling.
- Every behaviour change ships with a test. Unit tests (pure logic) live beside
  the source in `src/**/*.test.ts`; the browser-level end-to-end suite lives in
  the demo repository.
- Run `pnpm lint` and `pnpm typecheck` before opening a PR.
- Language semantics come from the [`model-language`](https://github.com/wexiohub/model-language)
  engine. This package renders and validates through it; it does not fork the
  language.

## Reporting bugs

Open an issue with a minimal template, the schema, and what you expected versus
what happened. Security issues: see [`SECURITY.md`](./SECURITY.md).
