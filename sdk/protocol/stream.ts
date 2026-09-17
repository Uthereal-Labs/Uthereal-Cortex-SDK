import { z } from "zod";
import { type Answer, answerSchema } from "./contract.ts";
import { mergeAnswer } from "./citations.ts";
import { CortexError, responseError } from "./errors.ts";

/** No SSE framing: Cortex sends NDJSON despite its text/event-stream content type. */
export async function* readAnswers(
  response: Response,
  options: { requireSaved?: boolean; onSaved?: (messageId: string) => void } =
    {},
): AsyncGenerator<Answer> {
  if (!response.ok) throw await responseError(response);
  if (!response.body) throw new CortexError(502, "EMPTY_STREAM");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let saved = false;
  let answer: Answer | undefined;
  let pending: Answer = answerSchema.parse({
    utterance: "",
    interaction_id: "",
  });
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      if (done && buffer.trim()) {
        lines.push(buffer);
        buffer = "";
      }
      if (
        buffer.length > 8_000_000 ||
        lines.some((line) => line.length > 8_000_000)
      ) {
        throw new CortexError(502, "STREAM_LINE_TOO_LARGE");
      }
      for (const line of lines) {
        if (!line.trim()) continue;
        if (saved) throw new CortexError(502, "EVENT_AFTER_SAVED");
        const event: unknown = JSON.parse(line);
        if (!event || typeof event !== "object" || Array.isArray(event)) {
          throw new CortexError(502, "INVALID_STREAM_EVENT");
        }
        if (
          "stream_event_type" in event && event.stream_event_type === "error"
        ) {
          const error = z.object({
            code: z.string().default("STREAM_ERROR"),
            request_id: z.string().nullish(),
            status: z.number().int().min(400).max(599).default(502),
          }).parse(event);
          throw new CortexError(
            error.status,
            error.code,
            error.request_id ?? null,
          );
        }
        if (
          "stream_event_type" in event && event.stream_event_type === "saved"
        ) {
          const completion = z.object({
            message_id: z.string().min(1).max(256),
          }).parse(event);
          saved = true;
          options.onSaved?.(completion.message_id);
          continue;
        }
        // Status/metadata frames can carry references before the first answer snapshot.
        const parsed = answerSchema.parse({
          ...event,
          utterance: "utterance" in event ? event.utterance : pending.utterance,
          interaction_id:
            "interaction_id" in event && event.interaction_id != null
              ? event.interaction_id
              : pending.interaction_id,
        });
        if (!pending.interaction_id) {
          pending.interaction_id = parsed.interaction_id;
        }
        pending = mergeAnswer(pending, parsed);
        if ("utterance" in event || answer) {
          answer = pending;
          yield answer;
        }
      }
      if (done) break;
    }
    if (!answer?.utterance.trim() || !answer.interaction_id) {
      throw new CortexError(502, "EMPTY_ANSWER");
    }
    if (options.requireSaved && !saved) {
      throw new CortexError(502, "ANSWER_NOT_SAVED");
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    if (error instanceof CortexError) {
      error.requestId ??= response.headers.get("x-request-id");
      throw error;
    }
    throw new CortexError(
      502,
      "INVALID_STREAM",
      response.headers.get("x-request-id"),
    );
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
