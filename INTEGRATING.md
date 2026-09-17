# Integrate Cortex into your application

Use this guide for cited chat or retrieval-only integrations. Preserve your application’s authentication, history, quotas and UI conventions. The SDK is distributed as TypeScript source from [Uthereal-Labs/cortex-sdk](https://github.com/Uthereal-Labs/cortex-sdk).

## Generated types and replay fixtures

`openapi.json` is the generated public Edge contract. Import `ApiAskInput`,
`ApiAskEvent`, `ApiRagInput`, `ApiRagResponse`, `ApiClaim`, `ApiReferences` and
PDF refresh types from the browser-safe entry point below. `paths`, `operations`
and `components` are also exported. `Answer` is normalized helper state; raw
wire events can omit metadata and must still pass through the runtime validators.
Do not hand-edit `sdk/protocol/openapi.generated.ts`.

Cortex verifies the public schema against its current Python models and generates
TypeScript with `openapi-typescript`. Contract CI checks both stages for drift and
tests the Edge adaptations. Each GitHub release identifies a fixed source revision; review its changelog when adopting a newer contract. Recipients do not
need the Cortex repository or generator to use these types.

[Replay fixtures](examples/README.md) are synthetic NDJSON/JSON files and expected
results for both Ask and RAG. Use them in
your own test harness. Ask streams snapshots; RAG returns one JSON result.

## Use SDK v1

The `sdk/` directory is tested TypeScript source, version 1.0.0. Copy it intact
into your application. Install the SDK dependencies listed in `package.json`
(`zod`, TanStack Query and React-PDF with its matching PDF.js worker; Supabase
only when using that adapter). Retain your host application’s React/React-DOM
and matching types: the SDK components support React 18 and 19. The complete
runnable demo uses React 19 Actions and pins React 19 for its own installation.
Existing integrations can retain their SDK revision until deliberately upgraded. The example SQL creates fresh tables only. Map your existing storage
explicitly through `CortexStore` when integrating into an existing application.

| Entry point | Responsibility |
| --- | --- |
| `sdk/core.ts` | Generated wire types, runtime validators, accumulated `Answer`, citation/geometry helpers and `CortexError` |
| `sdk/server.ts` | Server-only `createCortexHandler`, `CortexStore`/identity contracts and low-level `CortexClient` |
| `sdk/browser.ts` | Authenticated application-server client: create, ask, RAG and PDF |
| `sdk/react.ts` | `CitedAnswer` and `PdfEvidence`, with injected `loadPdf` and account-specific `authScope` |
| `sdk/adapters/supabase-server.ts` | Verified Supabase authentication and optional example table adapter |
| `sdk/adapters/supabase-browser.ts` | Fetch adapter using the current Supabase session |

### Plug into your existing backend

```ts
import { createCortexHandler, type CortexStore } from "./sdk/server.ts";

const handler = createCortexHandler({
  config: { baseUrl, assistantId, apiKey }, // server secrets/configuration
  allowedOrigin: "https://your-app.example",
  authenticate: async (request) => {
    const user = await verifyYourApplicationSession(request);
    return user ? { id: user.id, externalUserId: user.cortexIdentity } : null;
  },
  store: yourStoreAdapter satisfies CortexStore,
});
// Mount this Fetch API handler at your authenticated application endpoint.
```

`CortexStore` creates/loads conversations and saves/loads answers. Its methods
must enforce application ownership. The handler checks owner and assistant again
before accessing Cortex. Store `externalUserId` and `externalSessionId` when
creating the conversation; subsequent asks and PDFs use those persisted values.
Do not infer them from message IDs, display citation numbers or a new user mapping.
Return a saved record only after durable persistence completes. Apply your quota,
entitlement and concurrency checks in your authentication/store boundary.

### Plug into your frontend

```tsx
import { createCortexBrowserClient } from "./sdk/browser.ts";
import { CitedAnswer } from "./sdk/react.ts";

const cortex = createCortexBrowserClient({
  endpoint: "https://your-app.example/cortex",
  fetch: yourAuthenticatedFetch,
});
const conversationId = await cortex.createConversation(signal);
for await (const update of cortex.ask(conversationId, { message }, signal)) {
  if (update.type === "answer") showPreview(update.answer);
  else reloadSavedAnswer(update.messageId);
}
// Inside your existing QueryClientProvider:
<CitedAnswer key={accountId} answer={saved.answer} messageId={saved.id}
  authScope={`${backendId}:${tenantId}:${accountId}`} loadPdf={cortex.pdf} />;
```

The browser SDK never receives a Cortex API key. Your fetch adapter owns session
renewal; the supplied Supabase adapter reads the current session for each call,
while Supabase Auth owns JWT refresh. Asks are never automatically replayed.
Use an AbortSignal and abort active asks when the account or conversation changes.
Clear account-specific application caches on sign-out. `authScope` must uniquely
identify the backend/store, tenant and account together; change the component
key with it. Different loaders backed by different stores must never reuse the
same scope, even when their local message/account IDs overlap.

The React components use TanStack Query 5 and React-PDF 9, support React 18/19,
ship their own scoped CSS and bundle the matching local PDF worker through Vite.
They retain real source titles, resolve CIT/GIST through the supplied core,
show text-only evidence without fetching a PDF, render the correct slice page
and highlight, and cancel reads/revoke Blob URLs on close or replacement.
Use `PdfEvidence` directly inside your own dialog when adapting the presentation.

`CortexClient` is available for lower-level server integrations; the full handler
is the default because it also owns persistence completion and authorization.
Core helpers (`readAnswers`, `mergeAnswer`, `resolveMarker`, `pdfLocation`) remain
available through `sdk/core.ts`. Do not rebuild their parsing or renewal logic.

## Preview without credentials

Run `pnpm dev` and open `http://localhost:5173/?replay`. The selected synthetic
Ask/RAG fixtures render without Supabase settings. Open reference 7 to inspect
the real PDF slice and highlight; reference 9 stays textual. The scenario selector
shows a typed denial with request ID, and switching accounts clears the selected
source. Automated SDK tests cover the full server-side expiry/renewal path.

## Agent configuration and credentials

Copy the assistant ID and exact environment-specific API base from Cortex Share’s
**Copy integration instructions** action. For a manual setup, the production base
is `https://agent.uthereal.ai/api/functions/v1/api-server-proxy`.
Set these in `supabase/.env.local` (or your backend’s configuration). Create a
scoped assistant API key separately and install it as `CORTEX_SHARED_API_KEY`
in **your application's server secrets**. No credential is included in the repository.

- `ask` scope: chat and cited PDF GET/refresh.
- `rag` scope: retrieval-only results; it does **not** grant PDF capability
  access.
- The presence of an active key in Share is advisory. Actual requests still
  check key scope/expiry/revocation and assistant availability. Downloading the SDK does not grant API access.
- Keep your intended Cortex browser sharing mode. API keys do not require
  opening public browser access. Current key-management eligibility remains
  unchanged.
- Never put the shared key into `VITE_*`, browser code, local storage or
  committed files. Your application's Supabase JWT authenticates to **your Edge
  Function**, not Cortex Auth.

## Run in an isolated development project

Use Node 22.22.1+, pnpm 10.33.0, Deno 2 and the Supabase CLI. The example pins
library versions; adapt them deliberately when integrating.

1. Clone or download the pinned SDK release into a new directory, outside another pnpm workspace. Run
   `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm check:edge` and
   `pnpm build`.
2. Check that ports 55320–55324 are free, then run `supabase start` there. This
   applies the optional example migration to this isolated local project. Do not
   reset an existing project. For an existing app, map the persistence records
   to your own tables instead of applying the example schema blindly.
3. Create a test user in that local project's Auth dashboard. Copy
   `.env.example` to `.env.local` and set that project's public URL/key from
   `supabase status`. Do not use Cortex's Supabase keys.
4. Copy `supabase/.env.example` to `supabase/.env.local`. Install your Cortex
   shared key separately, check the assistant/base configuration, and set
   `APP_ORIGIN=http://localhost:5173`. For local Cortex, use an origin reachable
   from the Edge container, such as `host.docker.internal`; leave the
   browser-facing app settings on localhost.
5. Run `supabase functions serve cortex --env-file supabase/.env.local`. This
   handler verifies the caller with `auth.getUser()`; `verify_jwt=false` only
   disables the gateway's legacy JWT verifier.
6. Run `pnpm dev`, sign in with the test user and ask a question answered by an
   indexed PDF. Reopen the conversation after a page reload, select a citation
   and verify its source page and highlight.

Before deploying to your app's environment, apply your chosen schema with its
normal migration process, install server secrets, set the exact allowed
`APP_ORIGIN`, and deploy the `cortex` function and frontend. Never install this
example function or migration into Uthereal's Cortex project. Account for your
Edge provider's stream duration limits.

## Public API interface

Every Cortex call goes through the configured `/functions/v1/api-server-proxy`
base. Do not use backend-native `/external/selfserve/...` OpenAPI paths.
URL-encode session and assistant path components.

| Operation | Method and path after proxy base                                           | Authentication and body                                                                                 |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Ask       | POST `/external/v1/assistants/{assistant}/sessions/{external_session}/ask` | Bearer assistant key, `X-App-Code: selfserve`; `{id_user, message, detail_level?, technicality_level?}` |
| RAG       | POST `/external/v1/assistants/{assistant}/rag`                             | Same headers; `{query, id_user?, max_results?, datasource_ids?}`                                        |
| PDF       | GET `/chat/reference/pdf/{token}?page={source_page}`                       | Same key/app plus `X-External-User-Id` matching ask                                                     |
| Refresh   | POST `/chat/reference/pdf/refresh`                                         | Same PDF headers; original assistant/session/datasource/interaction/inline IDs and source page          |

The runnable TypeScript interfaces and runtime validators are in
`sdk/protocol/contract.ts`; the request implementations are in
`sdk/protocol/client.ts`. The application Edge interface accepts
`{operation: 'create' | 'ask' | 'rag' | 'pdf', ...}`. It derives the Cortex user
and saved context server-side. It never accepts an arbitrary URL,
caller-supplied owner, or caller-supplied answer/reference as PDF authority.

Ask messages allow 1–5,000 Unicode code points after trimming. Detail is
`SUCCINCT | BALANCED | DETAILED`; technicality is
`SIMPLE | BALANCED | TECHNICAL`. There is no start-chat request: create and
persist an external session UUID. Keep it stable with its owner and assistant.
Cortex maintains session memory; add bounded application context to `message`,
not unbounded history. Attachments, web search and external links are disabled
for this external ask API.

RAG queries allow 1–500 characters, `max_results` is 1–20 (default 10), and
datasource filters allow up to 50 IDs. RAG returns
`{id_assistant, id_tenant, id_workspace, query, results}`; hits contain
`{id_element, id_datasource, content, rank, metadata}`. Metadata is sparse and
empty results are valid. RAG does not return ready-to-use cited-PDF
capabilities. The sample Edge operation `rag` can be called through
`cortex.rag({ query })`; its demo UI concentrates on cited chat.

## Stream and citation invariants

Although Cortex responds with `text/event-stream`, the wire body is
**newline-delimited JSON**, not SSE `data:` frames. `readAnswers` handles split
UTF-8/chunks, the final unterminated line and malformed/status-only failures.
Each `utterance` is a complete answer snapshot, not a text delta. Never append
snapshots.

Merge `references.datasources` and `references.inline` arrays by `id`, numbering
by inline ID and claims by `claim_id`, retaining occurrences by their IDs.
Metadata can arrive before the answer or be absent from later snapshots.
Preserve unknown fields. The same exported reducer is used for streaming and
saved answers.

- `{{GIST:n}}`: occurrence `id` → owning claim → `cited_ui_ids` → inline
  references.
- `{{CIT:id}}` and comma-separated CIT IDs: direct inline lookup.
- `reference_numbering` controls display labels; never replace durable IDs with
  sequential UI numbering.
- Concrete `pdf_highlight` entries have datasource ID, physical zero-based
  `page`, flat `[x0,y0,x1,y1]` coordinates and source dimensions. Text-only
  gists and unsupported media stay textual; do not invent geometry or turn
  arbitrary links into PDF URLs.
- The example renders answer text safely with citation controls. Integrate your
  own Markdown renderer if desired, preserving the marker resolver and escaping
  rules.

## Persistence, authenticated PDF and refresh

The optional schema stores server-generated conversations and final answers
containing accumulated references/claims/numbering and interaction IDs.
The Supabase adapter initially uses the conversation UUID as the external session
and the authenticated user UUID as the external user. Both are explicit persisted
columns; reads use the stored values. Other applications provide their own mapping. Browser reads are
protected by RLS; writes are Edge-only. The Edge handler also checks ownership
and assistant binding explicitly before using its service-role client.

PDF selection sends only saved message ID and inline ID to your backend. It
loads the owned reference, uses the fixed Cortex origin, rejects redirects and
untrusted paths, sets exactly one `page` parameter, and streams PDF bytes back.
React fetches with the application's JWT and creates a temporary Blob URL,
revoked on close/change.

The returned PDF is a slice from `max(0,p-1)` through `min(last,p+1)`. Highlight
page is `p - max(0,p-1) + 1` in the one-based viewer. Keep the original physical
page and dimensions for geometry and refresh; display source page `p+1`. See
`pdfLocation` and `CitedAnswer`.

A URL alone is not a durable reference. On the exact 401 detail
`Invalid or expired reference token`, attempt **one** refresh using the saved
external session and the original assistant, datasource, interaction, inline
reference and page. That response covers invalid as well as expired
capabilities; it is not proof of expiry. Missing capability paths may also be
recovered through the authorized saved-reference refresh. Never retry generic
key 401/403 as expiry. Never regenerate an answer merely to renew a reference,
and never fall back to public storage access.

## Failures and application adaptation

Retain HTTP status, machine code and `X-Request-ID` for diagnostics. The sample
sanitizes error output and does not log tokens, signed URLs or user JWTs. Input
failures are 400/422; invalid/revoked keys 401; missing scope/access 403;
unavailable resources 404; transient proxy/backend failures 502/503/504.
CloudFront HTML 403 is a different failure from JSON API authentication errors.

The example does not automatically retry asks: a dropped response may already
have created a Cortex turn. Show failure and let the user retry deliberately. A
saved-event is emitted only after persistence succeeds; partial answers remain
previews. Preserve your application's quota checks, rate limiting and
concurrency rules before exposing the integration to users.

For existing apps (including Lovable projects), adapt a single shared backend
client across every chat/review/tool mode. Keep old-provider history
distinguishable. Guest identities must be server-issued and ownership-bound;
never accept an arbitrary browser user ID or share a global guest session. The
runnable example intentionally requires authentication.

## Acceptance checklist for the integrating agent

- Run the included client tests, Edge check and extracted-project build.
- Exercise chat plus RAG with correctly scoped keys; confirm useful failures for
  missing scope and revoked keys.
- Ask with a PDF citation, reload saved history, and verify first/middle/last
  source page placement and highlights.
- Open the saved citation after token expiry and confirm bounded refresh without
  another ask.
- Test a second user: no history or PDF access to the first user's records.
  Reject caller-controlled URLs, forged references and wrong-assistant records.
- Test your own guest, entitlement, memory, attachment preparation and
  orchestration paths when adapting the example.

Record the SDK version and Git commit when reporting integration problems.
Distinguish fixture checks from live credentialed checks; passing the former does not certify your production corpus or deployment.
