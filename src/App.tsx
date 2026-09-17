import { useActionState, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Answer } from "../sdk/protocol/contract.ts";
import { conversationSchema, cortex, messageSchema, supabase } from "./api.ts";
import { CitedAnswer } from "../sdk/react.ts";

export function App() {
  const identity = useRef<string | null>(null);
  const activeAsk = useRef<AbortController | null>(null);
  const cache = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Answer>();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user.id ?? null;
      if (identity.current === nextUser) return;
      activeAsk.current?.abort();
      identity.current = nextUser;
      setUserId(nextUser);
      setConversationId(null);
      setPreview(undefined);
      cache.clear();
    });
    return () => {
      data.subscription.unsubscribe();
      activeAsk.current?.abort();
    };
  }, [cache]);
  const conversations = useQuery({
    queryKey: ["conversations", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from("cortex_demo_conversations")
        .select("id, assistant_id").order("created_at");
      if (error) throw error;
      return z.array(conversationSchema).parse(data);
    },
  });
  const messages = useQuery({
    queryKey: ["messages", userId, conversationId],
    enabled: Boolean(userId && conversationId),
    queryFn: async () => {
      const { data, error } = await supabase.from("cortex_demo_messages")
        .select("id, question, answer")
        .eq("conversation_id", conversationId).order("created_at");
      if (error) throw error;
      return z.array(messageSchema).parse(data);
    },
  });
  const [error, submit, pending] = useActionState(
    async (_previous: string | null, form: FormData) => {
      try {
        if (!userId) {
          const result = await supabase.auth.signInWithPassword({
            email: String(form.get("email")),
            password: String(form.get("password")),
          });
          if (result.error) throw result.error;
        } else {
          const controller = new AbortController();
          activeAsk.current?.abort();
          activeAsk.current = controller;
          let id = conversationId;
          if (!id) {
            id = await cortex.createConversation(controller.signal);
            setConversationId(id);
            await cache.invalidateQueries({
              queryKey: ["conversations", userId],
            });
          }
          setPreview(undefined);
          for await (
            const update of cortex.ask(id, {
              message: String(form.get("message")),
            }, controller.signal)
          ) {
            if (controller.signal.aborted) {
              throw new DOMException("Cancelled", "AbortError");
            }
            if (update.type === "answer") setPreview(update.answer);
          }
          await cache.invalidateQueries({ queryKey: ["messages", userId, id] });
          setPreview(undefined);
        }
        return null;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          return null;
        }
        return cause instanceof Error ? cause.message : "Request failed";
      }
    },
    null,
  );
  return (
    <main>
      <h1>Cortex SDK example</h1>
      {!userId
        ? (
          <form action={submit}>
            <p>
              Sign in with a test user from your application’s Supabase project.
            </p>
            <label>
              Email <input name="email" type="email" required />
            </label>
            <label>
              Password <input name="password" type="password" required />
            </label>
            <button type="submit" disabled={pending}>Sign in</button>
          </form>
        )
        : (
          <>
            <button type="button" onClick={() => void supabase.auth.signOut()}>
              Sign out
            </button>
            <label>
              Conversation{" "}
              <select
                disabled={pending}
                value={conversationId ?? ""}
                onChange={(event) => {
                  setConversationId(event.target.value || null);
                  setPreview(undefined);
                }}
              >
                <option value="">New conversation</option>
                {conversations.data?.map((item) => (
                  <option key={item.id} value={item.id}>{item.id}</option>
                ))}
              </select>
            </label>
            {(conversations.error || messages.error) && (
              <p role="alert">
                History unavailable. Check the example schema and permissions.
              </p>
            )}
            {messages.data?.map((item) => (
              <article key={item.id}>
                <h2>{item.question}</h2>
                <CitedAnswer
                  key={userId}
                  answer={item.answer}
                  messageId={item.id}
                  authScope={userId}
                  loadPdf={cortex.pdf}
                />
              </article>
            ))}
            {preview && (
              <CitedAnswer
                answer={preview}
                authScope={userId}
                loadPdf={cortex.pdf}
              />
            )}
            <form action={submit}>
              <label>
                Question <textarea name="message" required />
              </label>
              <button type="submit" disabled={pending}>
                {pending ? "Answering…" : "Ask"}
              </button>
            </form>
          </>
        )}
      {error && (
        <p role="alert">
          {error}. A failed ask may already have created a Cortex turn; retry
          deliberately.
        </p>
      )}
    </main>
  );
}
