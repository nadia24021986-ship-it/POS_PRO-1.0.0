"use client";

// =====================================================================
// LicenseGuard.tsx
// Bungkus seluruh layout aplikasi dengan komponen ini. Memvalidasi
// lisensi setiap kali app dibuka. Jika expired/disabled, seluruh fitur
// diblokir dan hanya halaman License yang ditampilkan.
// =====================================================================

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type LicenseStatus = "trial" | "permanent" | "expired" | "disabled";

interface LicenseState {
  status: LicenseStatus;
  remaining_days: number;
  message: string | null;
  isLoading: boolean;
  isOfflineGrace: boolean;
}

const OFFLINE_GRACE_DAYS = 7;
const CACHE_KEY = "spp_license_cache";

export default function LicenseGuard({ children }: { children: ReactNode }) {
  const [license, setLicense] = useState<LicenseState>({
    status: "trial",
    remaining_days: 0,
    message: null,
    isLoading: true,
    isOfflineGrace: false,
  });

  useEffect(() => {
    validateLicense();
  }, []);

  async function validateLicense() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setLicense((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      const deviceFingerprint = getDeviceFingerprint();

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/validate-license`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ device_fingerprint: deviceFingerprint }),
        }
      );

      if (!response.ok && response.status !== 403) {
        // Server tidak terjangkau -> cek cache offline grace period
        return applyOfflineCache();
      }

      const result = await response.json();

      const newState: LicenseState = {
        status: result.status,
        remaining_days: result.remaining_days ?? 0,
        message: result.message ?? null,
        isLoading: false,
        isOfflineGrace: false,
      };

      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ...newState, cachedAt: new Date().toISOString() })
      );

      setLicense(newState);
    } catch {
      // Tidak ada koneksi internet -> gunakan cache dengan grace period
      applyOfflineCache();
    }
  }

  function applyOfflineCache() {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      setLicense((prev) => ({ ...prev, isLoading: false, status: "expired" }));
      return;
    }

    try {
      const cached = JSON.parse(raw);
      const cachedAt = new Date(cached.cachedAt);
      const graceDeadline = new Date(cachedAt.getTime() + OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000);
      const now = new Date();

      if (now > graceDeadline || cached.status === "expired" || cached.status === "disabled") {
        setLicense({ ...cached, status: "expired", isLoading: false, isOfflineGrace: false });
      } else {
        setLicense({ ...cached, isLoading: false, isOfflineGrace: true });
      }
    } catch {
      setLicense((prev) => ({ ...prev, isLoading: false, status: "expired" }));
    }
  }

  if (license.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Memeriksa lisensi...</p>
      </div>
    );
  }

  if (license.status === "expired" || license.status === "disabled") {
    return <LicenseExpiredScreen message={license.message} />;
  }

  return (
    <>
      {license.status === "trial" && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800">
          Trial Remaining: {license.remaining_days} Hari
          {license.isOfflineGrace && " (mode offline)"}
        </div>
      )}
      {children}
    </>
  );
}

function LicenseExpiredScreen({ message }: { message: string | null }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-3">Lisensi Tidak Aktif</h1>
        <p className="text-sm text-gray-600 mb-6">
          {message ?? "Trial 30 hari Anda telah berakhir. Silakan hubungi kami untuk aktivasi Lisensi Permanen."}
        </p>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-left text-sm space-y-1">
          <p>
            <span className="text-gray-500">Email:</span> nadinevindro@gmail.com
          </p>
          <p>
            <span className="text-gray-500">WhatsApp:</span> 081384325809
          </p>
        </div>
        <a
          href="/license"
          className="mt-6 inline-block w-full py-2.5 rounded-lg bg-teal-600 text-white font-medium"
        >
          Masukkan Activation Key
        </a>
      </div>
    </div>
  );
}
