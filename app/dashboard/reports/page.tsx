"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LicenseGuard from "@/components/LicenseGuard";
import { getCurrentAdmin } from "@/lib/posHelpers";
import { supabase } from "@/lib/supabaseClient";

interface CashierSummary {
  cashier_id: string;
  full_name: string;
  total_omzet: number;
  total_transaksi: number;
}

interface TransactionRow {
  id: string;
  transaction_number: string;
  total: number;
  payment_method: string;
  customer_name: string | null;
  created_at: string;
}

type Period = "today" | "week" | "month";

export default function ReportsPage() {
  return (
    <LicenseGuard>
      <ReportsContent />
    </LicenseGuard>
  );
}

function ReportsContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("today");
  const [summary, setSummary] = useState<CashierSummary[]>([]);
  const [selectedCashier, setSelectedCashier] = useState<CashierSummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (storeId) loadSummary(storeId, period);
  }, [period, storeId]);

  async function init() {
    try {
      const currentAdmin = await getCurrentAdmin();
      if (!currentAdmin) {
        router.push("/login");
        return;
      }
      if (currentAdmin.role === "cashier") {
        router.push("/dashboard/pos");
        return;
      }
      setStoreId(currentAdmin.store_id);
      await loadSummary(currentAdmin.store_id, "today");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  function getPeriodStart(p: Period): Date {
    const now = new Date();
    if (p === "today") {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (p === "week") {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay());
      return d;
    }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  async function loadSummary(sId: string, p: Period) {
    setErrorMsg(null);
    const start = getPeriodStart(p);

    try {
      const { data: cashiers, error: cashierError } = await supabase
        .from("store_admins")
        .select("id, full_name")
        .eq("store_id", sId)
        .in("role", ["admin", "cashier"]);

      if (cashierError) throw new Error(cashierError.message);

      const { data: txs, error: txError } = await supabase
        .from("transactions")
        .select("cashier_id, total")
        .eq("store_id", sId)
        .gte("created_at", start.toISOString());

      if (txError) throw new Error(txError.message);

      const grouped = new Map<string, { total: number; count: number }>();
      for (const tx of txs ?? []) {
        if (!tx.cashier_id) continue;
        const current = grouped.get(tx.cashier_id) ?? { total: 0, count: 0 };
        current.total += tx.total ?? 0;
        current.count += 1;
        grouped.set(tx.cashier_id, current);
      }

      const result: CashierSummary[] = (cashiers ?? []).map((c) => ({
        cashier_id: c.id,
        full_name: c.full_name,
        total_omzet: grouped.get(c.id)?.total ?? 0,
        total_transaksi: grouped.get(c.id)?.count ?? 0,
      }));

      result.sort((a, b) => b.total_omzet - a.total_omzet);
      setSummary(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memuat laporan.");
    }
  }

  async function openCashierDetail(cashier: CashierSummary) {
    setSelectedCashier(cashier);
    setLoadingDetail(true);

    const start = getPeriodStart(period);

    const { data } = await supabase
      .from("transactions")
      .select("id, transaction_number, total, payment_method, customer_name, created_at")
      .eq("cashier_id", cashier.cashier_id)
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false });

    setTransactions(data ?? []);
    setLoadingDetail(false);
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  }

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  }

  const periodLabels: Record<Period, string> = {
    today: "Hari Ini",
    week: "Minggu Ini",
    month: "Bulan Ini",
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 bg-gray-950">Memuat...</div>;
  }

  // Detail view
  if (selectedCashier) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-6">
        <div className="max-w-md mx-auto space-y-4">
          <button
            onClick={() => setSelectedCashier(null)}
            className="text-sm text-teal-400"
          >
            ← Kembali
          </button>

          <div>
            <h1 className="text-lg font-semibold text-gray-100">{selectedCashier.full_name}</h1>
            <p className="text-sm text-gray-500">
              {periodLabels[period]} · {formatCurrency(selectedCashier.total_omzet)} · {selectedCashier.total_transaksi} transaksi
            </p>
          </div>

          {loadingDetail ? (
            <p className="text-sm text-gray-500">Memuat transaksi...</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Belum ada transaksi pada periode ini.</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-300 font-medium">{tx.transaction_number}</span>
                    <span className="text-sm text-teal-400 font-semibold">{formatCurrency(tx.total)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{tx.customer_name || "Tanpa nama"} · {tx.payment_method}</span>
                    <span>{formatDateTime(tx.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  // Summary view
  return (
    <main className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-lg font-semibold text-gray-100">Laporan Kasir</h1>

        <div className="flex gap-2">
          {(["today", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                period === p
                  ? "bg-teal-600 border-teal-600 text-white"
                  : "bg-gray-900 border-gray-800 text-gray-400"
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">{errorMsg}</div>
        )}

        {summary.length === 0 && !errorMsg ? (
          <p className="text-sm text-gray-500 text-center py-8">Belum ada data kasir.</p>
        ) : (
          <div className="space-y-2">
            {summary.map((c) => (
              <button
                key={c.cashier_id}
                onClick={() => openCashierDetail(c)}
                className="w-full flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-4 text-left hover:border-teal-600 transition-colors"
              >
                <div>
                  <p className="text-gray-100 font-medium text-sm">{c.full_name}</p>
                  <p className="text-xs text-gray-500">{c.total_transaksi} transaksi</p>
                </div>
                <span className="text-teal-400 font-semibold text-sm">{formatCurrency(c.total_omzet)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
        }
