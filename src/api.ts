import { createCortexBrowserClient } from "../sdk/browser.ts";
import { createSupabaseFetch } from "../sdk/adapters/supabase-browser.ts";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { answerSchema } from "../sdk/protocol/contract.ts";

const url = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !publicKey) {
  throw new Error(
    "Set your application's public Supabase settings in .env.local",
  );
}
export const supabase = createClient(url, publicKey);
export const conversationSchema = z.object({
  id: z.string(),
  assistant_id: z.string(),
});
export const messageSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: answerSchema,
});

export const cortex = createCortexBrowserClient({
  endpoint: `${url}/functions/v1/cortex`,
  fetch: createSupabaseFetch(supabase, publicKey),
});
