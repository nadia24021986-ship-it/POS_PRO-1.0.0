"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type LicenseType = "1_month" | "6_month" | "1_year" | "permanent";

interface StoreRow {
  id: string;
  store_name: string;
  owner_name: string;
  phone: string;
  email: string;
  registered_at: string;
  license_status: string;
  expires_at: string | null;
  remaining_days: number | null;
}

interface KeyRow {
  key_code: string;
  status: string;
  license_type: string;
  bound_store_id: string | null;
  used_at: string | null;
  created_at: string;
}

const licenseLabels: Record<LicenseType, string> = {
  "1_month": "1 Bulan",
  "6_month": "6 Bulan",
  "1_year": "1 Tahun",
  permanent: "Permanent",
};

export default function MasterPanelPage() {
  const [checking, setChecking] = useState(true);
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setChecking(false);
      return;
    }

    const authorized = await verifyMaster(session.access_token);
    setIsMaster(authorized);
    setChecking(false);
  }

  async function verifyMaster(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/master-overview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </main>
    );
  }

  if (!isMaster) {
    return <MasterLogin onSuccess={() => setIsMaster(true)} />;
  }

  return <MasterDashboard />;
}

function MasterLogin({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.session) {
      setError("Email atau password salah.");
      setLoading(false);
      return;
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/master-overview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
      }
    );

    setLoading(false);

    if (!response.ok) {
      await supabase.auth.signOut();
      setError("Akses ditolak.");
      return;
    }

    onSuccess();
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h1 className="text-lg font-semibold text-gray-100 mb-4">Master Access</h1>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100"
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="mt-4 w-full py-2.5 rounded-lg bg-gray-700 text-white font-medium disabled:opacity-50"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </div>
    </main>
  );
}

function MasterDashboard() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [licenseType, setLicenseType] = useState<LicenseType>("1_month");
  const [generating, setGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOverview();
  }, []);

  async function getToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function loadOverview() {
    setLoading(true);
    const token = await getToken();
    if (!token) return;

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/master-overview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
      }
    );

    if (response.ok) {
      const result = await response.json();
      setStores(result.stores ?? []);
      setKeys(result.keys ?? []);
    }
    setLoading(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setLastGenerated(null);

    const token = await getToken();
    if (!token) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-license-key`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ license_type: licenseType }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Gagal generate kode.");

      setLastGenerated(result.key_code);
      loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold text-gray-100">Master Panel</h1>

        {/* Generate Key */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">Generate Activation Key</h2>

          {error && (
            <div className="mb-3 p-2.5 rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">
              {error}
            </div>
          )}

          {lastGenerated && (
            <div className="mb-3 p-3 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-between">
              <span className="text-emerald-300 font-mono text-sm tracking-wider">{lastGenerated}</span>
              <button
                onClick={() => copyToClipboard(lastGenerated)}
                className="text-xs text-emerald-400 underline"
              >
                Salin
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <select
              value={licenseType}
              onChange={(e) => setLicenseType(e.target.value as LicenseType)}
              className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm"
            >
              <option value="1_month">1 Bulan</option>
              <option value="6_month">6 Bulan</option>
              <option value="1_year">1 Tahun</option>
              <option value="permanent">Permanent</option>
            </select>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {generating ? "..." : "Generate"}
            </button>
          </div>
        </section>

        {/* Daftar Toko */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">
            Toko Terdaftar {!loading && `(${stores.length})`}
          </h2>

          {loading ? (
            <p className="text-sm text-gray-500">Memuat...</p>
          ) : stores.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada toko terdaftar.</p>
          ) : (
            <div className="space-y-2">
              {stores.map((s) => (
                <div key={s.id} className="p-3 rounded-lg bg-gray-800 border border-gray-700">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-gray-100 font-medium text-sm">{s.store_name}</p>
                      <p className="text-xs text-gray-500">{s.owner_name} · {s.phone}</p>
                    </div>
                    <StatusBadge status={s.license_status} remainingDays={s.remaining_days} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Riwayat Kode */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">Riwayat Kode Terbaru</h2>

          {loading ? (
            <p className="text-sm text-gray-500">Memuat...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada kode dibuat.</p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k.key_code}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800 border border-gray-700"
                >
                  <div>
                    <p className="text-gray-100 font-mono text-xs">{k.key_code}</p>
                    <p className="text-xs text-gray-500">
                      {licenseLabels[k.license_type as LicenseType] ?? k.license_type}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      k.status === "unused"
                        ? "bg-blue-950 text-blue-300"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {k.status === "unused" ? "Belum dipakai" : "Terpakai"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status, remainingDays }: { status: string; remainingDays: number | null }) {
  const config: Record<string, { label: string; className: string }> = {
    trial: { label: `Trial (${remainingDays ?? 0}h)`, className: "bg-amber-950 text-amber-300" },
    active: { label: "Aktif", className: "bg-emerald-950 text-emerald-300" },
    permanent: { label: "Permanent", className: "bg-emerald-950 text-emerald-300" },
    expired: { label: "Expired", className: "bg-red-950 text-red-300" },
    unknown: { label: "Tidak diketahui", className: "bg-gray-700 text-gray-400" },
  };
  const c = config[status] ?? config.unknown;
  return <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${c.className}`}>{c.label}</span>;
}
