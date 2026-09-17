# Cortex SDK contributor instructions

For integration into another app, read [INTEGRATING.md](INTEGRATING.md). Preserve
that app’s own instructions and conventions; do not overwrite its AGENTS.md.

## Coding standards

- Start from first principles: simple, DRY code with clear ownership and minimal dependencies.
- Use pnpm for Node/TypeScript tooling and Deno for native SDK tests. Never use npm or npx.
- Use strict TypeScript. Validate untrusted JSON at boundaries; preserve unknown evidence metadata.
- Keep `sdk/core.ts` and `sdk/browser.ts` browser-safe. Credentials belong exclusively on the server.
- Reuse stream, citation, geometry and PDF-renewal helpers. Do not invent alternate wire formats.
- Keep auth/store adapters optional. Do not introduce a second framework or persistence model.
- Extract helpers for shared logic, non-obvious domain steps, or external effects; avoid single-use wrappers.
- Prefer native APIs, then existing dependencies, before adding a new dependency.
- Add focused regression tests for behavior changes; do not test copies of the implementation.
- Use synthetic fixtures only. Never commit API keys, customer payloads, signed URLs or internal source.

## Contracts

Ask is NDJSON even when the content type is text/event-stream. Utterances replace
earlier text; reference and claim metadata accumulates. Application `saved` events
follow durable persistence and are not upstream Cortex events. PDF authorization
uses owned saved records and original identity/session context. Never retry Ask
automatically or treat every 401 as an expired PDF capability.

Do not hand-edit `sdk/protocol/openapi.generated.ts`. After a reviewed public
OpenAPI update, run `pnpm generate:types`; backend maintainers verify the schema
against the service. Keep Node/Deno behavior and browser-safe imports covered.

Run `pnpm verify` before submitting. Report new dependencies, public interface
changes, validation results, and any live external-service operations separately.
