import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" });
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return respond(401, { error: "Authentication required" });
  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return respond(400, { error: "Request body must be valid JSON" }); }
  if (Object.keys(payload).some((key) => key !== "token") ||
      typeof payload.token !== "string" || !/^[0-9a-fA-F]{64}$/.test(payload.token)) {
    return respond(400, { error: "A valid invitation token is required" });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return respond(500, { error: "Supabase environment is not configured" });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bytes = new TextEncoder().encode(payload.token.toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const tokenHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data: invite, error: inviteError } = await admin
    .from("session_invites")
    .select("session_id,expires_at,revoked_at,use_count,max_uses")
    .eq("token_hash", tokenHash).maybeSingle();
  if (inviteError) return respond(500, { error: "Could not read invitation" });
  if (!invite || invite.revoked_at || new Date(invite.expires_at).getTime() <= Date.now() ||
      invite.use_count >= invite.max_uses) return respond(404, { error: "Invitation is invalid, expired, or full" });
  const { data: session, error: sessionError } = await admin
    .from("game_sessions").select("id,display_name,status").eq("id", invite.session_id).maybeSingle();
  if (sessionError) return respond(500, { error: "Could not read game session" });
  if (!session || !["created", "active"].includes(session.status)) return respond(404, { error: "Game session is no longer available" });
  return respond(200, { session: { id: session.id, display_name: session.display_name } });
});
