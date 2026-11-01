import { type Jenis, type Lokal, type Piringan, lokalDi, piringanDi } from "./astro";
import dataDaerah from "./data/daerah.json";

/* ---------- daerah ---------- */
export type Daerah = (typeof dataDaerah.daerah)[number];
export const DAERAH: readonly Daerah[] = dataDaerah.daerah;
export const INDEKS = new Map(DAERAH.map((d, i) => [d.id, i]));
export const daerahDariId = (id: string) => DAERAH[INDEKS.get(id) ?? -1];

const WITA = new Set([
  "Bali",
  "Nusa Tenggara Barat",
  "Nusa Tenggara Timur",
  "Kalimantan Selatan",
  "Kalimantan Timur",
  "Kalimantan Utara",
  "Sulawesi Utara",
  "Gorontalo",
  "Sulawesi Tengah",
  "Sulawesi Barat",
  "Sulawesi Selatan",
  "Sulawesi Tenggara",
]);
const WIT = new Set(["Maluku", "Maluku Utara", "Papua", "Papua Barat", "Papua Barat Daya", "Papua Tengah", "Papua Pegunungan", "Papua Selatan"]);

/** Selisih jam dari UTC menurut provinsi (pembagian zona sekarang, juga untuk tanggal lampau). */
export const zona = (d: Daerah) => (WIT.has(d.prov) ? 9 : WITA.has(d.prov) ? 8 : 7);
export const namaZona = (z: number) => (z === 9 ? "WIT" : z === 8 ? "WITA" : "WIB");

/* ---------- data peta (dihitung oleh data/skrip/daftar.mjs) ---------- */
export type { Jenis, Lokal, Piringan };
export { luasTertutup } from "./astro";
export const NAMA_JENIS = ["tidak terlihat", "sebagian", "cincin", "total"] as const;
export type GerhanaGlobal = { t: string; jenis: string; lat: number | null; lon: number | null; v: number[] };
export type DataGerhana = { rentang: [number, number]; daerah: string[]; gerhana: GerhanaGlobal[] };

export type Kode = { jenis: Jenis; tertutup: number; puncakTerbenam: boolean };

/** Membuka satu angka dari skrip data: jenis × 10000 + ketertutupan terbesar yang terlihat (per seribu), +100000 bila puncak di bawah ufuk. */
export function buka(n: number): Kode {
  const puncakTerbenam = n >= 100000;
  const sisa = n % 100000;
  return { jenis: Math.floor(sisa / 10000) as Jenis, tertutup: (sisa % 10000) / 1000, puncakTerbenam };
}

export type Ringkasan = {
  g: GerhanaGlobal;
  tanggal: Date;
  jumlah: [number, number, number, number];
  maks: number;
  /** Provinsi yang dilalui jalur total atau cincin, urut menurut jumlah daerah. */
  provJalur: string[];
};

export function ringkas(g: GerhanaGlobal): Ringkasan {
  const jumlah: [number, number, number, number] = [0, 0, 0, 0];
  let maks = 0;
  const prov = new Map<string, number>();
  g.v.forEach((n, i) => {
    const k = buka(n);
    jumlah[k.jenis]++;
    if (k.jenis) maks = Math.max(maks, k.tertutup);
    if (k.jenis >= 2) prov.set(DAERAH[i].prov, (prov.get(DAERAH[i].prov) ?? 0) + 1);
  });
  return {
    g,
    tanggal: new Date(g.t),
    jumlah,
    maks,
    provJalur: [...prov].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p),
  };
}

/** Jenis gerhana terbesar yang singgah di Indonesia (total > cincin > sebagian). */
export const jenisTerbesar = (r: Ringkasan): Jenis => (r.jumlah[3] ? 3 : r.jumlah[2] ? 2 : 1);

/* ---------- keadaan lokal ---------- */
/** Keadaan gerhana di satu daerah untuk gerhana global yang puncaknya pada `t`. */
export const lokal = (d: Daerah, t: Date): Lokal | null => lokalDi(d.titik[1], d.titik[0], t);
/** Posisi tampak Matahari dan Bulan dari daerah itu pada waktu `t`. */
export const piringan = (d: Daerah, t: Date): Piringan => piringanDi(d.titik[1], d.titik[0], t);

/**
 * Hasil totalTerlama untuk gerhana total berikutnya (dicek ulang di gerhana.test.ts). Mencari ulang semua daerah
 * yang dilintasi totalitas memakan sekitar setengah detik di HP, jadi selama gerhana itu belum lewat, gambar
 * pembuka cukup menghitung daerah ini.
 */
export const PEMBUKA = { tanggal: "2042-04-20", daerah: "kab-sambas" };

/** Daerah dengan totalitas terlama pada sebuah gerhana; `calon` membatasi pencarian ke satu daerah. */
export function totalTerlama(r: Ringkasan, calon?: string): { d: Daerah; l: Lokal; lama: number } | null {
  const iCalon = calon ? INDEKS.get(calon) : undefined;
  let paling: { d: Daerah; l: Lokal; lama: number } | null = null;
  r.g.v.forEach((n, i) => {
    if ((iCalon != null && i !== iCalon) || buka(n).jenis !== 3) return;
    const l = lokal(DAERAH[i], r.tanggal);
    if (!l?.totalMulai || !l.totalSelesai) return;
    const lama = l.totalSelesai.ut.getTime() - l.totalMulai.ut.getTime();
    if (!paling || lama > paling.lama) paling = { d: DAERAH[i], l, lama };
  });
  return paling;
}

/* ---------- teks ---------- */
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const geser = (t: Date, z: number) => new Date(t.getTime() + z * 3_600_000);

/** Tanggal di zona `z` (jam dari UTC). */
export function teksTanggal(t: Date, z = 7, pendek = false): string {
  const g = geser(t, z);
  return `${g.getUTCDate()} ${(pendek ? BULAN_PENDEK : BULAN)[g.getUTCMonth()]} ${g.getUTCFullYear()}`;
}
export function teksJam(t: Date, z: number): string {
  const g = geser(new Date(Math.round(t.getTime() / 60_000) * 60_000), z);
  return `${String(g.getUTCHours()).padStart(2, "0")}.${String(g.getUTCMinutes()).padStart(2, "0")}`;
}
export function teksDurasi(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} detik`;
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)} jam ${m % 60} menit`;
  return s % 60 ? `${m} menit ${s % 60} detik` : `${m} menit`;
}
export const persen = (x: number) => (x >= 0.9995 ? "100%" : x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

/* ---------- cari ---------- */
export const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(kabupaten|kab\.?|kota)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function cariDaerah(q: string, batas = 8): Daerah[] {
  const k = normal(q);
  if (!k) return [];
  const nilai = (d: Daerah) => {
    const n = normal(d.nama);
    return n === k ? 0 : n.startsWith(k) ? 1 : n.includes(k) ? 2 : normal(d.prov).includes(k) ? 3 : 9;
  };
  return DAERAH.map((d) => [d, nilai(d)] as const)
    .filter(([, v]) => v < 9)
    .sort((a, b) => a[1] - b[1] || a[0].nama.localeCompare(b[0].nama))
    .slice(0, batas)
    .map(([d]) => d);
}
