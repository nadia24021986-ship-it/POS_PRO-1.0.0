"use client";

import { useRouter } from "next/navigation";
import StoreRegistrationWizard from "@/components/StoreRegistrationWizard";

export default function RegisterPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-10">
      <StoreRegistrationWizard
        onComplete={() => {
          setTimeout(() => router.push("/dashboard"), 1500);
        }}
      />
    </main>
  );
}
