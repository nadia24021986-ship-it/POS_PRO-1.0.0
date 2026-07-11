// =====================================================================
// lib/deviceFingerprint.ts
// Menghasilkan & menyimpan Device ID unik per instalasi.
//
// CATATAN JUJUR: karena app ini berjalan sebagai PWA/TWA (bukan native
// shell), tidak ada akses ke hardware serial number sungguhan. Pendekatan
// industri standar untuk PWA/TWA adalah: generate UUID sekali, simpan
// permanen di localStorage, lalu perkuat dengan beberapa sinyal entropi
// (user agent, screen, timezone) supaya reset localStorage tidak trivial
// menghasilkan "device baru" tanpa jejak. Deteksi penyalahgunaan multi-
// device sebaiknya dilakukan di server (lihat activation_logs + jumlah
// device per store).
// =====================================================================

const STORAGE_KEY = "spp_device_id";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback untuk environment lama
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getEntropySignature(): string {
  if (typeof window === "undefined") return "server";
  const parts = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  return parts.join("|");
}

/**
 * Mengembalikan Device ID yang persisten untuk instalasi ini.
 * Dibuat sekali dan disimpan permanen di localStorage.
 */
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") {
    throw new Error("getDeviceFingerprint() hanya bisa dipanggil di client-side");
  }

  let deviceId = localStorage.getItem(STORAGE_KEY);

  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem(STORAGE_KEY, deviceId);
  }

  return deviceId;
}

/**
 * Sinyal tambahan yang dikirim ke server saat aktivasi pertama,
 * disimpan sebagai device_label agar Master bisa mengenali perangkat
 * secara manusiawi (mis. "Samsung A15 - Chrome 126").
 */
export function getDeviceLabel(): string {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const browserMatch = ua.match(/(Chrome|Firefox|Safari)\/[\d.]+/);
  const browser = browserMatch ? browserMatch[0] : "Browser";
  return `${isAndroid ? "Android" : "Web"} - ${browser}`;
}

export function getPlatform(): "web" | "android_apk" {
  if (typeof window === "undefined") return "web";
  // Trusted Web Activity (hasil PWABuilder) menambahkan referrer khas
  // 'android-app://' pada document.referrer saat dibuka dari APK terinstal.
  const isTWA = document.referrer.startsWith("android-app://");
  return isTWA ? "android_apk" : "web";
}

