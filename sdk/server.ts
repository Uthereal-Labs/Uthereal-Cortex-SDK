/** Server-only application boundary. Credentials and trusted records stay here. */
import { z } from "zod";
import { CortexClient, type CortexConfig } from "./protocol/client.ts";
import {
  type Answer,
  answerSchema,
  askSchema,
  CortexError,
  ragSchema,
  readAnswers,
  responseError,
} from "./core.ts";

export { CortexClient };
export type { CortexConfig };

export type CortexActor = { id: string; externalUserId: string };
export type CortexConversation = {
  id: string;
  ownerId: string;
  assistantId: string;
  externalUserId: string;
  externalSessionId: string;
};
export type CortexSavedAnswer = {
  id: string;
  ownerId: string;
  conversationId: string;
  answer: Answer;
};
export interface CortexStore {
  createConversation(
    actor: CortexActor,
    assistantId: string,
  ): Promise<CortexConversation>;
  loadConversation(
    id: string,
    actor: CortexActor,
  ): Promise<CortexConversation | null>;
  loadAnswer(id: string, actor: CortexActor): Promise<CortexSavedAnswer | null>;
  saveAnswer(
    conversation: CortexConversation,
    question: string,
    answer: Answer,
  ): Promise<CortexSavedAnswer>;
}

const idSchema = z.string().trim().min(1).max(256);
const actorSchema = z.object({ id: idSchema, externalUserId: idSchema });
const commandSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create") }).strict(),
  z.object({
    operation: z.literal("ask"),
    conversation_id: idSchema,
    ...askSchema.shape,
  }).strict(),
  z.object({ operation: z.literal("rag"), ...ragSchema.shape }).strict(),
  z.object({
    operation: z.literal("pdf"),
    message_id: idSchema,
    inline_id: idSchema,
  }).strict(),
]);

export function createCortexHandler(options: {
  config: CortexConfig;
  authenticate: (request: Request) => Promise<CortexActor | null>;
  store: CortexStore;
  allowedOrigin: string;
  fetch?: typeof fetch;
}): (request: Request) => Promise<Response> {
  const cortex = new CortexClient(options.config, options.fetch);
  const headers = {
    "Access-Control-Allow-Origin": options.allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers });
  const ownedConversation = async (id: string, actor: CortexActor) => {
    const conversation = await options.store.loadConversation(id, actor);
    if (
      !conversation || conversation.id !== id ||
      conversation.ownerId !== actor.id ||
      conversation.assistantId !== options.config.assistantId
    ) throw new CortexError(404, "NOT_FOUND");
    idSchema.parse(conversation.externalUserId);
    idSchema.parse(conversation.externalSessionId);
    return conversation;
  };
  return async (request) => {
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== options.allowedOrigin
    ) {
      return json({ code: "ORIGIN_DENIED" }, 403);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return json({ code: "METHOD_NOT_ALLOWED" }, 405);
    }
    try {
      const authenticated = await options.authenticate(request);
      if (!authenticated) return json({ code: "AUTH_REQUIRED" }, 401);
      const actor = actorSchema.parse(authenticated);
      let input: z.infer<typeof commandSchema>;
      try {
        input = commandSchema.parse(await request.json());
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return json({ code: "INVALID_REQUEST" }, 400);
        }
        throw error;
      }
      if (input.operation === "rag") {
        return json(
          await cortex.rag(actor.externalUserId, input, request.signal),
        );
      }
      if (input.operation === "create") {
        const created = await options.store.createConversation(
          actor,
          options.config.assistantId,
        );
        await ownedConversation(created.id, actor);
        return json({ id: created.id });
      }
      if (input.operation === "pdf") {
        const message = await options.store.loadAnswer(input.message_id, actor);
        if (
          !message || message.id !== input.message_id ||
          message.ownerId !== actor.id
        ) {
          return json({ code: "NOT_FOUND" }, 404);
        }
        const conversation = await ownedConversation(
          message.conversationId,
          actor,
        );
        const pdf = await cortex.pdf(
          conversation.externalUserId,
          conversation.externalSessionId,
          answerSchema.parse(message.answer),
          input.inline_id,
          request.signal,
        );
        return new Response(pdf.body, {
          headers: { ...headers, "Content-Type": "application/pdf" },
        });
      }
      const conversation = await ownedConversation(
        input.conversation_id,
        actor,
      );
      const abort = new AbortController();
      const signal = AbortSignal.any([
        request.signal,
        abort.signal,
        AbortSignal.timeout(120_000),
      ]);
      const upstream = await cortex.ask(
        conversation.externalUserId,
        conversation.externalSessionId,
        input,
        signal,
      );
      if (!upstream.ok) throw await responseError(upstream);
      const encoder = new TextEncoder();
      const question = input.message;
      const updates = async function* () {
        try {
          let answer: Answer | undefined;
          for await (const snapshot of readAnswers(upstream)) {
            signal.throwIfAborted();
            answer = snapshot;
            yield snapshot;
          }
          signal.throwIfAborted();
          if (!answer) throw new CortexError(502, "EMPTY_ANSWER");
          const saved = await options.store.saveAnswer(
            conversation,
            question,
            answer,
          );
          if (
            saved.ownerId !== actor.id ||
            saved.conversationId !== conversation.id || !saved.id
          ) {
            throw new CortexError(500, "PERSISTENCE_FAILED");
          }
          signal.throwIfAborted();
          yield { stream_event_type: "saved", message_id: saved.id };
        } catch (error) {
          signal.throwIfAborted();
          yield {
            stream_event_type: "error",
            code: error instanceof CortexError
              ? error.code
              : "INTEGRATION_FAILED",
            status: error instanceof CortexError ? error.status : 500,
            request_id: error instanceof CortexError ? error.requestId : null,
          };
        }
      };
      const iterator = updates();
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await iterator.next();
            if (next.done) controller.close();
            else {controller.enqueue(
                encoder.encode(JSON.stringify(next.value) + "\n"),
              );}
          } catch (error) {
            controller.error(error);
          }
        },
        async cancel() {
          abort.abort();
          await iterator.return();
        },
      }, { highWaterMark: 0 });
      return new Response(body, {
        headers: { ...headers, "Content-Type": "application/x-ndjson" },
      });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return json({ code: "INVALID_STORED_RECORD" }, 500);
      }
      if (error instanceof CortexError) {
        return json(
          { code: error.code, request_id: error.requestId },
          error.status,
        );
      }
      return json({ code: "INTEGRATION_FAILED" }, 500);
    }
  };
}
