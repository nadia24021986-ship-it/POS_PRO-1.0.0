"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import LicenseGuard from "@/components/LicenseGuard";
import { getCurrentAdmin, type CurrentAdmin } from "@/lib/posHelpers";
import { supabase } from "@/lib/supabaseClient";

interface StoreInfo {
  id: string;
  store_name: string;
  owner_name: string;
  phone: string;
  address: string;
  email: string;
  logo_url: string | null;
}

export default function SettingsPage() {
  return (
    <LicenseGuard>
      <SettingsContent />
    </LicenseGuard>
  );
}

function SettingsContent() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  // Profil toko
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Akun & keamanan
  const [loginEmail, setLoginEmail] = useState("");
  const [newLoginEmail, setNewLoginEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountMsg, setAccountMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const currentAdmin = await getCurrentAdmin();
    if (!currentAdmin) {
      router.push("/login");
      return;
    }

    if (currentAdmin.role !== "admin") {
      router.push("/dashboard");
      return;
    }

    setAdmin(currentAdmin);

    const { data: storeData } = await supabase
      .from("store_information")
      .select("id, store_name, owner_name, phone, address, email, logo_url")
      .eq("id", currentAdmin.store_id)
      .maybeSingle();

    if (storeData) {
      setStore(storeData);
      setStoreName(storeData.store_name ?? "");
      setOwnerName(storeData.owner_name ?? "");
      setPhone(storeData.phone ?? "");
      setAddress(storeData.address ?? "");
      setContactEmail(storeData.email ?? "");
      setLogoPreview(storeData.logo_url ?? null);
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    setLoginEmail(session?.user?.email ?? "");

    setLoading(false);
  }

  function handlePickLogo() {
    fileInputRef.current?.click();
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileMsg({ type: "err", text: "File harus berupa gambar." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileMsg({ type: "err", text: "Ukuran logo maksimal 2MB." });
      return;
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setProfileMsg(null);
  }

  async function handleSaveProfile() {
    if (!admin || !store) return;

    if (!storeName.trim()) {
      setProfileMsg({ type: "err", text: "Nama toko wajib diisi." });
      return;
    }

    setSavingProfile(true);
    setProfileMsg(null);

    try {
      let logoUrl = store.logo_url;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `${admin.store_id}/logo-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("store-logos")
          .upload(path, logoFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from("store-logos").getPublicUrl(path);
        logoUrl = publicUrlData.publicUrl;
      }

      const { error: updateError } = await supabase
        .from("store_information")
        .update({
          store_name: storeName.trim(),
          owner_name: ownerName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          email: contactEmail.trim(),
          logo_url: logoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", admin.store_id);

      if (updateError) throw updateError;

      setStore({ ...store, store_name: storeName, owner_name: ownerName, phone, address, email: contactEmail, logo_url: logoUrl });
      setLogoFile(null);
      setProfileMsg({ type: "ok", text: "Profil toko berhasil disimpan." });
    } catch (err: any) {
      setProfileMsg({ type: "err", text: err.message ?? "Gagal menyimpan profil toko." });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleUpdateEmail() {
    if (!newLoginEmail.trim()) {
      setAccountMsg({ type: "err", text: "Email baru wajib diisi." });
      return;
    }

    setSavingAccount(true);
    setAccountMsg(null);

    const { error } = await supabase.auth.updateUser({ email: newLoginEmail.trim() });

    setSavingAccount(false);

    if (error) {
      setAccountMsg({ type: "err", text: error.message });
      return;
    }

    setAccountMsg({
      type: "ok",
      text: "Link konfirmasi telah dikirim ke email baru. Email login akan berubah setelah link diklik.",
    });
    setNewLoginEmail("");
  }

  async function handleUpdatePassword() {
    if (newPassword.length < 6) {
      setAccountMsg({ type: "err", text: "Password minimal 6 karakter." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setAccountMsg({ type: "err", text: "Konfirmasi password tidak cocok." });
      return;
    }

    setSavingAccount(true);
    setAccountMsg(null);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setSavingAccount(false);

    if (error) {
      setAccountMsg({ type: "err", text: error.message });
      return;
    }

    setAccountMsg({ type: "ok", text: "Password berhasil diubah." });
    setNewPassword("");
    setConfirmPassword("");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Memuat...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-gray-400 hover:text-gray-200 text-lg"
            aria-label="Kembali"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Pengaturan</h1>
            <p className="text-sm text-gray-500">Profil toko & akun</p>
          </div>
        </div>

        {/* PROFIL TOKO */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-medium text-gray-300">Profil Toko</h2>

          <div className="flex flex-col items-center gap-3">
            <div
              onClick={handlePickLogo}
              className="w-20 h-20 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden cursor-pointer"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Logo toko" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl text-gray-600">🏪</span>
              )}
            </div>
            <button
              onClick={handlePickLogo}
              className="text-xs text-teal-400 hover:text-teal-300"
            >
              Ganti Logo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>

          <Field label="Nama Toko">
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Nama Pemilik">
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="input"
            />
          </Field>

          <Field label="No. HP / WhatsApp">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xxxxxxxxxx"
              className="input"
            />
          </Field>

          <Field label="Alamat">
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="input resize-none"
            />
          </Field>

          <Field label="Email Toko (untuk struk/kwitansi)">
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              type="email"
              className="input"
            />
          </Field>

          {profileMsg && (
            <p className={`text-xs ${profileMsg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>
              {profileMsg.text}
            </p>
          )}

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {savingProfile ? "Menyimpan..." : "Simpan Profil Toko"}
          </button>
        </section>

        {/* AKUN & KEAMANAN */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-medium text-gray-300">Akun & Keamanan</h2>

          <div className="text-xs text-gray-500">
            Email login saat ini: <span className="text-gray-300">{loginEmail}</span>
          </div>

          <Field label="Ganti Email Login">
            <input
              value={newLoginEmail}
              onChange={(e) => setNewLoginEmail(e.target.value)}
              type="email"
              placeholder="email baru"
              className="input"
            />
          </Field>
          <button
            onClick={handleUpdateEmail}
            disabled={savingAccount}
            className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            Simpan Email Baru
          </button>

          <div className="border-t border-gray-800 pt-4 space-y-4">
            <Field label="Password Baru">
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                type="password"
                placeholder="minimal 6 karakter"
                className="input"
              />
            </Field>
            <Field label="Konfirmasi Password Baru">
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                className="input"
              />
            </Field>
            <button
              onClick={handleUpdatePassword}
              disabled={savingAccount}
              className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              Simpan Password Baru
            </button>
          </div>

          {accountMsg && (
            <p className={`text-xs ${accountMsg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>
              {accountMsg.text}
            </p>
          )}
        </section>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          background-color: rgb(17 24 39);
          border: 1px solid rgb(55 65 81);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(243 244 246);
        }
        .input:focus {
          outline: none;
          border-color: rgb(20 184 166);
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

