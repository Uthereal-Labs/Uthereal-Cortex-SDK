/** Application-server client. Supply authenticated fetch; never a Cortex API key. */
import { z } from "zod";
import {
  type Answer,
  type AskInput,
  CortexError,
  type RagInput,
  ragResponseSchema,
  readAnswers,
  responseError,
} from "./core.ts";

export type AnswerUpdate = { type: "answer"; answer: Answer } | {
  type: "saved";
  messageId: string;
};
export type PdfRequest = {
  messageId: string;
  inlineId: string;
  signal?: AbortSignal;
};
export type PdfLoader = (request: PdfRequest) => Promise<Blob>;

export function createCortexBrowserClient(
  options: { endpoint: string; fetch: typeof fetch },
) {
  const request = async (body: unknown, signal?: AbortSignal) => {
    const response = await options.fetch(options.endpoint, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await responseError(response);
    return response;
  };
  return {
    async createConversation(signal?: AbortSignal): Promise<string> {
      return z.object({ id: z.string().min(1) }).parse(
        await (await request({ operation: "create" }, signal)).json(),
      ).id;
    },
    async *ask(
      conversationId: string,
      input: AskInput,
      signal?: AbortSignal,
    ): AsyncGenerator<AnswerUpdate> {
      const response = await request({
        ...input,
        operation: "ask",
        conversation_id: conversationId,
      }, signal);
      let messageId: string | undefined;
      for await (
        const answer of readAnswers(response, {
          requireSaved: true,
          onSaved: (id) => {
            messageId = id;
          },
        })
      ) {
        signal?.throwIfAborted();
        yield { type: "answer", answer };
      }
      signal?.throwIfAborted();
      if (!messageId) throw new CortexError(502, "ANSWER_NOT_SAVED");
      yield { type: "saved", messageId };
    },
    async rag(input: RagInput, signal?: AbortSignal) {
      return ragResponseSchema.parse(
        await (await request({ ...input, operation: "rag" }, signal)).json(),
      );
    },
    async pdf({ messageId, inlineId, signal }: PdfRequest): Promise<Blob> {
      const response = await request({
        operation: "pdf",
        message_id: messageId,
        inline_id: inlineId,
      }, signal);
      if (
        !response.headers.get("content-type")?.startsWith("application/pdf")
      ) throw new CortexError(502, "INVALID_PDF_RESPONSE");
      return response.blob();
    },
  };
}
