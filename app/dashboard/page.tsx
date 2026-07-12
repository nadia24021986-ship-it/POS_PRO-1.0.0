"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LicenseGuard from "@/components/LicenseGuard";
import { getCurrentAdmin, type CurrentAdmin } from "@/lib/posHelpers";
import { supabase } from "@/lib/supabaseClient";

export default function DashboardPage() {
  return (
    <LicenseGuard>
      <DashboardContent />
    </LicenseGuard>
  );
}

function DashboardContent() {
  const router = useRouter();
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(true);

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

    const { data: store } = await supabase
      .from("store_information")
      .select("store_name")
      .eq("id", currentAdmin.store_id)
      .maybeSingle();

    if (store) setStoreName(store.store_name);
    setLoading(false);
  }

  const menuItems = [
    {
      title: "Kasir",
      description: "Mulai transaksi penjualan",
      href: "/dashboard/pos",
      icon: "🛒",
    },
    {
      title: "Produk",
      description: "Kelola produk & kategori",
      href: "/dashboard/products",
      icon: "📦",
    },
  ];

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Memuat...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-semibold text-gray-100 mb-1">
          {storeName || "Dashboard"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">Pilih menu untuk melanjutkan</p>

        <div className="grid grid-cols-2 gap-3">
          {menuItems.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left hover:border-teal-600 transition-colors"
            >
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="text-gray-100 font-medium">{item.title}</div>
              <div className="text-xs text-gray-500 mt-1">{item.description}</div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
          }
