// Edge Function: img
// Image download proxy. Strava's photo CDN blocks cross-origin fetch, so the
// browser can't turn a photo into a blob to download it. This fetches the image
// server-side and returns it with a Content-Disposition: attachment header so
// the browser downloads it (instead of opening a new tab). Restricted to known
// Strava/CloudFront image hosts.
//
// Deploy:  supabase functions deploy img --no-verify-jwt
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey",
};
const ALLOWED = /(?:^|\.)(?:cloudfront\.net|strava\.com|stravausercontent\.com)$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const u = new URL(req.url);
  const target = u.searchParams.get("url");
  const name = (u.searchParams.get("name") || "photo.jpg").replace(/[^\w.\-]+/g, "_");
  if (!target) return new Response("missing url", { status: 400, headers: cors });

  let host;
  try { host = new URL(target).hostname; } catch { return new Response("bad url", { status: 400, headers: cors }); }
  if (!ALLOWED.test(host)) return new Response("forbidden host", { status: 403, headers: cors });

  const r = await fetch(target);
  if (!r.ok) return new Response("upstream " + r.status, { status: 502, headers: cors });
  const buf = await r.arrayBuffer();
  return new Response(buf, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": r.headers.get("content-type") || "image/jpeg",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
});
