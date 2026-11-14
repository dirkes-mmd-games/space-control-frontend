// Supabase Edge Function: request_session_join
// Validates an invite token and submits a pending join request.
// The invite is not consumed until an admin approves the request.

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

  if (Object.keys(payload).some((key) => !["token", "nickname"].includes(key))) {
    return respond(400, { error: "Request contains unsupported fields" });
  }
  if (typeof payload.token !== "string" || !/^[0-9a-fA-F]{64}$/.test(payload.token)) {
    return respond(400, { error: "A valid invite token is required" });
  }
  if (typeof payload.nickname !== "string" ||
      payload.nickname.trim().length < 2 ||
      payload.nickname.trim().length > 20) {
    return respond(400, { error: "Nickname must contain 2 to 20 characters" });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return respond(401, { error: "Invalid or expired session" });

  const { data, error } = await supabase.rpc("request_session_join", {
    p_token: payload.token,
    p_nickname: payload.nickname.trim(),
  });

  if (error) {
    const clientError = ["22023", "23505", "42501", "P0002"].includes(error.code ?? "");
    return respond(clientError ? 400 : 500, {
      error: clientError ? error.message : "Could not submit join request",
    });
  }

  return respond(201, { join_request: data });
});
