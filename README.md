# Uthereal Cortex SDK

The official TypeScript SDK for Uthereal Cortex adds grounded answers and retrieval
from your knowledge base to an application.
Cortex returns structured evidence with durable references and claim-level
citations. This SDK handles streaming, ownership-aware persistence, and cited
PDF pages with highlights.

**Start here:** [Integration guide](INTEGRATING.md) · [API contract](openapi.json) ·
[Replay fixtures](examples/README.md) · [Contributing](CONTRIBUTING.md)

## Try it without credentials

```sh
git clone --branch v1.0.1 https://github.com/Uthereal-Labs/Uthereal-Cortex-SDK.git
cd Uthereal-Cortex-SDK
pnpm install --frozen-lockfile
pnpm test
pnpm check:edge
pnpm build
pnpm dev
```

Open `http://localhost:5173/?replay` for synthetic cited answers, retrieval results,
and a PDF highlight. Live mode requires your own application’s Supabase project
and a Cortex agent/key; follow [the integration guide](INTEGRATING.md).

Requirements: Node 22.22.1+, pnpm 10.33.0 and Deno 2. The runnable example uses
React 19 and Vite. The reusable components support React 18/19. Other bundlers
must configure the matching PDF.js worker; their compatibility is not certified here.

## Integrate with your coding agent

Copy this prompt into Lovable, Codex, Claude Code, Cursor, or another coding tool:

```text
Integrate Cortex using https://github.com/Uthereal-Labs/Uthereal-Cortex-SDK/tree/v1.0.1.
Read INTEGRATING.md and examples/README.md at that revision first.
Preserve this app’s instructions, auth, history, quotas and UI conventions.
Copy sdk/ intact; reuse its server handler, browser client and citation helpers.
Keep CORTEX_SHARED_API_KEY in server secrets only.
Map authentication and storage using CortexActor and CortexStore.
Use my assistant ID and API base from Cortex Share’s integration instructions.
Run the SDK checks and the host application’s checks. Report fixture and live
verification separately. Do not overwrite this application’s agent instructions.
```

Tools that cannot fetch GitHub can use the release source ZIP attached to the
prompt. The SDK is distributed through GitHub only; no registry installation is
required. Copy `sdk/` intact into an existing app and record the release/commit.

## Choose the pieces you need

| Entry point | Use |
| --- | --- |
| `sdk/server.ts` | Server-only Fetch handler, auth/store contracts and low-level client |
| `sdk/browser.ts` | Authenticated calls to your application's backend |
| `sdk/core.ts` | Browser-safe types, validators, stream and citation helpers |
| `sdk/react.ts` | Optional cited-answer and PDF evidence components |
| `sdk/adapters/` | Optional Supabase auth and persistence adapters |

Core/server/browser need `zod` 3.23.8. React evidence additionally needs React
18/19, TanStack Query 5, React-PDF 9.1.1 and its matching PDF.js 4.4.168 worker.
Supabase adapters additionally need `@supabase/supabase-js` 2.104.0. Use the pinned
example dependencies as the tested baseline; keep your app's React version.

Ask returns full `utterance` snapshots; merge references and claims instead of
concatenating answer text. RAG returns JSON evidence and does not grant cited-PDF
access. The browser never receives a Cortex API key. Supabase is optional:
implement `authenticate` and `CortexStore` for your existing backend.

Cortex handles multiple source formats. This release renders PDF highlights and
textual evidence; it preserves additional metadata without promising a custom
viewer for every media type.

## Development

`pnpm verify` checks generated types, formatting/lint, fixtures, the Edge handler,
and the production build. See [CONTRIBUTING.md](CONTRIBUTING.md) for contract updates
and [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

MIT © Uthereal AG. See [LICENSE](LICENSE).
