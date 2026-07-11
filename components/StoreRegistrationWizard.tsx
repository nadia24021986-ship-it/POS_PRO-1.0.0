"use client";

// =====================================================================
// StoreRegistrationWizard.tsx
// Wizard 2 langkah: (1) Data toko + akun admin, (2) Auto-request trial.
// Dipanggil di halaman /register untuk instalasi pertama kali.
// =====================================================================

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { getDeviceFingerprint, getDeviceLabel, getPlatform } from "@/lib/deviceFingerprint";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface FormState {
  store_name: string;
  owner_name: string;
  phone: string;
  address: string;
  email: string;
  password: string;
  confirm_password: string;
}

const initialForm: FormState = {
  store_name: "",
  owner_name: "",
  phone: "",
  address: "",
  email: "",
  password: "",
  confirm_password: "",
};

export default function StoreRegistrationWizard({ onComplete }: { onComplete: (storeId: string) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialInfo, setTrialInfo] = useState<{ remaining_days: number; expires_at: string } | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep1(): string | null {
    if (!form.store_name.trim()) return "Nama toko wajib diisi.";
    if (!form.owner_name.trim()) return "Nama pemilik wajib diisi.";
    if (!form.phone.trim()) return "Nomor telepon wajib diisi.";
    if (!form.email.trim() || !form.email.includes("@")) return "Email tidak valid.";
    if (form.password.length < 8) return "Password minimal 8 karakter.";
    if (form.password !== form.confirm_password) return "Konfirmasi password tidak cocok.";
    return null;
  }

  async function handleSubmit() {
    const validationError = validateStep1();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      // 1. Buat akun auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      if (signUpError || !signUpData.session) {
        throw new Error(signUpError?.message ?? "Gagal membuat akun. Coba lagi.");
      }

      const accessToken = signUpData.session.access_token;

      // 2. Panggil Edge Function register-store
      const deviceFingerprint = getDeviceFingerprint();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-store`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            store_name: form.store_name,
            owner_name: form.owner_name,
            phone: form.phone,
            address: form.address || undefined,
            email: form.email,
            device_fingerprint: deviceFingerprint,
            device_label: getDeviceLabel(),
            platform: getPlatform(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(JSON.stringify(result));
      }

      setTrialInfo(result.license);
      setStep(2);
      onComplete(result.store_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === 2 && trialInfo) {
    return (
      <div className="max-w-md mx-auto p-6 rounded-xl border border-emerald-200 bg-emerald-50">
        <h2 className="text-xl font-semibold text-emerald-800 mb-2">Toko Berhasil Terdaftar</h2>
        <p className="text-sm text-emerald-700 mb-4">
          Akun admin dan trial otomatis telah diaktifkan untuk toko Anda.
        </p>
        <div className="bg-white rounded-lg p-4 border border-emerald-200">
          <p className="text-sm text-gray-500">Trial Remaining</p>
          <p className="text-2xl font-bold text-emerald-700">{trialInfo.remaining_days} Hari</p>
          <p className="text-xs text-gray-400 mt-1">
            Berakhir: {new Date(trialInfo.expires_at).toLocaleDateString("id-ID")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 rounded-xl border border-gray-200">
      <h2 className="text-xl font-semibold mb-4">Registrasi Toko Baru</h2>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <Field label="Nama Toko" value={form.store_name} onChange={(v) => updateField("store_name", v)} />
        <Field label="Nama Pemilik" value={form.owner_name} onChange={(v) => updateField("owner_name", v)} />
        <Field label="No. Telepon / WhatsApp" value={form.phone} onChange={(v) => updateField("phone", v)} />
        <Field label="Alamat" value={form.address} onChange={(v) => updateField("address", v)} required={false} />
        <Field label="Email" type="email" value={form.email} onChange={(v) => updateField("email", v)} />
        <Field label="Password" type="password" value={form.password} onChange={(v) => updateField("password", v)} />
        <Field
          label="Konfirmasi Password"
          type="password"
          value={form.confirm_password}
          onChange={(v) => updateField("confirm_password", v)}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="mt-5 w-full py-2.5 rounded-lg bg-teal-600 text-white font-medium disabled:opacity-50"
      >
        {isSubmitting ? "Mendaftarkan..." : "Daftar & Mulai Trial 30 Hari"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
    </div>
  );
}
