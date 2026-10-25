import type { FeatureCollection, Geometry, MultiLineString } from "geojson";
import { geoMercator, geoPath } from "d3-geo";
import { scaleLinear } from "d3-scale";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { DAERAH, INDEKS, NAMA_JENIS, type GerhanaGlobal, type Jenis, type Piringan, buka, luasTertutup, persen, teksTanggal } from "./gerhana";

/* ---------- umum ---------- */
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function buatTip(wadah: HTMLElement) {
  const el = document.createElement("div");
  el.className = "tip";
  el.hidden = true;
  wadah.append(el);
  return {
    tampil(x: number, y: number, html: string) {
      el.innerHTML = html;
      el.hidden = false;
      const w = el.offsetWidth;
      const kiri = x + 14 + w > wadah.clientWidth ? x - 14 - w : x + 14;
      el.style.left = `${Math.max(0, kiri)}px`;
      el.style.top = `${Math.max(0, y - el.offsetHeight - 10)}px`;
    },
    sembunyi() {
      el.hidden = true;
    },
  };
}

/* ---------- kelas warna ---------- */
/** Kelas peta: 0 tidak terlihat, 1–5 sebagian per 20%, 6 cincin, 7 total. */
export function kelas(n: number): number {
  const k = buka(n);
  if (k.jenis === 0) return 0;
  if (k.jenis === 3) return 7;
  if (k.jenis === 2) return 6;
  return Math.min(5, 1 + Math.floor(k.tertutup * 5));
}
export const LEGENDA = [
  [1, "<20%"],
  [2, "20–40%"],
  [3, "40–60%"],
  [4, "60–80%"],
  [5, "≥80%"],
  [6, "cincin"],
  [7, "total"],
] as const;

/* ---------- peta ---------- */
type Prop = { id: string };
export type Peta = { darat: FeatureCollection<Geometry, Prop>; batas: MultiLineString };

export async function muatPeta(): Promise<Peta> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/peta.json`);
  const topo = (await r.json()) as Topology<{ daerah: GeometryCollection<Prop> }>;
  return {
    darat: feature(topo, topo.objects.daerah) as FeatureCollection<Geometry, Prop>,
    batas: mesh(topo, topo.objects.daerah, (a, b) => a !== b) as MultiLineString,
  };
}

export function gambarPeta(wadah: HTMLElement, peta: Peta, g: GerhanaGlobal, terpilih: string, pilih: (id: string) => void): void {
  const lebar = Math.max(300, wadah.clientWidth);
  const tepi = lebar < 560 ? 6 : 12;
  const proyeksi = geoMercator().fitWidth(lebar - 2 * tepi, peta.darat);
  const [[x0, y0], [, y1]] = geoPath(proyeksi).bounds(peta.darat);
  const [tx, ty] = proyeksi.translate();
  proyeksi.translate([tx - x0 + tepi, ty - y0 + tepi]);
  const tinggi = Math.ceil(y1 - y0 + 2 * tepi);
  const jalur = geoPath(proyeksi);
  const nilai = (id: string) => g.v[INDEKS.get(id) ?? -1] ?? 0;
  const pilihan = peta.darat.features.find((f) => f.properties.id === terpilih);
  // Kota kecil hampir tak terlihat di peta nasional, jadi beri titik di pusat wilayahnya.
  const pusat = pilihan ? jalur.centroid(pilihan) : null;
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" width="${lebar}" height="${tinggi}">
    <g>${peta.darat.features.map((f) => `<path class="wilayah k${kelas(nilai(f.properties.id))}" data-id="${f.properties.id}" d="${jalur(f) ?? ""}"/>`).join("")}</g>
    <path class="batas" d="${jalur(peta.batas) ?? ""}"/>
    ${pilihan ? `<path class="terpilih" d="${jalur(pilihan) ?? ""}"/>` : ""}
    ${pusat ? `<circle class="penanda" cx="${pusat[0]}" cy="${pusat[1]}" r="5"/>` : ""}
  </svg>`;
  const svg = wadah.querySelector("svg")!;
  const tip = buatTip(wadah);
  svg.addEventListener("pointermove", (e) => {
    const el = (e.target as Element).closest<SVGPathElement>("path.wilayah");
    if (!el) return tip.sembunyi();
    const d = DAERAH[INDEKS.get(el.dataset.id!)!];
    const k = buka(nilai(d.id));
    const kotak = svg.getBoundingClientRect();
    tip.tampil(
      e.clientX - kotak.left,
      e.clientY - kotak.top,
      `<b>${esc(d.nama)}</b><br>${k.jenis === 0 ? "Tidak terlihat" : k.puncakTerbenam && k.jenis === 1 ? `Sebagian, ${persen(k.tertutup)} tertutup sebelum terbenam atau saat terbit<br>Puncaknya di bawah ufuk` : `${k.jenis === 1 ? "Sebagian" : k.jenis === 2 ? "Cincin" : "Total"}, ${persen(k.tertutup)} tertutup`}`,
    );
  });
  svg.addEventListener("pointerleave", () => tip.sembunyi());
  svg.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<SVGPathElement>("path.wilayah");
    if (el) pilih(el.dataset.id!);
  });
}

