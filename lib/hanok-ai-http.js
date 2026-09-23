export const HANOK_AI_CORS = {
  "Access-Control-Allow-Origin": "https://hanokops.local",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

export function hanokJson(body, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(HANOK_AI_CORS)) headers.set(key, value);
  return Response.json(body, { ...init, headers });
}

export function hanokOptions() {
  return new Response(null, { status: 204, headers: HANOK_AI_CORS });
}
