// =====================================================================
// lib/posHelpers.ts
// Helper khusus modul kasir/POS.
// =====================================================================

import { supabase } from "@/lib/supabaseClient";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";

export interface CurrentAdmin {
  id: string; // store_admins.id (bukan auth_user_id)
  store_id: string;
  full_name: string;
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const { data } = await supabase
    .from("store_admins")
    .select("id, store_id, full_name")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  return data ?? null;
}

export async function getCurrentDeviceRecordId(storeId: string): Promise<string | null> {
  const fingerprint = getDeviceFingerprint();

  const { data } = await supabase
    .from("devices")
    .select("id")
    .eq("device_fingerprint", fingerprint)
    .eq("store_id", storeId)
    .maybeSingle();

  return data?.id ?? null;
}

