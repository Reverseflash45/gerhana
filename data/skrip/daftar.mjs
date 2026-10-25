// Menghitung keadaan setiap gerhana matahari 1900–2100 di 514 kabupaten/kota.
// Hasil: public/data/gerhana.json. Butuh beberapa menit; dibagi ke beberapa worker.
import * as A from "astronomy-engine";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
// Node 22.18+ menjalankan TypeScript tanpa langkah build; logika ini sama dengan yang dipakai halaman.
import { lokalDi } from "../../src/astro.ts";

const AWAL = 1900;
const AKHIR = 2100;

const daerah = JSON.parse(readFileSync(new URL("../../src/data/daerah.json", import.meta.url), "utf8")).daerah;

/**
 * Satu angka per daerah: 0 bila tidak terlihat, selain itu
 * jenis × 10000 + ketertutupan terbesar yang terlihat (per seribu), ditambah 100000 bila
 * Matahari di bawah ufuk ketika puncak (yang terlihat hanya sampai terbenam atau sejak terbit).
 */
function hitung(g) {
  const puncak = new Date(g.t);
  return daerah.map((d) => {
    const l = lokalDi(d.titik[1], d.titik[0], puncak);
    if (!l) return 0;
    return (l.puncak.tinggi > 0 ? 0 : 100000) + l.jenis * 10000 + Math.round(l.terlihat.tertutup * 1000);
  });
}

if (isMainThread) {
  const semua = [];
  let g = A.SearchGlobalSolarEclipse(A.MakeTime(new Date(Date.UTC(AWAL, 0, 1))));
  while (g.peak.date.getUTCFullYear() <= AKHIR) {
    semua.push({ t: g.peak.date.toISOString(), jenis: g.kind, lat: g.latitude ?? null, lon: g.longitude ?? null });
    g = A.NextGlobalSolarEclipse(g.peak);
  }
  const n = Math.max(1, availableParallelism() - 1);
  console.log(`${semua.length} gerhana global, ${n} worker`);
  const t0 = Date.now();
  const bagian = await Promise.all(
    Array.from({ length: n }, (_, i) => {
      const tugas = semua.filter((_, j) => j % n === i);
      return new Promise((ok, gagal) => {
        const w = new Worker(new URL(import.meta.url), { workerData: tugas });
        w.on("message", ok);
        w.on("error", gagal);
      });
    }),
  );
  const nilai = new Map(bagian.flat().map((h) => [h.t, h.v]));
  const terlihat = semua
    .map((g) => ({ ...g, lat: g.lat === null ? null : +g.lat.toFixed(2), lon: g.lon === null ? null : +g.lon.toFixed(2), v: nilai.get(g.t) }))
    .filter((g) => g.v.some((x) => x > 0));
  writeFileSync(
    new URL("../../public/data/gerhana.json", import.meta.url),
    JSON.stringify({ rentang: [AWAL, AKHIR], daerah: daerah.map((d) => d.id), gerhana: terlihat }),
  );
  console.log(`${terlihat.length} terlihat dari Indonesia, ${((Date.now() - t0) / 1000).toFixed(0)} detik`);
} else {
  parentPort.postMessage(workerData.map((g) => ({ t: g.t, v: hitung(g) })));
}
