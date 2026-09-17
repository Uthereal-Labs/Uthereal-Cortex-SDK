import { z } from "zod";
import type { ApiAskInput, ApiRagInput, ApiRagResponse } from "./api-types.ts";

// Public Edge response subset. Preserve additional fields for forward compatibility.
export const datasourceSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  secure_url: z.string().nullish(),
}).passthrough();
export const inlineSchema = z.object({
  id: z.string(),
  type: z.string(),
  id_datasource: z.string().nullish(),
  page: z.number().int().nonnegative().nullish(),
  coordinates: z.tuple([z.number(), z.number(), z.number(), z.number()])
    .nullish(),
  width: z.number().positive().nullish(),
  height: z.number().positive().nullish(),
  content: z.string().nullish(),
}).passthrough();
export const claimSchema = z.object({
  claim_id: z.string(),
  claim_text: z.string().optional(),
  rationale: z.string().optional(),
  evidence_ids: z.array(z.string()).optional(),
  cited_ui_ids: z.array(z.string()).default([]),
  occurrences: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      gist: z.string().optional(),
    }).passthrough(),
  ).default([]),
}).passthrough();
export const answerSchema = z.object({
  utterance: z.string(),
  interaction_id: z.string(),
  references: z.object({
    datasources: z.array(datasourceSchema).default([]),
    inline: z.array(inlineSchema).default([]),
  }).nullish().transform((value) => value ?? { datasources: [], inline: [] }),
  reference_numbering: z.record(z.number()).default({}),
  claims: z.array(claimSchema).nullish().transform((value) => value ?? []),
}).passthrough();
export type Answer = z.infer<typeof answerSchema>;
export type InlineReference = z.infer<typeof inlineSchema>;
export type Datasource = z.infer<typeof datasourceSchema>;

export const askSchema = z.object({
  citation_enrichment: z.boolean().optional(),
  reasoning_effort: z.enum(["standard", "high"]).optional(),
  message: z.string().trim().min(1).refine(
    (value) => Array.from(value).length <= 5000,
    "Maximum 5,000 Unicode code points",
  ),
  detail_level: z.enum(["SUCCINCT", "BALANCED", "DETAILED"]).optional(),
  technicality_level: z.enum(["SIMPLE", "BALANCED", "TECHNICAL"]).optional(),
}) satisfies z.ZodType<ApiAskInput>;
export const ragSchema = z.object({
  query: z.string().trim().min(1).max(500),
  max_results: z.number().int().min(1).max(20).optional(),
  datasource_ids: z.array(z.string().min(1).max(256)).max(50).optional(),
}) satisfies z.ZodType<ApiRagInput>;
export const ragResponseSchema = z.object({
  id_assistant: z.string(),
  id_tenant: z.string(),
  id_workspace: z.string(),
  query: z.string(),
  results: z.array(
    z.object({
      id_element: z.string(),
      id_datasource: z.string(),
      content: z.string(),
      rank: z.number(),
      metadata: z.record(z.unknown()).default({}),
    }).passthrough(),
  ),
}) satisfies z.ZodType<ApiRagResponse>;

/** Public portable request/response types; no Cortex-internal generated imports required. */
export type Claim = z.infer<typeof claimSchema>;
export type ClaimOccurrence = Claim["occurrences"][number];
export type AskInput = ApiAskInput;
export type RagInput = ApiRagInput;
export type RagResponse = z.infer<typeof ragResponseSchema>;
