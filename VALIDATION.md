# 1.0.0 validation

- `pnpm verify`: generated types, lint/format, 14 Deno contract and regression tests,
  Node server smoke test, Supabase Edge typecheck and React 19/Vite production build passed.
- Node 22.22.1: compiled server imports and synthetic Ask stream passed.
- An independent consumer copied sdk/ intact and built the replay UI with React
  18.3.1 and matching types, including the local PDF.js worker.
- Independent source review covered ownership, server credentials, streaming,
  request diagnostics, PDF renewal, fixtures and public repository contents.

Fixtures exercise full snapshots, citations, PDF geometry, saved-record identity,
renewal, cross-user and cross-assistant denial, persistence failure, cancellation,
slow readers and malformed responses. They contain no customer data or live keys.

Visual browser verification was unavailable in the implementation environment.
No live credentialed Cortex request, cloud Supabase deployment, or real-corpus
certification was performed. A passing fixture suite is not a claim about those checks.
