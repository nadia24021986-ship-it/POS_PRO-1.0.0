"use client";

// =====================================================================
// components/CashierBottomNav.tsx
// Navigasi bawah untuk kasir: Kasir | Riwayat | Profil
// =====================================================================

import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { label: "Kasir", href: "/dashboard/pos", icon: "🛒" },
  { label: "Riwayat", href: "/dashboard/pos/riwayat", icon: "🧾" },
  { label: "Profil", href: "/dashboard/pos/profil", icon: "👤" },
];

export default function CashierBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-14 bg-gray-900 border-t border-gray-800 flex z-40">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <button
            key={tab.href}
            onClick={() => router.push(tab.href)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] leading-none ${
              active ? "text-teal-400" : "text-gray-500"
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

