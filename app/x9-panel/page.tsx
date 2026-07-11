import LicenseGuard from "@/components/LicenseGuard";

export default function DashboardPage() {
  return (
    <LicenseGuard>
      <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Selamat Datang di Smart POS Pro</h1>
          <p className="text-gray-400 text-sm">
            Modul kasir, produk, dan laporan akan tersedia di Fase 4.
          </p>
        </div>
      </main>
    </LicenseGuard>
  );
}
