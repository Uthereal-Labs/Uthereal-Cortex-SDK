import { assertEquals } from "@std/assert";
import type { ApiAskEvent } from "../sdk/protocol/api-types.ts";
import { answerSchema, askSchema } from "../sdk/protocol/contract.ts";
import { pdfLocation, resolveMarker } from "../sdk/protocol/citations.ts";
import { readAnswers } from "../sdk/protocol/stream.ts";

Deno.test("staging evidence survives parsing and reference accumulation without inventing PDF geometry", async () => {
  const wire = await Deno.readTextFile("examples/staging/response.ndjson");
  const metadata = JSON.parse(wire.split("\n")[0]) as ApiAskEvent;
  // Narrow the actual generated wire union, including variants absent on main.
  for (const reference of metadata.references?.inline ?? []) {
    if (reference.type === "epub_highlight") {
      assertEquals(reference.locator.href, "OEBPS/chapter.xhtml");
    } else if (reference.type === "source_excerpt") {
      assertEquals(reference.source_id, "text-source");
    } else if (reference.type === "external_link") {
      assertEquals(
        reference.source_preview?.binding.source_generation,
        "synthetic-generation",
      );
    } else if (reference.type === "table") {
      assertEquals(reference.original_row_window?.row_start, 5);
    }
  }
  assertEquals(metadata.references?.datasources?.[0]?.preview?.kind, "text");
  const parsed = answerSchema.parse({
    ...metadata,
    utterance: "",
    interaction_id: metadata.interaction_id ?? "",
  });
  assertEquals<unknown>(parsed.references, metadata.references);

  const snapshots = [];
  for await (const snapshot of readAnswers(new Response(wire))) {
    snapshots.push(snapshot);
  }
  const expected = JSON.parse(
    await Deno.readTextFile("examples/staging/expected.json"),
  );
  assertEquals(snapshots.length, expected.snapshotCount);
  const final = snapshots.at(-1)!;
  assertEquals(final, expected.finalAnswer);
  assertEquals(
    resolveMarker(final, "CIT", "epub,excerpt,external,rows").map((ref) =>
      ref.id
    ),
    ["epub", "excerpt", "external", "rows"],
  );
  // Source previews and EPUB locators are metadata, not PDF highlight geometry.
  for (const reference of final.references.inline) {
    assertEquals(pdfLocation(reference), null);
  }
});

Deno.test("a rejected ask keeps its machine-readable rejection code", () => {
  const parsed = answerSchema.parse({
    utterance:
      "Your message contains abusive or hateful language. Rephrase it respectfully and try again.",
    interaction_id: "turn-1",
    rejection_code: "input_blocked.toxicity",
  });
  assertEquals(parsed.rejection_code, "input_blocked.toxicity");
  assertEquals(
    answerSchema.parse({ utterance: "Answer", interaction_id: "turn-2" })
      .rejection_code,
    undefined,
  );
});

Deno.test("ask messages allow up to 10,000 code points, matching the service", () => {
  assertEquals(
    askSchema.safeParse({ message: "🙂".repeat(10_000) }).success,
    true,
  );
  assertEquals(
    askSchema.safeParse({ message: "🙂".repeat(10_001) }).success,
    false,
  );
});
