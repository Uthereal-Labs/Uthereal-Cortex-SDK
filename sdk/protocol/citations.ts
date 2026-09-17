import type { Answer, InlineReference } from "./contract.ts";

export function mergeById<T extends { id: string | number }>(
  previous: T[],
  next: T[],
): T[] {
  const merged = new Map(previous.map((item) => [item.id, item]));
  for (const item of next) {
    merged.set(item.id, { ...merged.get(item.id), ...item });
  }
  return [...merged.values()];
}

export function mergeAnswer(
  previous: Answer | undefined,
  next: Answer,
): Answer {
  if (!previous) return next;
  if (previous.interaction_id !== next.interaction_id) {
    throw new Error("Interaction changed inside one answer stream");
  }
  return {
    ...previous,
    ...next,
    references: {
      datasources: mergeById(
        previous.references.datasources,
        next.references.datasources,
      ),
      inline: mergeById(previous.references.inline, next.references.inline),
    },
    reference_numbering: {
      ...previous.reference_numbering,
      ...next.reference_numbering,
    },
    claims: [
      ...new Set(
        [...previous.claims, ...next.claims].map((claim) => claim.claim_id),
      ),
    ].map((id) => {
      const before = previous.claims.find((claim) => claim.claim_id === id);
      const after = next.claims.find((claim) => claim.claim_id === id);
      if (!before) return after!;
      if (!after) return before;
      return {
        ...before,
        ...after,
        cited_ui_ids: [
          ...new Set([...before.cited_ui_ids, ...after.cited_ui_ids]),
        ],
        occurrences: mergeById(before.occurrences, after.occurrences),
      };
    }),
  };
}

/** GIST IDs identify occurrences; CIT IDs identify inline references, not sources. */
export function resolveMarker(
  answer: Answer,
  kind: "GIST" | "CIT",
  ids: string,
): InlineReference[] {
  const selected = ids.split(",").map((id) => id.trim());
  const inlineIds = kind === "GIST"
    ? answer.claims.filter((claim) =>
      claim.occurrences.some((occurrence) =>
        selected.includes(String(occurrence.id))
      )
    )
      .flatMap((claim) => claim.cited_ui_ids)
    : selected;
  return [...new Set(inlineIds)].flatMap((id) =>
    answer.references.inline.filter((reference) => reference.id === id)
  );
}

/** Source page is zero-based; slice page is one-based. Rectangle values are percentages. */
export interface PdfLocation {
  sourcePage: number;
  slicePage: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function pdfLocation(reference: InlineReference): PdfLocation | null {
  if (
    reference.type !== "pdf_highlight" || reference.page == null ||
    !reference.coordinates ||
    !reference.width || !reference.height
  ) return null;
  const [x0, y0, x1, y1] = reference.coordinates;
  if (
    x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0 || x1 > reference.width ||
    y1 > reference.height
  ) return null;
  return {
    sourcePage: reference.page,
    slicePage: reference.page - Math.max(0, reference.page - 1) + 1,
    left: x0 / reference.width * 100,
    top: y0 / reference.height * 100,
    width: (x1 - x0) / reference.width * 100,
    height: (y1 - y0) / reference.height * 100,
  };
}
