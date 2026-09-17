import { assertEquals, assertRejects } from "@std/assert";
import {
  type CortexActor,
  type CortexConversation,
  type CortexSavedAnswer,
  type CortexStore,
  createCortexHandler,
} from "../sdk/server.ts";
import { createCortexBrowserClient } from "../sdk/browser.ts";
import { type Answer, CortexError } from "../sdk/core.ts";
import { createReplayTransport } from "../examples/transport.ts";

Deno.test("SDK adapters preserve saved identity, renew once, enforce ownership and preserve error diagnostics", async () => {
  const fixture = await Deno.readTextFile("examples/ask/response.ndjson");
  const encoded = JSON.parse(await Deno.readTextFile("examples/ask/pdf.json"));
  const bytes = Uint8Array.from(
    atob(encoded.base64),
    (char) => char.charCodeAt(0),
  );
  const replay = createReplayTransport({
    ask: fixture,
    pdf: bytes,
    expireFirstPdf: true,
  });
  let actor: CortexActor | null = {
    id: "owner",
    externalUserId: "original-external-user",
  };
  let conversation: CortexConversation | null = null;
  let saved: CortexSavedAnswer | null = null;
  let failSave = false;
  const store: CortexStore = {
    async createConversation(user, assistantId) {
      conversation = {
        id: "opaque-conversation",
        ownerId: user.id,
        assistantId,
        externalUserId: user.externalUserId,
        externalSessionId: "original-session",
      };
      return conversation;
    },
    async loadConversation() {
      return conversation;
    }, // Handler must also defend against a faulty ownership adapter.
    async loadAnswer() {
      return saved;
    },
    async saveAnswer(context, _question, answer: Answer) {
      if (failSave) {
        throw new CortexError(503, "STORE_UNAVAILABLE", "store-request");
      }
      saved = {
        id: "opaque-message",
        ownerId: context.ownerId,
        conversationId: context.id,
        answer,
      };
      return saved;
    },
  };
  const config = {
    assistantId: "fixture-agent",
    apiKey: "fixture-key",
    baseUrl:
      "https://example.invalid/api/functions/v1/api-server-proxy-staging",
  };
  const handler = createCortexHandler({
    config,
    authenticate: async () => actor,
    store,
    allowedOrigin: "https://app.invalid",
    fetch: replay.fetch,
  });
  const client = createCortexBrowserClient({
    endpoint: "https://app.invalid/cortex",
    fetch: (input, init) => handler(new Request(input, init)),
  });
  const id = await client.createConversation();
  const updates = [];
  for await (
    const update of client.ask(id, { message: "Explain the garden." })
  ) updates.push(update);
  assertEquals(updates.at(-1), { type: "saved", messageId: "opaque-message" });
  actor = { id: "owner", externalUserId: "changed-mapping" };
  const pdf = await client.pdf({
    messageId: "opaque-message",
    inlineId: "ref-light",
  });
  assertEquals(new Uint8Array(await pdf.arrayBuffer()), bytes);
  const pdfRequests = replay.requests.filter((request) =>
    request.url.includes("/reference/pdf/")
  );
  assertEquals(pdfRequests.length, 3);
  for (const request of pdfRequests) {
    assertEquals(
      request.headers.get("x-external-user-id"),
      "original-external-user",
    );
  }
  assertEquals(new URL(pdfRequests[2].url).searchParams.getAll("page"), ["2"]);
  const renewal = await pdfRequests[1].json();
  assertEquals(renewal.id_session, "original-session");
  assertEquals(renewal.inline_reference_id, "ref-light");
  actor = { id: "different-owner", externalUserId: "other" };
  const before = replay.requests.length;
  await assertRejects(
    () => client.pdf({ messageId: "opaque-message", inlineId: "ref-light" }),
    CortexError,
    "NOT_FOUND",
  );
  assertEquals(replay.requests.length, before);
  actor = null;
  await assertRejects(
    () => client.createConversation(),
    CortexError,
    "AUTH_REQUIRED",
  );
  actor = { id: "owner", externalUserId: "original-external-user" };
  failSave = true;
  const failure = await assertRejects(
    async () => {
      for await (
        const update of client.ask(id, { message: "Again" })
      ) assertEquals(update.type, "answer");
    },
    CortexError,
    "STORE_UNAVAILABLE",
  );
  assertEquals(failure.status, 503);
  assertEquals(failure.requestId, "store-request");
  const deniedReplay = createReplayTransport({
    pdfFailure: {
      status: 403,
      code: "SCOPE_DENIED",
      requestId: "edge-request",
    },
  });
  const deniedHandler = createCortexHandler({
    config,
    authenticate: async () => actor,
    store,
    allowedOrigin: "https://app.invalid",
    fetch: deniedReplay.fetch,
  });
  const deniedClient = createCortexBrowserClient({
    endpoint: "https://app.invalid/cortex",
    fetch: (input, init) => deniedHandler(new Request(input, init)),
  });
  const denied = await assertRejects(
    () =>
      deniedClient.pdf({ messageId: "opaque-message", inlineId: "ref-light" }),
    CortexError,
    "SCOPE_DENIED",
  );
  assertEquals(denied.requestId, "edge-request");
  assertEquals(deniedReplay.requests.length, 1);
});

Deno.test("cancelling a preview aborts upstream and never persists it; RAG composes cancellation", async () => {
  const conversation: CortexConversation = {
    id: "conversation",
    ownerId: "owner",
    assistantId: "agent",
    externalUserId: "external",
    externalSessionId: "session",
  };
  let writes = 0;
  let upstreamAborted = false;
  let ragSignal: AbortSignal | null = null;
  const handler = createCortexHandler({
    config: {
      assistantId: "agent",
      apiKey: "fixture",
      baseUrl:
        "https://example.invalid/api/functions/v1/api-server-proxy-staging",
    },
    allowedOrigin: "https://app.invalid",
    authenticate: async () => ({ id: "owner", externalUserId: "external" }),
    store: {
      async createConversation() {
        return conversation;
      },
      async loadConversation() {
        return conversation;
      },
      async loadAnswer() {
        return null;
      },
      async saveAnswer(_context, _question, answer) {
        writes++;
        return {
          id: "message",
          ownerId: "owner",
          conversationId: "conversation",
          answer,
        };
      },
    },
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith("/rag")) {
        ragSignal = init?.signal ?? null;
        return Response.json({ code: "FIXTURE_STOP" }, { status: 503 });
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({
                  utterance: "Partial answer",
                  interaction_id: "interaction",
                }) + "\n",
              ),
            );
            request.signal.addEventListener("abort", () => {
              upstreamAborted = true;
              controller.error(request.signal.reason);
            }, { once: true });
          },
        }),
      );
    },
  });
  const client = createCortexBrowserClient({
    endpoint: "https://app.invalid/cortex",
    fetch: (input, init) => handler(new Request(input, init)),
  });
  const abort = new AbortController();
  const updates = client.ask(
    "conversation",
    { message: "Question" },
    abort.signal,
  );
  assertEquals((await updates.next()).value?.type, "answer");
  abort.abort();
  await updates.return(undefined);
  assertEquals(upstreamAborted, true);
  assertEquals(writes, 0);
  const request = new Request("https://app.invalid/cortex", {
    method: "POST",
    body: JSON.stringify({ operation: "rag", query: "Question" }),
  });
  await handler(request);
  assertEquals(ragSignal === request.signal, false);
  assertEquals(ragSignal !== null, true);
});
