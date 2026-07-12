"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.session) {
      setLoading(false);
      setError("Email atau password salah.");
      return;
    }

    const { data: adminData } = await supabase
      .from("store_admins")
      .select("role")
      .eq("auth_user_id", data.session.user.id)
      .maybeSingle();

    setLoading(false);

    if (adminData?.role === "cashier") {
      router.push("/dashboard/pos");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h1 className="text-xl font-semibold text-gray-100 mb-4">Masuk</h1>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100"
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="mt-5 w-full py-2.5 rounded-lg bg-teal-600 text-white font-medium disabled:opacity-50"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </div>
    </main>
  );
}
