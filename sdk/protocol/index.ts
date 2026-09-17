/** Browser-safe helpers. Import CortexClient separately from ./client.ts on the server only. */
export {
  answerSchema,
  askSchema,
  ragResponseSchema,
  ragSchema,
} from "./contract.ts";
export type {
  Answer,
  AskInput,
  Claim,
  ClaimOccurrence,
  Datasource,
  InlineReference,
  RagInput,
  RagResponse,
} from "./contract.ts";
export { mergeAnswer, pdfLocation, resolveMarker } from "./citations.ts";
export type { PdfLocation } from "./citations.ts";
export { readAnswers } from "./stream.ts";
export { CortexError } from "./errors.ts";

export type * from "./api-types.ts";
export type { components, operations, paths } from "./openapi.generated.ts";
