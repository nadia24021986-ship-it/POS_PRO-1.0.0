// =====================================================================
// EDGE FUNCTION: register-store
// Dipanggil setelah user berhasil signUp lewat Supabase Auth (client-side).
// Membuat store_information, store_admins, devices, licenses (trial 30 hari),
// dan mencatat activation_logs. Menggunakan service role agar tidak bisa
// dimanipulasi dari client.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TRIAL_DAYS = 30;
const GRACE_PERIOD_DAYS = 7;

interface RegisterStorePayload {
  store_name: string;
  owner_name: string;
  phone: string;
  address?: string;
  email: string;
  device_fingerprint: string;
  platform: "web" | "android_apk";
  device_label?: string;
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

  // Ambil user dari JWT yang dikirim client (hasil signUp)
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);

  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
      status: 401,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const authUserId = userData.user.id;

  let payload: RegisterStorePayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { store_name, owner_name, phone, address, email, device_fingerprint, platform, device_label } = payload;

  if (!store_name || !owner_name || !phone || !email || !device_fingerprint || !platform) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Cegah satu auth user membuat lebih dari satu toko
  const { data: existingStore } = await supabase
    .from("store_information")
    .select("id")
    .eq("admin_auth_user_id", authUserId)
    .maybeSingle();

  if (existingStore) {
    return new Response(JSON.stringify({ error: "This account is already linked to a store" }), {
      status: 409,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // 1. Buat store
  const { data: store, error: storeError } = await supabase
    .from("store_information")
    .insert({
      store_name,
      owner_name,
      phone,
      address: address ?? null,
      email,
      admin_auth_user_id: authUserId,
    })
    .select()
    .single();

  if (storeError || !store) {
    return new Response(JSON.stringify({ error: `Failed to create store: ${storeError?.message}` }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // 2. Buat store_admins (role admin, pemilik akun)
  const { error: adminError } = await supabase.from("store_admins").insert({
    auth_user_id: authUserId,
    store_id: store.id,
    full_name: owner_name,
    role: "admin",
  });

  if (adminError) {
    return new Response(JSON.stringify({ error: `Failed to create admin: ${adminError.message}` }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // 3. Registrasi device (fingerprint unik per instalasi)
  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .upsert(
      {
        device_fingerprint,
        store_id: store.id,
        device_label: device_label ?? null,
        platform,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "device_fingerprint" }
    )
    .select()
    .single();

  if (deviceError || !device) {
    return new Response(JSON.stringify({ error: `Failed to register device: ${deviceError?.message}` }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // 4. Buat license trial 30 hari
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const { data: license, error: licenseError } = await supabase
    .from("licenses")
    .insert({
      store_id: store.id,
      device_id: device.id,
      status: "trial",
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      grace_period_days: GRACE_PERIOD_DAYS,
      last_verified_at: now.toISOString(),
      last_verified_online: true,
    })
    .select()
    .single();

  if (licenseError || !license) {
    return new Response(JSON.stringify({ error: `Failed to create license: ${licenseError?.message}` }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // 5. Catat log
  await supabase.from("activation_logs").insert({
    store_id: store.id,
    device_id: device.id,
    license_id: license.id,
    action: "trial_started",
    performed_by: "system",
    notes: `Trial ${TRIAL_DAYS} hari dimulai saat registrasi toko`,
  });

  return new Response(
    JSON.stringify({
      success: true,
      store_id: store.id,
      license: {
        status: license.status,
        expires_at: license.expires_at,
        remaining_days: TRIAL_DAYS,
      },
    }),
    { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
  );
});

