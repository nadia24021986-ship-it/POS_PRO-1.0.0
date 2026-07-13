"use client";

// =====================================================================
// app/dashboard/pos/riwayat/page.tsx
// Riwayat transaksi milik kasir yang sedang login + rekap omzet
// harian/mingguan/bulanan + cetak ulang struk.
// =====================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LicenseGuard from "@/components/LicenseGuard";
import ReceiptModal from "@/components/ReceiptModal";
import CashierBottomNav from "@/components/CashierBottomNav";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentAdmin, type CurrentAdmin } from "@/lib/posHelpers";

interface TransactionRow {
  id: string;
  transaction_number: string;
  total: number;
  payment_method: string;
  customer_name: string | null;
  created_at: string;
}

type FilterRange = "today" | "week" | "month";

export default function RiwayatPage() {
  return (
    <LicenseGuard>
      <RiwayatContent />
    </LicenseGuard>
  );
}

function RiwayatContent() {
  const router = useRouter();
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [loading, setLoading] = useState(true);

  const [todayTotal, setTodayTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [weekCount, setWeekCount] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);
  const [monthCount, setMonthCount] = useState(0);

  const [filter, setFilter] = useState<FilterRange>("today");
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [receipt, setReceipt] = useState<any | null>(null);
  const [printLoadingId, setPrintLoadingId] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (admin) loadTransactions(filter);
  }, [filter, admin]);

  function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function startOfWeek(d: Date) {
    const x = startOfDay(d);
    x.setDate(x.getDate() - x.getDay());
    return x;
  }
  function startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  async function init() {
    const currentAdmin = await getCurrentAdmin();
    if (!currentAdmin) {
      router.push("/login");
      return;
    }
    setAdmin(currentAdmin);

    const { data: store } = await supabase
      .from("store_information")
      .select("store_name, phone")
      .eq("id", currentAdmin.store_id)
      .maybeSingle();

    if (store) {
      setStoreName(store.store_name);
      setStorePhone(store.phone);
    }

    await loadSummary(currentAdmin);
    setLoading(false);
  }

  async function loadSummary(currentAdmin: CurrentAdmin) {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const weekStart = startOfWeek(now);
    const todayStart = startOfDay(now);

    const { data } = await supabase
      .from("transactions")
      .select("total, created_at")
      .eq("store_id", currentAdmin.store_id)
      .eq("cashier_id", currentAdmin.id)
      .gte("created_at", monthStart.toISOString());

    let tTotal = 0, tCount = 0, wTotal = 0, wCount = 0, mTotal = 0, mCount = 0;

    for (const tx of data ?? []) {
      const d = new Date(tx.created_at);
      mTotal += tx.total ?? 0;
      mCount += 1;
      if (d >= weekStart) {
        wTotal += tx.total ?? 0;
        wCount += 1;
      }
      if (d >= todayStart) {
        tTotal += tx.total ?? 0;
        tCount += 1;
      }
    }

    setTodayTotal(tTotal);
    setTodayCount(tCount);
    setWeekTotal(wTotal);
    setWeekCount(wCount);
    setMonthTotal(mTotal);
    setMonthCount(mCount);
  }

  async function loadTransactions(range: FilterRange) {
    if (!admin) return;
    setListLoading(true);

    const now = new Date();
    let start: Date;
    if (range === "today") start = startOfDay(now);
    else if (range === "week") start = startOfWeek(now);
    else start = startOfMonth(now);

    const { data } = await supabase
      .from("transactions")
      .select("id, transaction_number, total, payment_method, customer_name, created_at")
      .eq("store_id", admin.store_id)
      .eq("cashier_id", admin.id)
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    setTransactions(data ?? []);
    setListLoading(false);
  }

  async function handleReprint(trxId: string) {
    setPrintLoadingId(trxId);

    const { data: trx } = await supabase
      .from("transactions")
      .select("transaction_number, subtotal, discount, tax, total, payment_method, customer_name, created_at")
      .eq("id", trxId)
      .maybeSingle();

    const { data: items } = await supabase
      .from("transaction_items")
      .select("product_name, qty, unit_price, subtotal")
      .eq("transaction_id", trxId);

    setPrintLoadingId(null);

    if (!trx) return;

    setReceipt({
      transaction_number: trx.transaction_number,
      store_name: storeName,
      store_phone: storePhone,
      items: items ?? [],
      subtotal: trx.subtotal,
      discount: trx.discount,
      tax: trx.tax,
      total: trx.total,
      payment_method: trx.payment_method,
      customer_name: trx.customer_name,
      created_at: trx.created_at,
    });
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  }

  const paymentLabels: Record<string, string> = {
    cash: "Tunai",
    qris: "QRIS",
    transfer: "Transfer",
    debit: "Debit",
    dana: "DANA",
    gopay: "GoPay",
    ovo: "OVO",
    shopeepay: "ShopeePay",
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 bg-gray-950">Memuat...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-20">
      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Riwayat Transaksi</h1>
          <p className="text-sm text-gray-500">Transaksi yang Anda buat</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SummaryCard label="Hari Ini" value={formatCurrency(todayTotal)} count={todayCount} />
          <SummaryCard label="Minggu Ini" value={formatCurrency(weekTotal)} count={weekCount} />
          <SummaryCard label="Bulan Ini" value={formatCurrency(monthTotal)} count={monthCount} accent />
        </div>

        <div className="flex gap-2">
          {(["today", "week", "month"] as FilterRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border ${
                filter === r
                  ? "bg-teal-600 border-teal-600 text-white"
                  : "bg-gray-900 border-gray-800 text-gray-400"
              }`}
            >
              {r === "today" ? "Hari Ini" : r === "week" ? "Minggu Ini" : "Bulan Ini"}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {listLoading ? (
            <p className="text-sm text-gray-500 text-center py-6">Memuat transaksi...</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">Belum ada transaksi pada periode ini.</p>
          ) : (
            transactions.map((trx) => (
              <div
                key={trx.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{trx.transaction_number}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(trx.created_at).toLocaleString("id-ID")} · {paymentLabels[trx.payment_method] ?? trx.payment_method}
                    {trx.customer_name ? ` · ${trx.customer_name}` : ""}
                  </p>
                  <p className="text-sm text-teal-400 font-semibold mt-0.5">{formatCurrency(trx.total)}</p>
                </div>
                <button
                  onClick={() => handleReprint(trx.id)}
                  disabled={printLoadingId === trx.id}
                  className="shrink-0 ml-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200 disabled:opacity-50"
                >
                  {printLoadingId === trx.id ? "..." : "Cetak"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {receipt && <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />}

      <CashierBottomNav />
    </div>
  );
}

function SummaryCard({ label, value, count, accent = false }: { label: string; value: string; count: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-2.5 border ${accent ? "bg-teal-950 border-teal-800" : "bg-gray-900 border-gray-800"}`}>
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      <p className={`text-xs font-semibold ${accent ? "text-teal-300" : "text-gray-100"}`}>{value}</p>
      <p className="text-[10px] text-gray-600 mt-0.5">{count} transaksi</p>
    </div>
  );
}
