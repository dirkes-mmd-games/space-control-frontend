// Supabase Edge Function: create_session_invite
// Issues a single-use-visible random invite token for the authenticated session admin.
// Only the token hash is persisted; the raw token is returned to the admin once.

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

  if (Object.keys(payload).some((key) => key !== "session_id")) {
    return respond(400, { error: "Request contains unsupported fields" });
  }
  if (typeof payload.session_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.session_id)) {
    return respond(400, { error: "A valid session_id is required" });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return respond(401, { error: "Invalid or expired session" });

  const { data, error } = await supabase.rpc("create_session_invite", {
    p_session_id: payload.session_id,
  });

  if (error) {
    const clientError = ["22023", "42501", "P0002"].includes(error.code ?? "");
    return respond(clientError ? 400 : 500, {
      error: clientError ? error.message : "Could not create session invite",
    });
  }

  return respond(201, { invite: data });
});
