import type { SupabaseClient } from "@supabase/supabase-js";
import { CortexError } from "../core.ts";

/** Supabase owns session renewal. A failed request is never replayed automatically. */
export function createSupabaseFetch(
  client: SupabaseClient,
  publicKey: string,
  fetcher: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) throw new CortexError(401, "AUTH_REQUIRED");
    const request = new Request(input, init);
    request.headers.set("Authorization", `Bearer ${session.access_token}`);
    request.headers.set("apikey", publicKey);
    return fetcher(request);
  };
}
