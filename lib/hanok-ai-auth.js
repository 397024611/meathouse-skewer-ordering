const HANOK_SB_URL = "https://lludyxgivnmmkovhhrgg.supabase.co";
const HANOK_SB_KEY = "sb_publishable_YCeXPfqOdVS84ZRis-miEg_v7W0s3Dg";

export async function requireHanokHQ(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  const token = auth.slice(7);

  const userRes = await fetch(HANOK_SB_URL + "/auth/v1/user", {
    headers: {
      apikey: HANOK_SB_KEY,
      Authorization: "Bearer " + token,
    },
    cache: "no-store",
  });

  if (!userRes.ok) {
    return { ok: false, status: 401, error: "Invalid Hanok HQ session" };
  }

  const user = await userRes.json();

  const profileRes = await fetch(
    HANOK_SB_URL +
      "/rest/v1/ops_profiles?user_id=eq." +
      encodeURIComponent(user.id) +
      "&select=user_id,display_name,role,store_id",
    {
      headers: {
        apikey: HANOK_SB_KEY,
        Authorization: "Bearer " + token,
      },
      cache: "no-store",
    },
  );

  if (!profileRes.ok) {
    return { ok: false, status: 403, error: "Could not verify HQ role" };
  }

  const rows = await profileRes.json();
  const profile = rows?.[0];

  if (!profile || !["admin", "hq"].includes(profile.role)) {
    return { ok: false, status: 403, error: "HQ role required" };
  }

  return { ok: true, token, user, profile };
}
