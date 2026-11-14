// Supabase Edge Function: create_session
// Creates the session, creator membership, admin permission and opening account
// through one transactional PostgreSQL RPC. No service-role key is exposed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return respond(401, { error: "Authentication required" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return respond(500, { error: "Supabase environment is not configured" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return respond(400, { error: "Request body must be valid JSON" });
  }

  const allowed = ["game_id", "display_name", "nickname", "max_members", "initial_balance", "currency"];
  if (Object.keys(payload).some((key) => !allowed.includes(key))) {
    return respond(400, { error: "Request contains unsupported fields" });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return respond(401, { error: "Invalid or expired session" });

  const { data, error } = await supabase.rpc("create_session", {
    p_game_id: payload.game_id,
    p_display_name: payload.display_name,
    p_nickname: payload.nickname,
    p_max_members: payload.max_members ?? 3,
    p_initial_balance: payload.initial_balance ?? 1000,
    p_currency: payload.currency ?? "CREDITS",
  });

  if (error) {
    const clientError = ["22023", "23505"].includes(error.code ?? "");
    return respond(clientError ? 400 : 500, { error: clientError ? error.message : "Could not create session" });
  }

  return respond(201, { session: data });
});
