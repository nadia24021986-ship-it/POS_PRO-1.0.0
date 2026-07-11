// =====================================================================
// lib/supabaseClient.ts
// Satu instance Supabase client dipakai bersama di seluruh app,
// supaya tidak membuat client baru berulang-ulang di tiap komponen.
// =====================================================================

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Mengambil store_id milik admin yang sedang login.
 * Mengandalkan RLS: baris store_admins yang bisa dibaca cuma milik sendiri.
 */
export async function getCurrentStoreId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const { data } = await supabase
    .from("store_admins")
    .select("store_id")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  return data?.store_id ?? null;
}

