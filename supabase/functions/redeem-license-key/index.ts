// =====================================================================
// EDGE FUNCTION: redeem-license-key
// Dipanggil dari halaman License saat admin toko memasukkan Activation Key.
// Mengubah license_keys.status jadi 'active' dan licenses.status jadi 'permanent'.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RedeemPayload {
  key_code: string;
  device_fingerprint: string;
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);

  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
      status: 401,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const authUserId = userData.user.id;

  let payload: RedeemPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { key_code, device_fingerprint } = payload;
  if (!key_code || !device_fingerprint) {
    return new Response(JSON.stringify({ error: "key_code and device_fingerprint are required" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { data: admin } = await supabase
    .from("store_admins")
    .select("store_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!admin) {
    return new Response(JSON.stringify({ error: "No store found for this account" }), {
      status: 404,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const storeId = admin.store_id;
  const normalizedKey = key_code.trim().toUpperCase();

  const { data: key } = await supabase
    .from("license_keys")
    .select("*")
    .eq("key_code", normalizedKey)
    .maybeSingle();

  if (!key) {
    return new Response(JSON.stringify({ error: "Activation Key tidak ditemukan." }), {
      status: 404,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (key.status !== "unused") {
    return new Response(JSON.stringify({ error: "Activation Key sudah digunakan atau tidak valid." }), {
      status: 409,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (key.bound_store_id && key.bound_store_id !== storeId) {
    return new Response(JSON.stringify({ error: "Activation Key ini terikat ke toko lain." }), {
      status: 403,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { data: device } = await supabase
    .from("devices")
    .select("id")
    .eq("device_fingerprint", device_fingerprint)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!device) {
    return new Response(JSON.stringify({ error: "Perangkat ini belum terdaftar untuk toko Anda." }), {
      status: 404,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const expiresAt = key.expires_at
    ? new Date(key.expires_at)
    : new Date(now.getFullYear() + 100, now.getMonth(), now.getDate()); // "tidak pernah expired" secara praktis

  // 1. Tandai key sebagai terpakai
  const { error: keyUpdateError } = await supabase
    .from("license_keys")
    .update({
      status: "active",
      bound_store_id: storeId,
      bound_device_id: device.id,
      used_at: now.toISOString(),
    })
    .eq("id", key.id)
    .eq("status", "unused"); // guard tambahan mencegah race condition

  if (keyUpdateError) {
    return new Response(JSON.stringify({ error: `Failed to redeem key: ${keyUpdateError.message}` }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // 2. Cari license existing untuk store+device ini, update jadi permanent
  const { data: existingLicense } = await supabase
    .from("licenses")
    .select("id")
    .eq("store_id", storeId)
    .eq("device_id", device.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let licenseId: string;

  if (existingLicense) {
    await supabase
      .from("licenses")
      .update({
        status: "permanent",
        license_key_id: key.id,
        expires_at: expiresAt.toISOString(),
        last_verified_at: now.toISOString(),
        last_verified_online: true,
        updated_at: now.toISOString(),
      })
      .eq("id", existingLicense.id);
    licenseId = existingLicense.id;
  } else {
    const { data: newLicense, error: newLicenseError } = await supabase
      .from("licenses")
      .insert({
        store_id: storeId,
        device_id: device.id,
        license_key_id: key.id,
        status: "permanent",
        activated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        last_verified_at: now.toISOString(),
        last_verified_online: true,
      })
      .select()
      .single();

    if (newLicenseError || !newLicense) {
      return new Response(JSON.stringify({ error: `Failed to create license: ${newLicenseError?.message}` }), {
        status: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    licenseId = newLicense.id;
  }

  await supabase.from("activation_logs").insert({
    store_id: storeId,
    device_id: device.id,
    license_id: licenseId,
    action: "converted_to_permanent",
    performed_by: userData.user.email ?? "unknown",
    notes: `Activation Key ${normalizedKey} berhasil diredeem`,
  });

  return new Response(
    JSON.stringify({ success: true, status: "permanent", expires_at: expiresAt.toISOString() }),
    { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
  );
});
