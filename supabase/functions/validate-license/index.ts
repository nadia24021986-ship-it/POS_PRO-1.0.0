// =====================================================================
// EDGE FUNCTION: validate-license
// Dipanggil setiap kali aplikasi dibuka / user login.
// Menentukan status lisensi terkini (trial/permanent/expired/disabled),
// menghitung sisa hari, dan mencatat log validasi.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ValidatePayload {
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

  let payload: ValidatePayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (!payload.device_fingerprint) {
    return new Response(JSON.stringify({ error: "device_fingerprint is required" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Cari store admin dari auth user ini
  const { data: admin } = await supabase
    .from("store_admins")
    .select("store_id, is_active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!admin || !admin.is_active) {
    return new Response(JSON.stringify({ error: "No active store found for this account" }), {
      status: 404,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const storeId = admin.store_id;

  // Cari device terdaftar
  const { data: device } = await supabase
    .from("devices")
    .select("id, is_blocked, is_trusted")
    .eq("device_fingerprint", payload.device_fingerprint)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!device) {
    await supabase.from("activation_logs").insert({
      store_id: storeId,
      action: "validation_failed",
      performed_by: "system",
      notes: "Unknown device fingerprint for this store",
    });
    return new Response(
      JSON.stringify({ status: "disabled", message: "Perangkat ini belum terdaftar untuk toko ini." }),
      { status: 403, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }

  if (device.is_blocked) {
    return new Response(
      JSON.stringify({ status: "disabled", message: "Perangkat ini telah diblokir. Hubungi Master." }),
      { status: 403, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }

  // Cari license aktif untuk store + device ini
  const { data: license } = await supabase
    .from("licenses")
    .select("*")
    .eq("store_id", storeId)
    .eq("device_id", device.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!license) {
    return new Response(
      JSON.stringify({ status: "expired", remaining_days: 0, message: "Tidak ada lisensi ditemukan untuk perangkat ini." }),
      { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }

  const now = new Date();
  const expiresAt = new Date(license.expires_at);
  const graceDeadline = new Date(expiresAt.getTime() + license.grace_period_days * 24 * 60 * 60 * 1000);

  let effectiveStatus = license.status;

  if (license.status === "disabled") {
    effectiveStatus = "disabled";
  } else if (now > graceDeadline) {
    effectiveStatus = "expired";
  }

  const remainingMs = expiresAt.getTime() - now.getTime();
  const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

  // Update status jika berubah jadi expired, dan selalu update last_verified_at
  const updates: Record<string, unknown> = {
    last_verified_at: now.toISOString(),
    last_verified_online: true,
    updated_at: now.toISOString(),
  };
  if (effectiveStatus !== license.status) {
    updates.status = effectiveStatus;
  }

  await supabase.from("licenses").update(updates).eq("id", license.id);
  await supabase.from("devices").update({ last_seen_at: now.toISOString() }).eq("id", device.id);

  await supabase.from("activation_logs").insert({
    store_id: storeId,
    device_id: device.id,
    license_id: license.id,
    action: effectiveStatus === "expired" ? "validation_failed" : "validation_success",
    performed_by: "system",
    notes: `Status: ${effectiveStatus}, remaining_days: ${remainingDays}`,
  });

  return new Response(
    JSON.stringify({
      status: effectiveStatus,
      remaining_days: remainingDays,
      expires_at: license.expires_at,
      grace_period_days: license.grace_period_days,
      message:
        effectiveStatus === "expired"
          ? "Trial 30 hari Anda telah berakhir. Hubungi nadinevindro@gmail.com / 081384325809 untuk aktivasi Lisensi Permanen."
          : null,
    }),
    { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
  );
});
