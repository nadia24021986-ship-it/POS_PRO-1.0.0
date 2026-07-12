"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LicenseGuard from "@/components/LicenseGuard";
import { getCurrentAdmin } from "@/lib/posHelpers";
import { supabase } from "@/lib/supabaseClient";

interface Cashier {
  id: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export default function StaffPage() {
  return (
    <LicenseGuard>
      <StaffContent />
    </LicenseGuard>
  );
}

function StaffContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const currentAdmin = await getCurrentAdmin();
    if (!currentAdmin) {
      router.push("/login");
      return;
    }
    if (currentAdmin.role === "cashier") {
      router.push("/dashboard/pos");
      return;
    }

    await loadCashiers();
    setLoading(false);
  }

  async function getToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function loadCashiers() {
    const token = await getToken();
    if (!token) return;

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/list-cashiers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
    });

    if (response.ok) {
      const result = await response.json();
      setCashiers(result.cashiers ?? []);
    }
  }

  async function handleCreate() {
    setError(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setError("Semua field wajib diisi.");
      return;
    }

    setSubmitting(true);
    const token = await getToken();
    if (!token) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-cashier`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), password }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Gagal menambah kasir.");

      setFullName("");
      setEmail("");
      setPassword("");
      setShowForm(false);
      await loadCashiers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(cashier: Cashier) {
    if (!confirm(`Hapus akun kasir "${cashier.full_name}"? Akun ini tidak bisa login lagi setelah dihapus.`)) return;

    const token = await getToken();
    if (!token) return;

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-cashier`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ cashier_id: cashier.id }),
    });

    if (response.ok) {
      loadCashiers();
    } else {
      const result = await response.json();
      alert(result.error ?? "Gagal menghapus kasir.");
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Memuat...</div>;
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-100">Kelola Kasir</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-sm font-medium"
          >
            {showForm ? "Batal" : "+ Tambah"}
          </button>
        </div>

        {showForm && (
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            {error && (
              <div className="p-2.5 rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">
                {error}
              </div>
            )}
            <input
              type="text"
              placeholder="Nama kasir"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm"
            />
            <input
              type="email"
              placeholder="Email kasir"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm"
            />
            <input
              type="password"
              placeholder="Password (min. 8 karakter)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm"
            />
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {submitting ? "Menyimpan..." : "Simpan Kasir"}
            </button>
          </section>
        )}

        <section className="space-y-2">
          {cashiers.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Belum ada kasir. Tambahkan kasir pertama.</p>
          ) : (
            cashiers.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-3"
              >
                <div>
                  <p className="text-gray-100 font-medium text-sm">{c.full_name}</p>
                  <p className="text-xs text-gray-500">
                    Ditambahkan {new Date(c.created_at).toLocaleDateString("id-ID")}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(c)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-950 border border-red-800 text-red-300"
                >
                  Hapus
                </button>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
                                   }
