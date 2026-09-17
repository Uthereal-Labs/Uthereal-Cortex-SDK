import { assertEquals } from "@std/assert";
import type { z } from "zod";
import type {
  ApiAskEvent,
  ApiAskInput,
  ApiRagInput,
} from "../sdk/protocol/api-types.ts";
import {
  answerSchema,
  askSchema,
  ragResponseSchema,
  ragSchema,
} from "../sdk/protocol/contract.ts";
import { pdfLocation, resolveMarker } from "../sdk/protocol/citations.ts";
import { readAnswers } from "../sdk/protocol/stream.ts";
import type { Answer } from "../sdk/protocol/contract.ts";

Deno.test("required replay fixtures agree with the shipped parser, citations and geometry", async () => {
  {
    const acceptAskInput = (input: ApiAskInput): z.input<typeof askSchema> =>
      input;
    askSchema.parse(
      acceptAskInput(
        JSON.parse(await Deno.readTextFile("examples/ask/request.json")),
      ),
    );
    const text = await Deno.readTextFile("examples/ask/response.ndjson");
    // Compile-time drift check includes claims, references and geometry. The raw
    // API permits null/absent identity; readAnswers fills it from prior events.
    const normalizeIdentity = (
      event: ApiAskEvent,
    ): z.input<typeof answerSchema> => ({
      ...event,
      interaction_id: event.interaction_id ?? "",
    });
    for (const line of text.trimEnd().split("\n")) {
      answerSchema.parse(normalizeIdentity(JSON.parse(line) as ApiAskEvent));
    }
    const expected = JSON.parse(
      await Deno.readTextFile("examples/ask/expected.json"),
    ) as {
      snapshots: Answer[];
      finalAnswer: Answer;
      markers: { kind: "GIST" | "CIT"; ids: string; inlineIds: string[] }[];
      locations: Record<string, ReturnType<typeof pdfLocation>>;
    };
    for (
      const [body, fragment] of [[text, false], [text, true], [
        text.trimEnd(),
        true,
      ]] as const
    ) {
      const bytes = new TextEncoder().encode(body);
      const response = new Response(
        new ReadableStream({
          start(controller) {
            if (fragment) {
              for (const byte of bytes) {
                controller.enqueue(Uint8Array.of(byte));
              }
            } else controller.enqueue(bytes);
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
      const snapshots = [];
      for await (const answer of readAnswers(response)) snapshots.push(answer);
      assertEquals(snapshots, expected.snapshots);
      const final = snapshots.at(-1)!;
      assertEquals(final, expected.finalAnswer);
      for (const marker of expected.markers) {
        assertEquals(
          resolveMarker(final, marker.kind, marker.ids).map((item) => item.id),
          marker.inlineIds,
        );
      }
      for (const reference of final.references.inline) {
        assertEquals(pdfLocation(reference), expected.locations[reference.id]);
      }
    }
  }
  {
    const acceptRagInput = (input: ApiRagInput): z.input<typeof ragSchema> =>
      input;
    ragSchema.parse(
      acceptRagInput(
        JSON.parse(await Deno.readTextFile("examples/rag/request.json")),
      ),
    );
    const response = ragResponseSchema.parse(
      JSON.parse(await Deno.readTextFile("examples/rag/response.json")),
    );
    const empty = ragResponseSchema.parse(
      JSON.parse(await Deno.readTextFile("examples/rag/empty.json")),
    );
    const expected = JSON.parse(
      await Deno.readTextFile("examples/rag/expected.json"),
    );
    assertEquals(
      response.results.map((hit) => hit.id_element),
      expected.resultIds,
    );
    assertEquals(response.results.map((hit) => hit.rank), expected.ranks);
    assertEquals(empty.results.length, expected.emptyResultCount);
  }
});
