"use client";

// =====================================================================
// app/dashboard/pos/page.tsx
// Halaman kasir: pilih produk -> keranjang -> checkout -> struk.
// Semua transaksi tersimpan real-time ke Supabase, stok otomatis berkurang.
// =====================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LicenseGuard from "@/components/LicenseGuard";
import ReceiptModal from "@/components/ReceiptModal";
import CashierBottomNav from "@/components/CashierBottomNav";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentAdmin, getCurrentDeviceRecordId, type CurrentAdmin } from "@/lib/posHelpers";

interface ProductRow {
  id: string;
  name: string;
  price: number;
  stock_qty: number;
  unit: string;
  image_url: string | null;
  barcode: string | null;
}

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  qty: number;
  max_stock: number;
}

type PaymentMethod = "cash" | "qris" | "transfer" | "debit" | "dana" | "gopay" | "ovo" | "shopeepay";

export default function PosPage() {
  return (
    <LicenseGuard>
      <PosContent />
    </LicenseGuard>
  );
}

function PosContent() {
  const router = useRouter();
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [discount, setDiscount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<any | null>(null);
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
      .select("store_name, phone")
      .eq("id", currentAdmin.store_id)
      .maybeSingle();

    if (store) {
      setStoreName(store.store_name);
      setStorePhone(store.phone);
    }

    await loadProducts();
    setLoading(false);
  }

  async function loadProducts() {
    const { data } = await supabase
      .from("products")
      .select("id, name, price, stock_qty, unit, image_url, barcode")
      .eq("is_active", true)
      .order("name");

    if (data) setProducts(data);
  }

  function addToCart(product: ProductRow) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id);
      if (existing) {
        if (existing.qty >= product.stock_qty) return prev;
        return prev.map((c) => (c.product_id === product.id ? { ...c, qty: c.qty + 1 } : c));
      }
      if (product.stock_qty <= 0) return prev;
      return [...prev, { product_id: product.id, name: product.name, price: product.price, qty: 1, max_stock: product.stock_qty }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) =>
          c.product_id === productId
            ? { ...c, qty: Math.min(c.max_stock, Math.max(0, c.qty + delta)) }
            : c
        )
        .filter((c) => c.qty > 0)
    );
  }

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const total = Math.max(0, subtotal - discount);

  async function handleCheckout() {
    if (!admin || cart.length === 0) return;

    setError(null);
    setProcessing(true);

    try {
      const deviceId = await getCurrentDeviceRecordId(admin.store_id);

      const { data: trxNumber, error: numError } = await supabase.rpc("generate_transaction_number", {
        p_store_id: admin.store_id,
      });
      if (numError || !trxNumber) throw new Error("Gagal membuat nomor transaksi.");

      const { data: transaction, error: trxError } = await supabase
        .from("transactions")
        .insert({
          store_id: admin.store_id,
          device_id: deviceId,
          cashier_id: admin.id,
          transaction_number: trxNumber,
          subtotal,
          discount,
          tax: 0,
          total,
          payment_method: paymentMethod,
          payment_status: "paid",
          customer_name: customerName || null,
        })
        .select()
        .single();

      if (trxError || !transaction) throw new Error(`Gagal menyimpan transaksi: ${trxError?.message}`);

      const itemRows = cart.map((c) => ({
        transaction_id: transaction.id,
        product_id: c.product_id,
        product_name: c.name,
        qty: c.qty,
        unit_price: c.price,
        subtotal: c.price * c.qty,
      }));

      const { error: itemsError } = await supabase.from("transaction_items").insert(itemRows);
      if (itemsError) throw new Error(`Gagal menyimpan item: ${itemsError.message}`);

      // Kurangi stok + catat pergerakan stok untuk tiap produk
      for (const item of cart) {
        const product = products.find((p) => p.id === item.product_id);
        if (!product) continue;

        await supabase
          .from("products")
          .update({ stock_qty: product.stock_qty - item.qty, updated_at: new Date().toISOString() })
          .eq("id", item.product_id);

        await supabase.from("stock_movements").insert({
          store_id: admin.store_id,
          product_id: item.product_id,
          change_qty: -item.qty,
          reason: "sale",
          reference_id: transaction.id,
          performed_by: admin.id,
        });
      }

      setReceipt({
        transaction_number: trxNumber,
        store_name: storeName,
        store_phone: storePhone,
        items: itemRows,
        subtotal,
        discount,
        tax: 0,
        total,
        payment_method: paymentMethod,
        customer_name: customerName,
        created_at: transaction.created_at,
      });

      setCart([]);
      setCustomerName("");
      setDiscount(0);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat checkout.");
    } finally {
      setProcessing(false);
    }
  }

  const filteredProducts = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search)
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Memuat...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <input
          type="text"
          placeholder="Cari produk atau scan barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-800 rounded-lg px-3 py-2 border border-gray-700 text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2 pb-[22rem]">
        {filteredProducts.map((product) => (
          <button
            key={product.id}
            onClick={() => addToCart(product)}
            disabled={product.stock_qty <= 0}
            className="bg-gray-900 rounded-xl p-3 border border-gray-800 text-left disabled:opacity-40"
          >
            <p className="font-medium text-sm truncate">{product.name}</p>
            <p className="text-teal-400 text-sm">Rp {product.price.toLocaleString("id-ID")}</p>
            <p className="text-xs text-gray-500">Stok: {product.stock_qty}</p>
          </button>
        ))}
      </div>

      {/* Cart drawer - digeser ke atas sejauh tinggi bottom nav (h-14 = 56px) */}
      <div className="fixed bottom-14 left-0 right-0 bg-gray-900 border-t border-gray-800 rounded-t-2xl max-h-[52vh] overflow-y-auto z-30">
        <div className="p-4">
          <p className="font-semibold mb-2">Keranjang ({cart.length})</p>

          {error && (
            <div className="mb-3 p-2 rounded-lg bg-red-950 border border-red-800 text-xs text-red-300">
              {error}
            </div>
          )}

          {cart.length === 0 ? (
            <p className="text-gray-500 text-sm">Belum ada produk dipilih.</p>
          ) : (
            <div className="space-y-2 mb-3">
              {cart.map((item) => (
                <div key={item.product_id} className="flex items-center justify-between text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      Rp {item.price.toLocaleString("id-ID")} x {item.qty}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQty(item.product_id, -1)}
                      className="w-6 h-6 rounded bg-gray-800 border border-gray-700"
                    >
                      -
                    </button>
                    <span className="w-6 text-center">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.product_id, 1)}
                      className="w-6 h-6 rounded bg-gray-800 border border-gray-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Nama customer (opsional)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="bg-gray-800 rounded-lg px-3 py-2 border border-gray-700 text-xs"
                />
                <input
                  type="number"
                  placeholder="Diskon (Rp)"
                  value={discount || ""}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  className="bg-gray-800 rounded-lg px-3 py-2 border border-gray-700 text-xs"
                />
              </div>

              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 border border-gray-700 text-sm mb-3"
              >
                <option value="cash">Tunai</option>
                <option value="qris">QRIS</option>
                <option value="transfer">Transfer Bank</option>
                <option value="debit">Kartu Debit</option>
                <option value="dana">DANA</option>
                <option value="gopay">GoPay</option>
                <option value="ovo">OVO</option>
                <option value="shopeepay">ShopeePay</option>
              </select>

              <div className="flex justify-between text-sm mb-3">
                <span className="text-gray-400">Total</span>
                <span className="font-bold text-lg text-teal-400">Rp {total.toLocaleString("id-ID")}</span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={processing}
                className="w-full py-3 rounded-lg bg-teal-600 text-white font-medium disabled:opacity-50"
              >
                {processing ? "Memproses..." : "Bayar"}
              </button>
            </>
          )}
        </div>
      </div>

      {receipt && <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />}

      <CashierBottomNav />
    </div>
  );
}
