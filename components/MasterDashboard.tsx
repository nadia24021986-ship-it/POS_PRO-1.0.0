"use client";

// =====================================================================
// MasterDashboard.tsx
// Halaman rahasia, taruh di route yang TIDAK ditautkan di navigasi mana
// pun (mis. app/x9-control/page.tsx). Hanya bisa diakses oleh auth user
// yang terdaftar di tabel master_accounts.
// =====================================================================

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface StoreOverview {
  store_id: string;
  store_name: string;
  owner_name: string;
  phone: string;
  email: string;
  license_id: string | null;
  license_status: "trial" | "permanent" | "expired" | "disabled" | null;
  expires_at: string | null;
  device_label: string | null;
  platform: string | null;
  last_seen_at: string | null;
}

export default function MasterDashboard() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [stores, setStores] = useState<StoreOverview[]>([]);
  const [activeTab, setActiveTab] = useState<"stores" | "generate">("stores");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Generate key form state
  const [keyType, setKeyType] = useState<"trial" | "permanent">("permanent");
  const [maxDevices, setMaxDevices] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  useEffect(() => {
    checkMasterAccess();
  }, []);

  async function checkMasterAccess() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setAuthChecked(true);
      return;
    }

    const { data } = await supabase
      .from("master_accounts")
      .select("id")
      .eq("auth_user_id", session.user.id)
      .eq("is_active", true)
      .maybeSingle();

    setIsMaster(!!data);
    setAuthChecked(true);

    if (data) {
      loadStores();
    }
  }

  async function loadStores() {
    setLoading(true);
    const { data, error } = await supabase
      .from("v_store_license_overview")
      .select("*")
      .order("store_created_at", { ascending: false });

    if (!error && data) {
      setStores(data as StoreOverview[]);
    }
    setLoading(false);
  }

  async function handleGenerateKey() {
    setActionError(null);
    setGeneratedKey(null);

    const expiresAt =
      expiresInDays && Number(expiresInDays) > 0
        ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const { data, error } = await supabase.rpc("generate_activation_key", {
      p_license_type: keyType,
      p_max_devices: maxDevices,
      p_expires_at: expiresAt,
      p_store_id: null,
    });

    if (error) {
      setActionError(error.message);
      return;
    }

    setGeneratedKey(data as string);
  }

  async function handleDisableLicense(store: StoreOverview) {
    if (!store.license_id) return;
    const { error } = await supabase
      .from("licenses")
      .update({ status: "disabled", updated_at: new Date().toISOString() })
      .eq("id", store.license_id);

    if (error) {
      setActionError(error.message);
      return;
    }

    await supabase.from("activation_logs").insert({
      store_id: store.store_id,
      license_id: store.license_id,
      action: "disabled",
      performed_by: "master",
      notes: "Disabled manually via Master Dashboard",
    });

    loadStores();
  }

  async function handleExtendTrial(store: StoreOverview, days: number) {
    if (!store.license_id || !store.expires_at) return;

    const currentExpiry = new Date(store.expires_at);
    const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);

    const { error } = await supabase
      .from("licenses")
      .update({ expires_at: newExpiry.toISOString(), status: "trial", updated_at: new Date().toISOString() })
      .eq("id", store.license_id);

    if (error) {
      setActionError(error.message);
      return;
    }

    await supabase.from("activation_logs").insert({
      store_id: store.store_id,
      license_id: store.license_id,
      action: "trial_extended",
      performed_by: "master",
      notes: `Extended by ${days} days`,
    });

    loadStores();
  }

  async function handleConvertToPermanent(store: StoreOverview) {
    if (!store.license_id) return;

    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 100);

    const { error } = await supabase
      .from("licenses")
      .update({ status: "permanent", expires_at: farFuture.toISOString(), updated_at: new Date().toISOString() })
      .eq("id", store.license_id);

    if (error) {
      setActionError(error.message);
      return;
    }

    await supabase.from("activation_logs").insert({
      store_id: store.store_id,
      license_id: store.license_id,
      action: "converted_to_permanent",
      performed_by: "master",
      notes: "Converted manually via Master Dashboard",
    });

    loadStores();
  }

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  }

  if (!isMaster) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">404 — Page not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4">
      <h1 className="text-lg font-semibold mb-4">Master Control Panel</h1>

      <div className="flex gap-2 mb-4">
        <TabButton active={activeTab === "stores"} onClick={() => setActiveTab("stores")}>
          Semua Toko ({stores.length})
        </TabButton>
        <TabButton active={activeTab === "generate"} onClick={() => setActiveTab("generate")}>
          Generate Key
        </TabButton>
      </div>

      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">
          {actionError}
        </div>
      )}

      {activeTab === "generate" && (
        <div className="max-w-sm bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tipe Lisensi</label>
              <select
                value={keyType}
                onChange={(e) => setKeyType(e.target.value as "trial" | "permanent")}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 border border-gray-700"
              >
                <option value="permanent">Permanent</option>
                <option value="trial">Trial</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Devices</label>
              <input
                type="number"
                min={1}
                value={maxDevices}
                onChange={(e) => setMaxDevices(Number(e.target.value))}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 border border-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Berlaku (hari, kosongkan = tanpa batas)</label>
              <input
                type="number"
                min={1}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 border border-gray-700"
              />
            </div>
          </div>

          <button
            onClick={handleGenerateKey}
            className="mt-4 w-full py-2.5 rounded-lg bg-teal-600 font-medium"
          >
            Generate Activation Key
          </button>

          {generatedKey && (
            <div className="mt-4 p-3 rounded-lg bg-teal-950 border border-teal-800 text-center">
              <p className="text-xs text-gray-400 mb-1">Activation Key Baru:</p>
              <p className="text-lg font-mono font-bold text-teal-300">{generatedKey}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "stores" && (
        <div className="space-y-3">
          {loading && <p className="text-gray-500 text-sm">Memuat...</p>}
          {!loading && stores.length === 0 && (
            <p className="text-gray-500 text-sm">Belum ada toko terdaftar.</p>
          )}
          {stores.map((store) => (
            <div key={store.store_id} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium">{store.store_name}</p>
                  <p className="text-xs text-gray-500">{store.owner_name} · {store.phone}</p>
                </div>
                <StatusBadge status={store.license_status} />
              </div>

              <p className="text-xs text-gray-500 mb-3">
                {store.device_label ?? "Belum ada device"} ·{" "}
                {store.expires_at ? `Exp: ${new Date(store.expires_at).toLocaleDateString("id-ID")}` : "-"}
              </p>

              <div className="flex flex-wrap gap-2">
                <ActionButton onClick={() => handleConvertToPermanent(store)}>Jadikan Permanent</ActionButton>
                <ActionButton onClick={() => handleExtendTrial(store, 30)}>+30 Hari Trial</ActionButton>
                <ActionButton danger onClick={() => handleDisableLicense(store)}>Disable</ActionButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
        active ? "bg-teal-600 text-white" : "bg-gray-800 text-gray-400"
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  onClick,
  danger = false,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
        danger ? "bg-red-950 text-red-300 border border-red-800" : "bg-gray-800 text-gray-200 border border-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: StoreOverview["license_status"] }) {
  const colors: Record<string, string> = {
    trial: "bg-amber-950 text-amber-300 border-amber-800",
    permanent: "bg-emerald-950 text-emerald-300 border-emerald-800",
    expired: "bg-red-950 text-red-300 border-red-800",
    disabled: "bg-gray-800 text-gray-400 border-gray-700",
  };
  const label = status ?? "no license";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[status ?? "disabled"]}`}>
      {label}
    </span>
  );
}

