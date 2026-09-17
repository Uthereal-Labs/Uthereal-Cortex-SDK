# Contributing

Use Node 22.22.1+, pnpm 10.33.0 and Deno 2. Read AGENTS.md, install with
`pnpm install --frozen-lockfile`, and run `pnpm verify`. Keep changes focused and
explain the user-visible behavior and validation in your pull request.

The SDK is maintained here. The Cortex backend owns the external wire protocol.
For protocol changes, coordinate a backend PR with an SDK PR updating
`openapi.json`, fixtures and runtime validators. Run `pnpm generate:types` and
`pnpm verify:types`. The backend pins the reviewed SDK revision and verifies its
schema against the service models. No backend source is needed in this repo.

To integrate into another app, copy sdk/ intact, install only the dependencies
for your chosen entry points, and follow INTEGRATING.md. Report the source
revision with issues; upgrades are deliberate replacements after changelog review.

## Releases

Use semantic versions for the SDK's public interfaces. Before tagging, update
package.json and sdk/version.ts, document changes in CHANGELOG.md, and require
CI plus an independent review of public content. Tag the validated commit and
create its GitHub release. The GitHub source archive is the distribution artifact.
No npm or PyPI publish workflow is configured. A future registry release is a
separate change with package-consumer and provenance validation.
