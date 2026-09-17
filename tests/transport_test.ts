import { assert, assertEquals, assertRejects } from "@std/assert";
import { type CortexStore, createCortexHandler } from "../sdk/server.ts";
import { CortexError, readAnswers } from "../sdk/core.ts";
import { CortexClient } from "../sdk/protocol/client.ts";

const config = {
  assistantId: "agent",
  apiKey: "test-key",
  baseUrl: "https://example.invalid/functions/v1/api-server-proxy",
};
const conversation = {
  id: "conversation",
  ownerId: "owner",
  assistantId: "agent",
  externalUserId: "external-owner",
  externalSessionId: "session",
};
const store: CortexStore = {
  async createConversation() {
    return conversation;
  },
  async loadConversation() {
    return conversation;
  },
  async loadAnswer() {
    return null;
  },
  async saveAnswer(context, _question, answer) {
    return {
      id: "saved",
      ownerId: context.ownerId,
      conversationId: context.id,
      answer,
    };
  },
};
const request = (body: unknown) =>
  new Request("https://app.invalid/cortex", {
    method: "POST",
    body: JSON.stringify(body),
  });

Deno.test("Ask follows downstream demand and cancels upstream without persisting previews", async () => {
  let reads = 0;
  let cancelled = false;
  let saves = 0;
  const handler = createCortexHandler({
    config,
    allowedOrigin: "https://app.invalid",
    authenticate: async () => ({ id: "owner", externalUserId: "owner" }),
    store: {
      ...store,
      async saveAnswer(...args) {
        saves++;
        return store.saveAnswer(...args);
      },
    },
    fetch: async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            reads++;
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({
                  utterance: `Answer ${reads}`,
                  interaction_id: "turn",
                }) + "\n",
              ),
            );
          },
          cancel() {
            cancelled = true;
          },
        }, { highWaterMark: 0 }),
      ),
  });
  const response = await handler(
    request({
      operation: "ask",
      conversation_id: "conversation",
      message: "hello",
    }),
  );
  assertEquals(reads, 0);
  const reader = response.body!.getReader();
  await reader.read();
  assertEquals(reads, 1);
  assertEquals(saves, 0);
  await reader.cancel();
  assert(cancelled);
  assertEquals(saves, 0);
});

Deno.test("invalid upstream JSON is a 502 with diagnostics; invalid caller JSON remains 400", async () => {
  for (const body of ["{broken", JSON.stringify({ unexpected: true })]) {
    const handler = createCortexHandler({
      config,
      store,
      allowedOrigin: "https://app.invalid",
      authenticate: async () => ({ id: "owner", externalUserId: "owner" }),
      fetch: async () =>
        new Response(body, { headers: { "x-request-id": "upstream-request" } }),
    });
    const response = await handler(
      request({ operation: "rag", query: "hello" }),
    );
    assertEquals(response.status, 502);
    assertEquals(await response.json(), {
      code: "INVALID_UPSTREAM_RESPONSE",
      request_id: "upstream-request",
    });
    assertEquals(
      (await handler(request({ operation: "rag", query: "" }))).status,
      400,
    );
  }
});

Deno.test("malformed streams preserve request IDs and limits apply to records rather than transport chunks", async () => {
  const consume = async (response: Response) => {
    let count = 0;
    for await (const _answer of readAnswers(response)) count++;
    return count;
  };
  const error = await assertRejects(
    () =>
      consume(
        new Response("{bad", { headers: { "x-request-id": "stream-request" } }),
      ),
    CortexError,
  );
  assertEquals(error.status, 502);
  assertEquals(error.requestId, "stream-request");
  const line =
    JSON.stringify({ utterance: "x".repeat(100_000), interaction_id: "turn" }) +
    "\n";
  assertEquals(await consume(new Response(line.repeat(81))), 81);
  await assertRejects(
    () =>
      consume(
        new Response(
          JSON.stringify({
            utterance: "x".repeat(8_000_001),
            interaction_id: "turn",
          }),
        ),
      ),
    CortexError,
    "STREAM_LINE_TOO_LARGE",
  );
});

Deno.test("wrong-assistant records and forged PDF fields are denied before upstream access", async () => {
  let calls = 0;
  const handler = createCortexHandler({
    config,
    store: {
      ...store,
      async loadConversation() {
        return { ...conversation, assistantId: "other" };
      },
    },
    allowedOrigin: "https://app.invalid",
    authenticate: async () => ({ id: "owner", externalUserId: "owner" }),
    fetch: async () => {
      calls++;
      return new Response();
    },
  });
  assertEquals(
    (await handler(
      request({
        operation: "ask",
        conversation_id: "conversation",
        message: "hello",
      }),
    )).status,
    404,
  );
  assertEquals(
    (await handler(
      request({
        operation: "pdf",
        message_id: "saved",
        inline_id: "ref",
        url: "https://attacker.invalid",
      }),
    )).status,
    400,
  );
  assertEquals(calls, 0);
});

Deno.test("PDF renewal never repeats after the replacement capability is denied", async () => {
  let calls = 0;
  const client = new CortexClient(config, async () => {
    calls++;
    return calls === 1
      ? Response.json({ secure_url: "/chat/reference/pdf/a.b.c?page=0" })
      : Response.json({ detail: "Invalid or expired reference token" }, {
        status: 401,
      });
  });
  await assertRejects(() =>
    client.pdf("owner", "session", {
      utterance: "answer",
      interaction_id: "turn",
      references: {
        datasources: [],
        inline: [{
          id: "ref",
          type: "pdf_highlight",
          id_datasource: "source",
          page: 0,
        }],
      },
      claims: [],
      reference_numbering: {},
    }, "ref"), CortexError);
  assertEquals(calls, 2);
});
