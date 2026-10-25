// Perhitungan gerhana untuk satu titik. Dipakai halaman dan skrip data (Node menjalankan berkas ini langsung),
// jadi berkas ini hanya boleh memakai sintaks TypeScript yang bisa dihapus begitu saja.
import * as A from "astronomy-engine";

export type Jenis = 0 | 1 | 2 | 3;
export type Fase = { ut: Date; tinggi: number };
export type Lokal = {
  jenis: Jenis;
  /** Ketertutupan saat puncak, terlihat atau tidak. */
  tertutup: number;
  mulai: Fase;
  puncak: Fase;
  selesai: Fase;
  totalMulai?: Fase;
  totalSelesai?: Fase;
  /** Saat ketertutupan terbesar yang bisa dilihat: puncak, atau saat Matahari terbenam/terbit bila puncaknya di bawah ufuk. */
  terlihat: { ut: Date; tertutup: number; sebab: "puncak" | "terbenam" | "terbit" };
};

const fase = (e: A.EclipseEvent): Fase => ({ ut: e.time.date, tinggi: e.altitude });

/** Keadaan gerhana di satu titik untuk gerhana global yang puncaknya pada `t`; null bila tidak terlihat. */
export function lokalDi(lintang: number, bujur: number, t: Date): Lokal | null {
  const o = new A.Observer(lintang, bujur, 0);
  const puncak = A.MakeTime(t);
  const l = A.SearchLocalSolarEclipse(puncak.AddDays(-1), o);
  if (Math.abs(l.peak.time.ut - puncak.ut) > 0.5) return null;
  const jenis: Jenis = l.kind === A.EclipseKind.Total ? 3 : l.kind === A.EclipseKind.Annular ? 2 : 1;
  // Fase total/cincin yang seluruhnya di bawah ufuk tidak bisa dilihat; bagi pengamat itu gerhana sebagian.
  const adaFaseUtama = l.total_begin && l.total_end && (l.total_begin.altitude > 0 || l.total_end.altitude > 0);
  let terlihat: Lokal["terlihat"] = { ut: l.peak.time.date, tertutup: l.obscuration, sebab: "puncak" };
  if (l.peak.altitude <= 0) {
    const terbenam = l.partial_begin.altitude > 0;
    const saat = A.SearchRiseSet(A.Body.Sun, o, terbenam ? -1 : +1, l.partial_begin.time, 1);
    if (saat) terlihat = { ut: saat.date, tertutup: luasTertutup(piringanDi(lintang, bujur, saat.date)), sebab: terbenam ? "terbenam" : "terbit" };
  }
  return {
    jenis: jenis > 1 && !adaFaseUtama ? 1 : jenis,
    tertutup: l.obscuration,
    mulai: fase(l.partial_begin),
    puncak: fase(l.peak),
    selesai: fase(l.partial_end),
    totalMulai: l.total_begin && fase(l.total_begin),
    totalSelesai: l.total_end && fase(l.total_end),
    terlihat,
  };
}

/* ---------- piringan Matahari dan Bulan ---------- */
const R_MATAHARI = 695_700;
const R_BULAN = 1_737.4;
const RAD = Math.PI / 180;

export type Piringan = {
  /** Tinggi (dengan refraksi) dan azimut Matahari, derajat. */
  tinggi: number;
  azimut: number;
  /** Jari-jari tampak, derajat. */
  rMatahari: number;
  rBulan: number;
  /** Letak Bulan terhadap Matahari, derajat: x ke kanan (azimut naik), y ke atas (menuju zenit). */
  dx: number;
  dy: number;
};

/** Posisi tampak Matahari dan Bulan bagi pengamat di titik itu pada waktu `t`. */
export function piringanDi(lintang: number, bujur: number, t: Date): Piringan {
  const o = new A.Observer(lintang, bujur, 0);
  const waktu = A.MakeTime(t);
  const posisi = (b: A.Body) => {
    const eq = A.Equator(b, waktu, o, true, true);
    return { eq, hor: A.Horizon(waktu, o, eq.ra, eq.dec, "normal") };
  };
  const m = posisi(A.Body.Sun);
  const b = posisi(A.Body.Moon);
  let daz = b.hor.azimuth - m.hor.azimuth;
  if (daz > 180) daz -= 360;
  if (daz < -180) daz += 360;
  return {
    tinggi: m.hor.altitude,
    azimut: m.hor.azimuth,
    rMatahari: Math.asin(R_MATAHARI / (m.eq.dist * A.KM_PER_AU)) / RAD,
    rBulan: Math.asin(R_BULAN / (b.eq.dist * A.KM_PER_AU)) / RAD,
    dx: daz * Math.cos(m.hor.altitude * RAD),
    dy: b.hor.altitude - m.hor.altitude,
  };
}

/** Bagian luas piringan Matahari yang tertutup piringan Bulan (0–1). */
export function luasTertutup(p: Pick<Piringan, "rMatahari" | "rBulan" | "dx" | "dy">): number {
  const R = p.rMatahari;
  const r = p.rBulan;
  const s = Math.hypot(p.dx, p.dy);
  if (s >= R + r) return 0;
  if (s <= Math.abs(R - r)) return r >= R ? 1 : (r * r) / (R * R);
  const a = r * r * Math.acos((s * s + r * r - R * R) / (2 * s * r));
  const b = R * R * Math.acos((s * s + R * R - r * r) / (2 * s * R));
  const c = 0.5 * Math.sqrt((-s + r + R) * (s + r - R) * (s - r + R) * (s + r + R));
  return (a + b - c) / (Math.PI * R * R);
}
