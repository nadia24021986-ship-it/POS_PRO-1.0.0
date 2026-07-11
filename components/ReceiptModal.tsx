"use client";

// =====================================================================
// components/ReceiptModal.tsx
// Menampilkan struk setelah transaksi berhasil. Cetak masih pakai
// browser print dialog untuk sekarang (akan diganti ESC/POS native
// printer di Fase 5).
// =====================================================================

interface ReceiptItem {
  product_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

interface ReceiptData {
  transaction_number: string;
  store_name: string;
  store_phone: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: string;
  customer_name?: string;
  created_at: string;
}

export default function ReceiptModal({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  const waMessage = buildWhatsAppMessage(data);
  const waLink = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white text-gray-900 rounded-xl w-full max-w-xs p-5 font-mono text-sm">
        <div id="receipt-print-area">
          <div className="text-center mb-3">
            <p className="font-bold">{data.store_name}</p>
            {data.store_phone && <p className="text-xs">{data.store_phone}</p>}
          </div>

          <div className="border-t border-dashed border-gray-400 my-2" />

          <p className="text-xs">No: {data.transaction_number}</p>
          <p className="text-xs">{new Date(data.created_at).toLocaleString("id-ID")}</p>
          {data.customer_name && <p className="text-xs">Customer: {data.customer_name}</p>}

          <div className="border-t border-dashed border-gray-400 my-2" />

          {data.items.map((item, idx) => (
            <div key={idx} className="mb-1">
              <p>{item.product_name}</p>
              <div className="flex justify-between text-xs">
                <span>
                  {item.qty} x {item.unit_price.toLocaleString("id-ID")}
                </span>
                <span>{item.subtotal.toLocaleString("id-ID")}</span>
              </div>
            </div>
          ))}

          <div className="border-t border-dashed border-gray-400 my-2" />

          <div className="flex justify-between text-xs">
            <span>Subtotal</span>
            <span>{data.subtotal.toLocaleString("id-ID")}</span>
          </div>
          {data.discount > 0 && (
            <div className="flex justify-between text-xs">
              <span>Diskon</span>
              <span>-{data.discount.toLocaleString("id-ID")}</span>
            </div>
          )}
          {data.tax > 0 && (
            <div className="flex justify-between text-xs">
              <span>Pajak</span>
              <span>{data.tax.toLocaleString("id-ID")}</span>
            </div>
          )}
          <div className="flex justify-between font-bold mt-1">
            <span>TOTAL</span>
            <span>Rp {data.total.toLocaleString("id-ID")}</span>
          </div>
          <p className="text-xs mt-1">Bayar: {data.payment_method.toUpperCase()}</p>

          <div className="border-t border-dashed border-gray-400 my-2" />
          <p className="text-center text-xs">Terima kasih!</p>
        </div>

        <div className="flex gap-2 mt-4 print:hidden">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-center text-xs font-medium"
          >
            WhatsApp
          </a>
          <button
            onClick={() => window.print()}
            className="flex-1 py-2 rounded-lg bg-gray-800 text-white text-xs font-medium"
          >
            Cetak
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-teal-600 text-white text-xs font-medium"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}

function buildWhatsAppMessage(data: ReceiptData): string {
  const lines = [
    `*${data.store_name}*`,
    `No: ${data.transaction_number}`,
    `Tanggal: ${new Date(data.created_at).toLocaleString("id-ID")}`,
    "",
    ...data.items.map(
      (item) => `${item.product_name} (${item.qty}x) - Rp ${item.subtotal.toLocaleString("id-ID")}`
    ),
    "",
    `Total: Rp ${data.total.toLocaleString("id-ID")}`,
    `Bayar: ${data.payment_method.toUpperCase()}`,
    "",
    "Terima kasih telah berbelanja!",
  ];
  return lines.join("\n");
}

