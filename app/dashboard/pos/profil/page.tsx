"use client";

// =====================================================================
// app/dashboard/pos/profil/page.tsx
// Profil kasir: lihat identitas sendiri, ganti password, logout.
// =====================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LicenseGuard from "@/components/LicenseGuard";
import CashierBottomNav from "@/components/CashierBottomNav";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentAdmin, type CurrentAdmin } from "@/lib/posHelpers";

export default function ProfilKasirPage() {
  return (
    <LicenseGuard>
      <ProfilContent />
    </LicenseGuard>
  );
}

function ProfilContent() {
  const router = useRouter();
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const currentAdmin = await getCurrentAdmin();
    if (!currentAdmin) {
      router.push("/login");
      return;
    }
    setAdmin(currentAdmin);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    setLoginEmail(session?.user?.email ?? "");

    setLoading(false);
  }

  async function handleUpdatePassword() {
    if (newPassword.length < 6) {
      setMsg({ type: "err", text: "Password minimal 6 karakter." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ type: "err", text: "Konfirmasi password tidak cocok." });
      return;
    }

    setSaving(true);
    setMsg(null);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setSaving(false);

    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }

    setMsg({ type: "ok", text: "Password berhasil diubah." });
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading || !admin) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 bg-gray-950">Memuat...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-20">
      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Profil Saya</h1>
          <p className="text-sm text-gray-500">Akun kasir</p>
        </div>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <Row label="Nama" value={admin.full_name} />
          <Row label="Role" value={admin.role === "admin" ? "Admin" : "Kasir"} />
          <Row label="Email Login" value={loginEmail} />
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-medium text-gray-300">Ganti Password</h2>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Password Baru</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="minimal 6 karakter"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Konfirmasi Password Baru</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
            />
          </div>

          {msg && (
            <p className={`text-xs ${msg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>{msg.text}</p>
          )}

          <button
            onClick={handleUpdatePassword}
            disabled={saving}
            className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {saving ? "Menyimpan..." : "Simpan Password Baru"}
          </button>
        </section>

        <button
          onClick={handleLogout}
          className="w-full bg-gray-900 border border-red-900 text-red-400 text-sm font-medium py-2.5 rounded-lg"
        >
          Keluar
        </button>
      </div>

      <CashierBottomNav />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