/* ---------- piringan Matahari dan Bulan ---------- */
let nomorPiringan = 0;

/**
 * Menggambar Matahari dan Bulan seperti terlihat dari daerah itu: atas = arah zenit.
 * Ufuk ikut digambar bila Matahari cukup rendah.
 */
export function gambarPiringan(wadah: HTMLElement, p: Piringan): number {
  const ukuran = Math.min(wadah.clientWidth || 320, 420);
  const c = ukuran / 2;
  const skala = (ukuran * 0.25) / p.rMatahari;
  const R = p.rMatahari * skala;
  const r = p.rBulan * skala;
  const bx = c + p.dx * skala;
  const by = c - p.dy * skala;
  const tertutup = luasTertutup(p);
  const total = tertutup >= 0.9999;
  const ufuk = c + p.tinggi * skala;
  const id = `p${++nomorPiringan}`;
  // Langit baru benar-benar gelap saat total; sebelum itu hanya meredup sedikit, terasa di atas sekitar 85%.
  const gelap = total ? 1 : 0.6 * Math.max(0, (tertutup - 0.75) / 0.25) ** 3;
  wadah.innerHTML = `<svg viewBox="0 0 ${ukuran} ${ukuran}" width="${ukuran}" height="${ukuran}" role="img">
    <defs>
      <clipPath id="${id}-bingkai"><rect width="${ukuran}" height="${ukuran}" rx="18"/></clipPath>
      <clipPath id="${id}-matahari"><circle cx="${c}" cy="${c}" r="${R}"/></clipPath>
      <radialGradient id="${id}-korona"><stop offset="${(R / (R * 3)) * 100}%" stop-color="var(--korona)" stop-opacity="0.95"/><stop offset="60%" stop-color="var(--korona)" stop-opacity="0.18"/><stop offset="100%" stop-color="var(--korona)" stop-opacity="0"/></radialGradient>
    </defs>
    <g clip-path="url(#${id}-bingkai)">
      <rect class="langit" width="${ukuran}" height="${ukuran}"/>
      <rect class="langit-gelap" width="${ukuran}" height="${ukuran}" opacity="${gelap.toFixed(3)}"/>
      ${total ? `<circle cx="${c}" cy="${c}" r="${R * 3}" fill="url(#${id}-korona)"/>` : ""}
      <circle class="matahari" cx="${c}" cy="${c}" r="${R}"/>
      ${
        // Bulan baru tak terlihat di langit terang: yang tampak hanya gigitannya di piringan Matahari.
        // Saat total, siluetnya terlihat utuh di depan korona.
        total
          ? `<circle class="bulan saat-total" cx="${bx}" cy="${by}" r="${r}"/>`
          : `<circle class="bulan" cx="${bx}" cy="${by}" r="${r}" clip-path="url(#${id}-matahari)"/><circle class="tepi-bulan" cx="${bx}" cy="${by}" r="${r}"/>`
      }
      ${ufuk < ukuran ? `<rect class="tanah" x="0" y="${Math.max(0, ufuk)}" width="${ukuran}" height="${ukuran}"/>` : ""}
      ${ufuk > 0 && ufuk < ukuran ? `<line class="garis-ufuk" x1="0" x2="${ukuran}" y1="${ufuk}" y2="${ufuk}"/>` : ""}
      ${ufuk <= R ? `<text class="teks-bawah-ufuk" x="${c}" y="${Math.max(c, ufuk + 40)}" text-anchor="middle">Matahari di bawah ufuk</text>` : ""}
    </g>
    <text class="arah-zenit" x="${c}" y="18" text-anchor="middle">↑ zenit</text>
  </svg>`;
  return tertutup;
}

