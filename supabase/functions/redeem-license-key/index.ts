// =====================================================================
// EDGE FUNCTION: redeem-license-key
// Dipanggil dari halaman /license saat pemilik toko memasukkan
// activation key. Validasi kode, bind ke toko, perpanjang lisensi.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RedeemPayload {
  key_code: string;
  device_fingerprint?: string;
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function computeExpiry(licenseType: string, from: Date): string | null {
  const d = new Date(from);
  switch (licenseType) {
    case "1_month":
      d.setDate(d.getDate() + 30);
      return d.toISOString();
    case "6_month":
      d.setDate(d.getDate() + 180);
      return d.toISOString();
    case "1_year":
      d.setDate(d.getDate() + 365);
      return d.toISOString();
    case "permanent":
      return null;
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
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

  const keyCode = payload.key_code?.trim();
  if (!keyCode) {
    return new Response(JSON.stringify({ error: "Kode aktivasi wajib diisi." }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // 1. Cari store dari admin yang login
  const { data: storeAdmin, error: adminError } = await supabase
    .from("store_admins")
    .select("store_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (adminError || !storeAdmin) {
    return new Response(JSON.stringify({ error: "Akun tidak terhubung ke toko manapun." }), {
      status: 403,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const storeId = storeAdmin.store_id;

  // 2. Cari device (opsional)
  let deviceId: string | null = null;
  if (payload.device_fingerprint) {
    const { data: device } = await supabase
      .from("devices")
      .select("id")
      .eq("device_fingerprint", payload.device_fingerprint)
      .eq("store_id", storeId)
      .maybeSingle();
    if (device) deviceId = device.id;
  }

  // 3. Cari kode lisensi yang masih unused
  const { data: keyRow, error: keyError } = await supabase
    .from("license_keys")
    .select("*")
    .eq("key_code", keyCode)
    .maybeSingle();

  if (keyError || !keyRow) {
    return new Response(JSON.stringify({ error: "Kode aktivasi tidak ditemukan." }), {
      status: 404,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (keyRow.status !== "unused") {
    return new Response(JSON.stringify({ error: "Kode aktivasi sudah digunakan atau tidak berlaku." }), {
      status: 409,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const expiresAt = computeExpiry(keyRow.license_type, now);

  // 4. Tandai kode sebagai active (terpakai) dan bind ke toko ini
  const { error: updateKeyError } = await supabase
    .from("license_keys")
    .update({
      status: "active",
      bound_store_id: storeId,
      bound_device_id: deviceId,
      used_at: now.toISOString(),
    })
    .eq("id", keyRow.id);

  if (updateKeyError) {
    return new Response(JSON.stringify({ error: `Gagal memproses kode aktivasi: ${updateKeyError.message}` }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // 5. Update/insert license aktif untuk toko ini
  const newStatus = keyRow.license_type === "permanent" ? "permanent" : "active";

  const { data: existingLicense } = await supabase
    .from("licenses")
    .select("id")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingLicense) {
    await supabase
      .from("licenses")
      .update({
        status: newStatus,
        expires_at: expiresAt,
        activated_at: now.toISOString(),
        last_verified_at: now.toISOString(),
        last_verified_online: true,
      })
      .eq("id", existingLicense.id);
  } else {
    await supabase.from("licenses").insert({
      store_id: storeId,
      device_id: deviceId,
      status: newStatus,
      activated_at: now.toISOString(),
      expires_at: expiresAt,
      grace_period_days: 7,
      last_verified_at: now.toISOString(),
      last_verified_online: true,
    });
  }

  // 6. Catat log
  await supabase.from("activation_logs").insert({
    store_id: storeId,
    device_id: deviceId,
    action: "license_redeemed",
    performed_by: "store_owner",
    notes: `Kode ${keyCode} (${keyRow.license_type}) berhasil diaktifkan.`,
  });

  return new Response(
    JSON.stringify({
      success: true,
      license_type: keyRow.license_type,
      expires_at: expiresAt,
    }),
    { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
  );
});
