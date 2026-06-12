// Edge Function: strava-cache
// Per-user activity cache with real isolation.
//
// The browser never touches the table directly. It sends the visitor's Strava
// access token; this function verifies it against Strava to learn *which*
// athlete is calling, then reads/writes only that athlete's row using the
// service-role key (which bypasses RLS). With RLS enabled and no anon policies,
// the table is unreachable except through here.
//
// Deploy:  supabase functions deploy strava-cache --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, x-strava-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Identify the caller by their Strava token (no Strava token = no access)
  const token = req.headers.get("x-strava-token") || "";
  if (!token) return json({ error: "missing token" }, 401);

  const who = await fetch("https://www.strava.com/api/v3/athlete", {
    headers: { Authorization: "Bearer " + token },
  });
  if (!who.ok) return json({ error: "invalid strava token" }, 401);
  const athlete = await who.json();
  const id = athlete?.id;
  if (!id) return json({ error: "no athlete id" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (req.method === "GET") {
    const { data, error } = await sb
      .from("strava_cache")
      .select("activities, synced_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json(null, 200);
    const age = Date.now() - new Date(data.synced_at).getTime();
    if (age > CACHE_TTL_MS) return json(null, 200); // stale
    return json(data, 200);
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const activities = body.activities;
    if (!Array.isArray(activities)) return json({ error: "activities required" }, 400);
    const synced_at = new Date().toISOString();
    const { error } = await sb
      .from("strava_cache")
      .upsert({ id, activities, synced_at }, { onConflict: "id" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, synced_at }, 200);
  }

  return json({ error: "method not allowed" }, 405);
});
