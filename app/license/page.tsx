"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LicensePage() {
  const router = useRouter();
  const [keyCode, setKeyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleRedeem() {
    if (!keyCode.trim()) {
      setError("Masukkan kode aktivasi terlebih dahulu.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const deviceFingerprint = getDeviceFingerprint();

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/redeem-license-key`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ key_code: keyCode.trim(), device_fingerprint: deviceFingerprint }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Kode aktivasi tidak valid.");
      }

      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-xl font-semibold text-emerald-400 mb-2">Aktivasi Berhasil</h1>
          <p className="text-sm text-gray-400">Mengalihkan ke dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h1 className="text-xl font-semibold text-gray-100 mb-1">Masukkan Activation Key</h1>
        <p className="text-sm text-gray-500 mb-4">
          Masukkan kode aktivasi yang diberikan oleh admin.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">
            {error}
          </div>
        )}

        <input
          type="text"
          placeholder="Contoh: SPP-XXXX-XXXX"
          value={keyCode}
          onChange={(e) => setKeyCode(e.target.value.toUpperCase())}
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 tracking-wider text-center"
        />

        <button
          onClick={handleRedeem}
          disabled={loading}
          className="mt-4 w-full py-2.5 rounded-lg bg-teal-600 text-white font-medium disabled:opacity-50"
        >
          {loading ? "Memproses..." : "Aktivasi"}
        </button>
      </div>
    </main>
  );
}
