# Contributing

Use Node 22.22.1+, pnpm 10.33.0 and Deno 2. Read AGENTS.md, install with
`pnpm install --frozen-lockfile`, and run `pnpm verify`. Keep changes focused and
explain the user-visible behavior and validation in your pull request.

The SDK is maintained here. The Cortex backend owns the external wire protocol.
For protocol changes, coordinate a backend PR with an SDK PR updating
`openapi.json`, fixtures and runtime validators. Run `pnpm generate:types` and
`pnpm verify:types`. The backend pins the reviewed SDK revision and verifies its
schema against the service models. No backend source is needed in this repo.

To integrate into another app, install the released package or copy sdk/ intact;
follow INTEGRATING.md and report the package version/source revision with issues.

## Releases

Follow [RELEASING.md](RELEASING.md). Require CI, packed-package consumer checks
and an independent review of public content. Update package.json, sdk/version.ts,
the changelog and pinned documentation together. Never rewrite published tags.
The implementation remains under sdk/; generated dist/ is not committed.
