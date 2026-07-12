"use client";

// =====================================================================
// app/dashboard/products/page.tsx
// Halaman CRUD produk. Data 100% dari Supabase, tidak ada dummy data.
// Hanya bisa diakses oleh admin/owner, kasir ditolak.
// =====================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LicenseGuard from "@/components/LicenseGuard";
import ProductForm, { type Product, type Category } from "@/components/ProductForm";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentAdmin } from "@/lib/posHelpers";

export default function ProductsPage() {
  return (
    <LicenseGuard>
      <ProductsContent />
    </LicenseGuard>
  );
}

function ProductsContent() {
  const router = useRouter();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<(Product & { category_name?: string })[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    init();
  }, []);

  async function init() {
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
    await Promise.all([loadProducts(), loadCategories()]);
    setLoading(false);
  }

  async function loadProducts() {
    const { data } = await supabase
      .from("products")
      .select("*, product_categories(name)")
      .order("created_at", { ascending: false });

    if (data) {
      setProducts(
        data.map((p: any) => ({
          ...p,
          category_name: p.product_categories?.name,
        }))
      );
    }
  }

  async function loadCategories() {
    const { data } = await supabase.from("product_categories").select("id, name").order("name");
    if (data) setCategories(data);
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim() || !storeId) return;

    const { error } = await supabase
      .from("product_categories")
      .insert({ store_id: storeId, name: newCategoryName.trim() });

    if (!error) {
      setNewCategoryName("");
      loadCategories();
    }
  }

  async function handleDelete(product: Product) {
    if (!confirm(`Hapus produk "${product.name}"?`)) return;

    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (!error) loadProducts();
  }

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search)
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Memuat...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-24">
      <div className="p-4 sticky top-0 bg-gray-950 border-b border-gray-800 z-10">
        <h1 className="text-lg font-semibold mb-3">Manajemen Produk</h1>
        <input
          type="text"
          placeholder="Cari nama, SKU, atau barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-800 rounded-lg px-3 py-2 border border-gray-700 text-sm"
        />
      </div>

      <div className="p-4">
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Kategori baru..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="flex-1 bg-gray-800 rounded-lg px-3 py-2 border border-gray-700 text-sm"
          />
          <button
            onClick={handleAddCategory}
            className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm"
          >
            + Kategori
          </button>
        </div>

        {filteredProducts.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-10">
            {products.length === 0 ? "Belum ada produk. Tambahkan produk pertama Anda." : "Tidak ditemukan."}
          </p>
        )}

        <div className="space-y-2">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="flex items-center gap-3 bg-gray-900 rounded-xl p-3 border border-gray-800"
            >
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_url} alt={product.name} className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center text-gray-600 text-xs">
                  No Img
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{product.name}</p>
                <p className="text-xs text-gray-500">
                  {product.category_name ?? "Tanpa kategori"} · Stok: {product.stock_qty} {product.unit}
                </p>
                <p className="text-sm text-teal-400 font-medium">
                  Rp {product.price.toLocaleString("id-ID")}
                </p>
              </div>

              {!product.is_active && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">
                  Nonaktif
                </span>
              )}

              <div className="flex flex-col gap-1">
                <button
                  onClick={() => {
                    setEditingProduct(product);
                    setShowForm(true);
                  }}
                  className="text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(product)}
                  className="text-xs px-2 py-1 rounded bg-red-950 border border-red-800 text-red-300"
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => {
          setEditingProduct(null);
          setShowForm(true);
        }}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-teal-600 text-white text-2xl shadow-lg flex items-center justify-center"
      >
        +
      </button>

      {showForm && storeId && (
        <ProductForm
          storeId={storeId}
          categories={categories}
          existing={editingProduct}
          onClose={() => setShowForm(false)}
          onSaved={loadProducts}
        />
      )}
    </div>
  );
}
