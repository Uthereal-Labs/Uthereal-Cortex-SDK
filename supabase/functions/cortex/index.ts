import { createClient } from "@supabase/supabase-js";
import { createCortexHandler } from "../../../sdk/server.ts";
import {
  createSupabaseAuthenticator,
  createSupabaseStore,
} from "../../../sdk/adapters/supabase-server.ts";

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server setting: ${name}`);
  return value;
}

// Install credentials in YOUR application's server, never Cortex's project or browser.
const db = createClient(
  requiredSecret("SUPABASE_URL"),
  requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
Deno.serve(createCortexHandler({
  config: {
    assistantId: requiredSecret("CORTEX_ASSISTANT_ID"),
    baseUrl: requiredSecret("CORTEX_API_BASE_URL"),
    apiKey: requiredSecret("CORTEX_SHARED_API_KEY"),
  },
  authenticate: createSupabaseAuthenticator(db),
  store: createSupabaseStore(db),
  allowedOrigin: requiredSecret("APP_ORIGIN"),
}));
