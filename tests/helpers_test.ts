import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { answerSchema } from "../sdk/protocol/contract.ts";
import {
  mergeAnswer,
  pdfLocation,
  resolveMarker,
} from "../sdk/protocol/citations.ts";
import { readAnswers } from "../sdk/protocol/stream.ts";
import { CortexClient } from "../sdk/protocol/client.ts";
import { CortexError } from "../sdk/protocol/errors.ts";

const answer = () =>
  answerSchema.parse({
    utterance: "Soil {{GIST:3}} and {{CIT:b, a}}",
    interaction_id: "turn-1",
    references: {
      datasources: [{
        id: "source",
        title: "Book",
        url: "/chat/reference/pdf/a.b.c?page=8",
      }],
      inline: [
        {
          id: "a",
          type: "pdf_highlight",
          id_datasource: "source",
          page: 2,
          coordinates: [10, 20, 30, 40],
          width: 100,
          height: 200,
        },
        {
          id: "b",
          type: "citation_gist",
          id_datasource: "source",
          content: "Soil quality",
        },
      ],
    },
    reference_numbering: { a: 7, b: 9 },
    claims: [{
      claim_id: "claim-1",
      claim_text: "Soil matters",
      cited_ui_ids: ["a"],
      occurrences: [{ id: 3, gist: "Evidence" }],
    }],
  });
const collect = async (response: Response, requireSaved = false) => {
  const result = [];
  for await (const snapshot of readAnswers(response, { requireSaved })) {
    result.push(snapshot);
  }
  return result;
};

Deno.test("UTF-8 byte splits, metadata-only frames, nullable metadata and unterminated EOF", async () => {
  const first = answer();
  const text = [
    JSON.stringify({
      stream_event_type: "status",
      references: first.references,
      claims: first.claims,
    }),
    JSON.stringify({
      ...first,
      utterance: "Café 🌱",
      references: null,
      claims: null,
    }),
    JSON.stringify({ utterance: "Café 🌱 grows", interaction_id: "turn-1" }),
  ].join("\n");
  const bytes = new TextEncoder().encode(text);
  const snapshots = await collect(
    new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
          controller.close();
        },
      }),
    ),
  );
  assertEquals(snapshots.at(-1)?.utterance, "Café 🌱 grows");
  assertEquals(snapshots.at(-1)?.references.inline.length, 2);
  assertEquals(snapshots.at(-1)?.claims[0].claim_id, "claim-1");
});

Deno.test("claims merge partial occurrences by claim_id, and CIT/GIST retain stable IDs", () => {
  const initial = answer();
  const merged = mergeAnswer(
    initial,
    answerSchema.parse({
      utterance: "updated",
      interaction_id: "turn-1",
      claims: [{
        claim_id: "claim-1",
        cited_ui_ids: ["b"],
        occurrences: [{ id: 4, gist: "New" }],
      }],
    }),
  );
  assertEquals(merged.claims.length, 1);
  assertEquals(merged.claims[0].occurrences.map((item) => item.id), [3, 4]);
  assertEquals(resolveMarker(merged, "GIST", "3").map((item) => item.id), [
    "a",
    "b",
  ]);
  assertEquals(resolveMarker(merged, "CIT", "b, a, b").map((item) => item.id), [
    "b",
    "a",
  ]);
  assertEquals(resolveMarker(merged, "GIST", "missing"), []);
  assertEquals(merged.reference_numbering, { a: 7, b: 9 });
  assertEquals(initial.claims[0].occurrences.length, 1);
});

Deno.test("source-page geometry handles page zero, middle and final source pages", () => {
  for (const page of [0, 1, 20]) {
    const location = pdfLocation({ ...answer().references.inline[0], page });
    assertEquals(location?.slicePage, page === 0 ? 1 : 2);
    assertEquals(location?.top, 10);
    assertEquals(location?.height, 10);
  }
  assertEquals(pdfLocation(answer().references.inline[1]), null);
  assertEquals(
    pdfLocation({
      ...answer().references.inline[0],
      coordinates: [30, 20, 10, 40],
    }),
    null,
  );
});

