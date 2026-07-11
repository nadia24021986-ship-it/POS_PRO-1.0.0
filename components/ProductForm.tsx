"use client";

// =====================================================================
// components/ProductForm.tsx
// Modal form untuk tambah/edit produk, termasuk upload foto ke
// Supabase Storage bucket 'product-images'.
// =====================================================================

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost_price: number;
  stock_qty: number;
  unit: string;
  image_url: string | null;
  is_active: boolean;
}

interface ProductFormProps {
  storeId: string;
  categories: Category[];
  existing?: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ProductForm({ storeId, categories, existing, onClose, onSaved }: ProductFormProps) {
  const [name, setName] = useState(existing?.name ?? "");
  const [categoryId, setCategoryId] = useState(existing?.category_id ?? "");
  const [sku, setSku] = useState(existing?.sku ?? "");
  const [barcode, setBarcode] = useState(existing?.barcode ?? "");
  const [price, setPrice] = useState(existing?.price?.toString() ?? "");
  const [costPrice, setCostPrice] = useState(existing?.cost_price?.toString() ?? "");
  const [stockQty, setStockQty] = useState(existing?.stock_qty?.toString() ?? "0");
  const [unit, setUnit] = useState(existing?.unit ?? "pcs");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(existing?.image_url ?? null);
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setError(null);

    if (!name.trim()) {
      setError("Nama produk wajib diisi.");
      return;
    }
    if (!price || Number(price) < 0) {
      setError("Harga jual tidak valid.");
      return;
    }

    setSaving(true);

    try {
      let imageUrl = existing?.image_url ?? null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `${storeId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(path, imageFile, { upsert: true });

        if (uploadError) throw new Error(`Gagal upload gambar: ${uploadError.message}`);

        const { data: publicUrlData } = supabase.storage.from("product-images").getPublicUrl(path);
        imageUrl = publicUrlData.publicUrl;
      }

      const payload = {
        store_id: storeId,
        category_id: categoryId || null,
        name: name.trim(),
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        price: Number(price),
        cost_price: Number(costPrice) || 0,
        stock_qty: Number(stockQty) || 0,
        unit: unit.trim() || "pcs",
        image_url: imageUrl,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error: updateError } = await supabase.from("products").update(payload).eq("id", existing.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await supabase.from("products").insert(payload);
        if (insertError) throw new Error(insertError.message);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan produk.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-800 w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">
          {existing ? "Edit Produk" : "Tambah Produk"}
        </h2>

        {error && (
          <div className="mb-3 p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Foto Produk</label>
            {imagePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="Preview" className="w-20 h-20 rounded-lg object-cover mb-2" />
            )}
            <input type="file" accept="image/*" onChange={handleImageChange} className="text-sm text-gray-400" />
          </div>

          <Field label="Nama Produk" value={name} onChange={setName} />

          <div>
            <label className="block text-sm text-gray-400 mb-1">Kategori</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 border border-gray-700 text-gray-100"
            >
              <option value="">Tanpa Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU" value={sku} onChange={setSku} required={false} />
            <Field label="Barcode" value={barcode} onChange={setBarcode} required={false} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Harga Jual" value={price} onChange={setPrice} type="number" />
            <Field label="Harga Modal" value={costPrice} onChange={setCostPrice} type="number" required={false} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stok" value={stockQty} onChange={setStockQty} type="number" />
            <Field label="Satuan" value={unit} onChange={setUnit} />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Produk Aktif (tampil di kasir)
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 text-gray-300 font-medium border border-gray-700"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-teal-600 text-white font-medium disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
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
      <label className="block text-sm text-gray-400 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 rounded-lg px-3 py-2 border border-gray-700 text-gray-100"
      />
    </div>
  );
}