/* ---------- semua gerhana di satu daerah ---------- */
export type TitikDaerah = { i: number; t: Date; jenis: Jenis; tertutup: number };

export function gambarSebaran(wadah: HTMLElement, titik: TitikDaerah[], terpilih: number, sekarang: Date, z: number, pilih: (i: number) => void): void {
  const lebar = Math.max(300, wadah.clientWidth);
  const hp = lebar < 560;
  const tinggi = hp ? 200 : 230;
  const m = { atas: 14, kanan: 14, bawah: 26, kiri: 42 };
  const x = scaleLinear().domain([Date.UTC(1900, 0, 1), Date.UTC(2101, 0, 1)]).range([m.kiri, lebar - m.kanan]);
  const y = scaleLinear().domain([0, 1]).range([tinggi - m.bawah, m.atas]);
  const tahun = hp ? [1900, 1950, 2000, 2050, 2100] : [1900, 1925, 1950, 1975, 2000, 2025, 2050, 2075, 2100];
  const xs = x(sekarang.getTime());
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" width="${lebar}" height="${tinggi}">
    ${[0, 0.25, 0.5, 0.75, 1].map((v) => `<line class="kisi" x1="${m.kiri}" x2="${lebar - m.kanan}" y1="${y(v)}" y2="${y(v)}"/><text class="sumbu" x="${m.kiri - 8}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join("")}
    ${tahun.map((t) => `<text class="sumbu" x="${x(Date.UTC(t, 0, 1))}" y="${tinggi - 6}" text-anchor="${t === 1900 ? "start" : t === 2100 ? "end" : "middle"}">${t}</text>`).join("")}
    <line class="garis-kini" x1="${xs}" x2="${xs}" y1="${m.atas - 4}" y2="${tinggi - m.bawah}"/>
    <text class="label-kini" x="${xs + 5}" y="${m.atas + 6}">kini</text>
    ${titik
      .map((p) => `<circle class="titik j${p.jenis}${p.i === terpilih ? " dipilih" : ""}" data-i="${p.i}" cx="${x(p.t.getTime())}" cy="${y(p.tertutup)}" r="${p.i === terpilih ? 6.5 : 4.5}"/>`)
      .join("")}
  </svg>`;
  const svg = wadah.querySelector("svg")!;
  const tip = buatTip(wadah);
  // Titik saling berdempetan, jadi cari titik terdekat dari penunjuk alih-alih menuntut tepat kena.
  const terdekat = (e: PointerEvent | MouseEvent) => {
    const k = svg.getBoundingClientRect();
    const px = e.clientX - k.left;
    const py = e.clientY - k.top;
    let paling: TitikDaerah | null = null;
    let jarak = 18;
    for (const p of titik) {
      const j = Math.hypot(x(p.t.getTime()) - px, y(p.tertutup) - py);
      if (j < jarak) [paling, jarak] = [p, j];
    }
    return { p: paling, px, py };
  };
  svg.addEventListener("pointermove", (e) => {
    const { p, px, py } = terdekat(e);
    svg.style.cursor = p ? "pointer" : "";
    if (!p) return tip.sembunyi();
    tip.tampil(px, py, `<b>${teksTanggal(p.t, z)}</b><br>${NAMA_JENIS[p.jenis][0].toUpperCase() + NAMA_JENIS[p.jenis].slice(1)}, ${persen(p.tertutup)} tertutup`);
  });
  svg.addEventListener("pointerleave", () => tip.sembunyi());
  svg.addEventListener("click", (e) => {
    const { p } = terdekat(e);
    if (p) pilih(p.i);
  });
}