Deno.test("stream rejects malformed/status-only/truncated application responses and preserves diagnostics", async () => {
  await assertRejects(() => collect(new Response("{broken")));
  await assertRejects(
    () => collect(new Response('{"stream_event_type":"status"}')),
    CortexError,
    "EMPTY_ANSWER",
  );
  await assertRejects(
    () => collect(new Response(JSON.stringify(answer())), true),
    CortexError,
    "ANSWER_NOT_SAVED",
  );
  const error = await assertRejects(
    () =>
      collect(
        new Response(
          JSON.stringify({
            stream_event_type: "error",
            code: "PERSISTENCE_FAILED",
            request_id: "req-123",
          }),
        ),
      ),
    CortexError,
  );
  assertEquals(error.code, "PERSISTENCE_FAILED");
  assertEquals(error.requestId, "req-123");
  const saved = JSON.stringify({
    stream_event_type: "saved",
    message_id: "bd9f8a2a-7360-4a3c-8d92-1488a3fc567b",
  });
  assertEquals(
    (await collect(new Response(JSON.stringify(answer()) + "\n" + saved), true))
      .length,
    1,
  );
});

const config = {
  baseUrl: "https://agent.uthereal.ai/api/functions/v1/api-server-proxy",
  assistantId: "assistant",
  apiKey: "test-key",
};
Deno.test("saved citations refresh once with original external identity and replace page query", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const mock: typeof fetch = (url, init) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(
      calls.length === 1
        ? Response.json({ detail: "Invalid or expired reference token" }, {
          status: 401,
        })
        : calls.length === 2
        ? Response.json({
          secure_url: "/chat/reference/pdf/new.new.new?page=0",
        })
        : new Response("%PDF-fixture", {
          headers: { "content-type": "application/pdf" },
        }),
    );
  };
  const restored = answerSchema.parse(JSON.parse(JSON.stringify(answer())));
  await new CortexClient(config, mock).pdf(
    "owner",
    "external-session",
    restored,
    "a",
  );
  assertEquals(calls.length, 3);
  assertEquals(new URL(calls[2].url).search, "?page=2");
  assertEquals(JSON.parse(String(calls[1].init?.body)), {
    id_assistant: "assistant",
    id_session: "external-session",
    id_datasource: "source",
    page: 2,
    interaction_id: "turn-1",
    inline_reference_id: "a",
  });
  const headers = new Headers(calls[2].init?.headers);
  assertEquals(headers.get("x-external-user-id"), "owner");
  assertEquals(headers.get("x-app-code"), "selfserve");
  assertEquals(calls[2].init?.redirect, "error");
});

Deno.test("key/auth failures do not refresh, invalid reference paths never receive credentials", async () => {
  let calls = 0;
  const denied: typeof fetch = () => {
    calls++;
    return Promise.resolve(
      Response.json({ code: "EXTERNAL_API_KEY_INVALID" }, { status: 401 }),
    );
  };
  await assertRejects(
    () =>
      new CortexClient(config, denied).pdf("owner", "session", answer(), "a"),
    CortexError,
    "EXTERNAL_API_KEY_INVALID",
  );
  assertEquals(calls, 1);
  for (
    const path of [
      "https://evil.example/token",
      "//evil.example/token",
      "/chat/reference/pdf/a.b.c?redirect=1",
      "/chat/reference/pdf/../refresh",
      "/chat/reference/pdf/a.b.c?page=1&page=2",
    ]
  ) {
    const saved = answer();
    saved.references.datasources[0].url = path;
    await assertRejects(
      () =>
        new CortexClient(config, denied).pdf("owner", "session", saved, "a"),
      CortexError,
      "INVALID_REFERENCE_PATH",
    );
  }
  assertEquals(calls, 1);
  assertThrows(() =>
    new CortexClient({ ...config, baseUrl: "https://evil.example/?token=key" })
  );
});
