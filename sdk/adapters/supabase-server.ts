/** Optional Supabase adapter for the example tables; map existing apps through CortexStore. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { answerSchema, CortexError } from "../core.ts";
import type { CortexActor, CortexStore } from "../server.ts";

const conversationSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  assistant_id: z.string(),
  external_user_id: z.string(),
  external_session_id: z.string(),
}).transform((row) => ({
  id: row.id,
  ownerId: row.owner_id,
  assistantId: row.assistant_id,
  externalUserId: row.external_user_id,
  externalSessionId: row.external_session_id,
}));
const messageSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  conversation_id: z.string(),
  answer: answerSchema,
}).transform((row) => ({
  id: row.id,
  ownerId: row.owner_id,
  conversationId: row.conversation_id,
  answer: row.answer,
}));

export function createSupabaseAuthenticator(
  db: SupabaseClient,
  externalUserId = (id: string) => id,
) {
  return async (request: Request): Promise<CortexActor | null> => {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)
      ?.[1];
    if (!token) return null;
    const { data: { user }, error } = await db.auth.getUser(token);
    return error || !user
      ? null
      : { id: user.id, externalUserId: externalUserId(user.id) };
  };
}

export function createSupabaseStore(db: SupabaseClient): CortexStore {
  return {
    async createConversation(actor, assistantId) {
      const id = crypto.randomUUID();
      const { data, error } = await db.from("cortex_demo_conversations").insert(
        {
          id,
          owner_id: actor.id,
          assistant_id: assistantId,
          external_user_id: actor.externalUserId,
          external_session_id: id,
        },
      ).select("*").single();
      if (error) throw new CortexError(500, "PERSISTENCE_FAILED");
      return conversationSchema.parse(data);
    },
    async loadConversation(id, actor) {
      const { data, error } = await db.from("cortex_demo_conversations").select(
        "*",
      )
        .eq("id", id).eq("owner_id", actor.id).maybeSingle();
      if (error) throw new CortexError(500, "PERSISTENCE_READ_FAILED");
      return data ? conversationSchema.parse(data) : null;
    },
    async loadAnswer(id, actor) {
      const { data, error } = await db.from("cortex_demo_messages").select(
        "id, owner_id, conversation_id, answer",
      )
        .eq("id", id).eq("owner_id", actor.id).maybeSingle();
      if (error) throw new CortexError(500, "PERSISTENCE_READ_FAILED");
      return data ? messageSchema.parse(data) : null;
    },
    async saveAnswer(conversation, question, answer) {
      const { data, error } = await db.from("cortex_demo_messages").insert({
        owner_id: conversation.ownerId,
        conversation_id: conversation.id,
        question,
        answer,
      }).select("id, owner_id, conversation_id, answer").single();
      if (error) throw new CortexError(500, "PERSISTENCE_FAILED");
      return messageSchema.parse(data);
    },
  };
}
