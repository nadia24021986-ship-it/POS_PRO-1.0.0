import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-100 px-4">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold mb-2">Smart POS Pro</h1>
        <p className="text-gray-400 text-sm mb-8">Sistem kasir cloud untuk bisnis Anda</p>

        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full py-3 rounded-lg bg-teal-600 font-medium"
          >
            Masuk
          </Link>
          <Link
            href="/register"
            className="block w-full py-3 rounded-lg bg-gray-800 border border-gray-700 font-medium"
          >
            Daftar Toko Baru (Trial 30 Hari)
          </Link>
        </div>
      </div>
    </main>
  );
}
