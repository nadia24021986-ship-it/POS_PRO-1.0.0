"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LicenseGuard from "@/components/LicenseGuard";
import { getCurrentAdmin, type CurrentAdmin } from "@/lib/posHelpers";
import { supabase } from "@/lib/supabaseClient";

interface TopProduct {
  product_name: string;
  total_qty: number;
}

interface LowStockProduct {
  id: string;
  name: string;
  stock_qty: number;
  unit: string;
}

interface DailySales {
  date: string;
  total: number;
}

const LOW_STOCK_THRESHOLD = 5;

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

  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);
  const [monthProfit, setMonthProfit] = useState(0);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [dailySales, setDailySales] = useState<DailySales[]>([]);

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

    await Promise.all([
      loadSalesSummary(currentAdmin.store_id),
      loadTopProducts(currentAdmin.store_id),
      loadLowStock(currentAdmin.store_id),
      loadDailySales(currentAdmin.store_id),
    ]);

    setLoading(false);
  }

  function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function startOfWeek(d: Date) {
    const x = startOfDay(d);
    const day = x.getDay();
    x.setDate(x.getDate() - day);
    return x;
  }

  function startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  async function loadSalesSummary(storeId: string) {
    const now = new Date();
    const monthStart = startOfMonth(now);

    const { data: monthTx } = await supabase
      .from("transactions")
      .select("id, total, created_at")
      .eq("store_id", storeId)
      .gte("created_at", monthStart.toISOString());

    if (!monthTx) return;

    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);

    let today = 0;
    let week = 0;
    let month = 0;

    for (const tx of monthTx) {
      const txDate = new Date(tx.created_at);
      month += tx.total ?? 0;
      if (txDate >= weekStart) week += tx.total ?? 0;
      if (txDate >= todayStart) today += tx.total ?? 0;
    }

    setTodayTotal(today);
    setWeekTotal(week);
    setMonthTotal(month);

    // Laba kotor bulan ini: total penjualan - total modal (qty * cost_price)
    const txIds = monthTx.map((t) => t.id);
    if (txIds.length === 0) {
      setMonthProfit(0);
      return;
    }

    const { data: items } = await supabase
      .from("transaction_items")
      .select("product_id, qty, subtotal")
      .in("transaction_id", txIds);

    if (!items || items.length === 0) {
      setMonthProfit(month);
      return;
    }

    const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
    const { data: productsData } = await supabase
      .from("products")
      .select("id, cost_price")
      .in("id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"]);

    const costMap = new Map<string, number>();
    for (const p of productsData ?? []) {
      costMap.set(p.id, p.cost_price ?? 0);
    }

    let totalCost = 0;
    let totalRevenue = 0;
    for (const item of items) {
      totalRevenue += item.subtotal ?? 0;
      const cost = costMap.get(item.product_id) ?? 0;
      totalCost += cost * (item.qty ?? 0);
    }

    setMonthProfit(totalRevenue - totalCost);
  }

  async function loadTopProducts(storeId: string) {
    const monthStart = startOfMonth(new Date());

    const { data: monthTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("store_id", storeId)
      .gte("created_at", monthStart.toISOString());

    const txIds = (monthTx ?? []).map((t) => t.id);
    if (txIds.length === 0) {
      setTopProducts([]);
      return;
    }

    const { data: items } = await supabase
      .from("transaction_items")
      .select("product_name, qty")
      .in("transaction_id", txIds);

    const grouped = new Map<string, number>();
    for (const item of items ?? []) {
      const key = item.product_name ?? "Tanpa nama";
      grouped.set(key, (grouped.get(key) ?? 0) + (item.qty ?? 0));
    }

    const sorted = [...grouped.entries()]
      .map(([product_name, total_qty]) => ({ product_name, total_qty }))
      .sort((a, b) => b.total_qty - a.total_qty)
      .slice(0, 5);

    setTopProducts(sorted);
  }

  async function loadLowStock(storeId: string) {
    const { data } = await supabase
      .from("products")
      .select("id, name, stock_qty, unit")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .lte("stock_qty", LOW_STOCK_THRESHOLD)
      .order("stock_qty", { ascending: true })
      .limit(10);

    setLowStock(data ?? []);
  }

  async function loadDailySales(storeId: string) {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("transactions")
      .select("total, created_at")
      .eq("store_id", storeId)
      .gte("created_at", sevenDaysAgo.toISOString());

    const days: DailySales[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      days.push({ date: dateKey, total: 0 });
    }

    for (const tx of data ?? []) {
      const dateKey = new Date(tx.created_at).toISOString().slice(0, 10);
      const dayEntry = days.find((d) => d.date === dateKey);
      if (dayEntry) dayEntry.total += tx.total ?? 0;
    }

    setDailySales(days);
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  }

  function formatDayLabel(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", { weekday: "short" });
  }

  const menuItems = [
    { title: "Kasir", description: "Mulai transaksi penjualan", href: "/dashboard/pos", icon: "🛒" },
    { title: "Produk", description: "Kelola produk & kategori", href: "/dashboard/products", icon: "📦" },
  ];

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Memuat...</p>
      </main>
    );
  }

  const maxDaily = Math.max(...dailySales.map((d) => d.total), 1);

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-md mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">{storeName || "Dashboard"}</h1>
          <p className="text-sm text-gray-500">Ringkasan penjualan</p>
        </div>

        {/* Ringkasan Omzet */}
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard label="Omzet Hari Ini" value={formatCurrency(todayTotal)} />
          <SummaryCard label="Omzet Minggu Ini" value={formatCurrency(weekTotal)} />
          <SummaryCard label="Omzet Bulan Ini" value={formatCurrency(monthTotal)} />
          <SummaryCard label="Laba Kotor Bulan Ini" value={formatCurrency(monthProfit)} accent />
        </div>

        {/* Grafik 7 Hari */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">Penjualan 7 Hari Terakhir</h2>
          <div className="flex items-end justify-between gap-2 h-28">
            {dailySales.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-teal-600 rounded-t"
                  style={{ height: `${Math.max((d.total / maxDaily) * 100, 4)}%` }}
                />
                <span className="text-[10px] text-gray-500">{formatDayLabel(d.date)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Produk Terlaris */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">Produk Terlaris Bulan Ini</h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada penjualan bulan ini.</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.product_name} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">
                    {i + 1}. {p.product_name}
                  </span>
                  <span className="text-gray-500">{p.total_qty} terjual</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Stok Hampir Habis */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">
            Stok Hampir Habis <span className="text-xs text-gray-600">(≤ {LOW_STOCK_THRESHOLD})</span>
          </h2>
          {lowStock.length === 0 ? (
            <p className="text-sm text-gray-500">Semua stok aman.</p>
          ) : (
            <div className="space-y-2">
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{p.name}</span>
                  <span className="text-amber-400">
                    {p.stock_qty} {p.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Menu */}
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

function SummaryCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 border ${accent ? "bg-teal-950 border-teal-800" : "bg-gray-900 border-gray-800"}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-sm font-semibold ${accent ? "text-teal-300" : "text-gray-100"}`}>{value}</p>
    </div>
  );
        }
