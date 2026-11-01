import "@fontsource-variable/bodoni-moda/opsz.css";
import "@fontsource-variable/bodoni-moda/opsz-italic.css";
import "@fontsource-variable/jost";
import "@fontsource-variable/jetbrains-mono";
import "./gaya.css";
import {
  DAERAH,
  INDEKS,
  NAMA_JENIS,
  type DataGerhana,
  type Daerah,
  type Lokal,
  type Ringkasan,
  buka,
  cariDaerah,
  daerahDariId,
  jenisTerbesar,
  lokal,
  namaZona,
  persen,
  piringan,
  ringkas,
  teksDurasi,
  teksJam,
  teksTanggal,
  zona,
} from "./gerhana";
import { htmlTetangga } from "./tetangga";
import { LEGENDA, type TitikDaerah, esc, gambarPeta, gambarPiringan, gambarSebaran, muatPeta } from "./vis";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const angka = (n: number) => n.toLocaleString("id-ID");
const SEKARANG = new Date();

/** "Aceh, Sumatera Utara, dan Riau", dipotong bila lebih dari `batas` (tapi tidak menyisakan "1 provinsi lain"). */
function daftar(xs: string[], batas = 4): string {
  if (xs.length > batas + 1) return `${xs.slice(0, batas).join(", ")}, dan ${xs.length - batas} provinsi lain`;
  if (xs.length <= 2) return xs.join(" dan ");
  return `${xs.slice(0, -1).join(", ")}, dan ${xs.at(-1)}`;
}
const besar = (s: string) => s[0].toUpperCase() + s.slice(1);

/* ---------- muat ---------- */
const data = await fetch(`${import.meta.env.BASE_URL}data/gerhana.json`).then((r) => r.json() as Promise<DataGerhana>);
// Peta 514 daerah berat digambar; baru dimuat saat bagiannya hampir terlihat (lihat bagian "mulai").
let peta: Awaited<ReturnType<typeof muatPeta>> | null = null;
if (data.daerah.some((id, i) => DAERAH[i].id !== id)) throw new Error("Urutan daerah di data gerhana tidak cocok");
const RINGKAS: Ringkasan[] = data.gerhana.map(ringkas);
const tanggalKunci = (r: Ringkasan) => r.g.t.slice(0, 10);

/* ---------- keadaan ---------- */
const hash = new URLSearchParams(location.hash.slice(1));
let daerah: Daerah = daerahDariId(hash.get("daerah") ?? "") ?? daerahDariId("kota-jakarta-pusat");
const nilaiDi = (i: number, d = daerah) => buka(RINGKAS[i].g.v[INDEKS.get(d.id)!]);
const berikutnyaDi = (d: Daerah, dari = SEKARANG) => RINGKAS.findIndex((r, i) => r.tanggal > dari && nilaiDi(i, d).jenis > 0);
let gerhanaI = Math.max(0, RINGKAS.findIndex((r) => tanggalKunci(r) === hash.get("g")));
if (!hash.get("g")) gerhanaI = Math.max(0, berikutnyaDi(daerah));

function simpanHash() {
  history.replaceState(null, "", `#daerah=${daerah.id}&g=${tanggalKunci(RINGKAS[gerhanaI])}`);
}

/* ---------- pembuka ---------- */
function isiPembuka() {
  const jalurTotal = RINGKAS.filter((r) => r.jumlah[3]);
  const jalurCincin = RINGKAS.filter((r) => !r.jumlah[3] && r.jumlah[2]);
  const totalLalu = jalurTotal.filter((r) => r.tanggal < SEKARANG).at(-1);
  const total = jalurTotal.find((r) => r.tanggal > SEKARANG);
  const cincin = jalurCincin.find((r) => r.tanggal > SEKARANG);
  if (total) {
    $("[data-judul]").innerHTML = `Gerhana matahari total berikutnya di Indonesia: <em>${teksTanggal(total.tanggal)}</em>.`;
    const antara = RINGKAS.filter((r) => r.tanggal > SEKARANG && r.tanggal < total.tanggal).length;
    $("[data-lead]").textContent =
      `Bayangan Bulan akan menutup Matahari sepenuhnya di ${total.jumlah[3]} kabupaten/kota di ${daftar(total.provJalur)}. ` +
      `Sebelum itu, ${antara} gerhana sebagian atau cincin masih akan terlihat dari Indonesia.` +
      (totalLalu ? ` Yang terakhir total terjadi ${teksTanggal(totalLalu.tanggal)} di ${daftar(totalLalu.provJalur)}.` : "");
  }
  const kunci: [string, string][] = [
    [angka(RINGKAS.length), `gerhana matahari terlihat dari Indonesia, ${data.rentang[0]}–${data.rentang[1]}`],
    [angka(jalurTotal.length), `melintaskan jalur total${totalLalu ? `, terakhir ${teksTanggal(totalLalu.tanggal)}` : ""}`],
    [angka(jalurCincin.length), `melintaskan jalur cincin${cincin ? `, berikutnya ${teksTanggal(cincin.tanggal)}` : ""}`],
  ];
  $("[data-kunci]").innerHTML = kunci.map(([a, b]) => `<li><strong>${a}</strong><span>${b}</span></li>`).join("");
}

/** Untuk gambar pembuka: daerah dengan total terlama pada gerhana total berikutnya. */
function pembukaGambar(): (() => void) | null {
  const iTotal = RINGKAS.findIndex((r) => r.jumlah[3] && r.tanggal > SEKARANG);
  if (iTotal < 0) return null;
  const r = RINGKAS[iTotal];
  let paling: { d: Daerah; l: Lokal; lama: number } | null = null;
  r.g.v.forEach((n, i) => {
    if (buka(n).jenis !== 3) return;
    const l = lokal(DAERAH[i], r.tanggal);
    if (!l?.totalMulai || !l.totalSelesai) return;
    const lama = l.totalSelesai.ut.getTime() - l.totalMulai.ut.getTime();
    if (!paling || lama > paling.lama) paling = { d: DAERAH[i], l, lama };
  });
  if (!paling) return null;
  const { d, l, lama } = paling as { d: Daerah; l: Lokal; lama: number };
  const z = zona(d);
  const tengah = new Date((l.totalMulai!.ut.getTime() + l.totalSelesai!.ut.getTime()) / 2);
  $("[data-keterangan-pembuka]").textContent = `${d.nama}, ${teksTanggal(tengah, z)} pukul ${teksJam(tengah, z)} ${namaZona(z)}: total selama ${teksDurasi(lama)}.`;
  $("#piringan-pembuka").setAttribute("aria-label", `Gambaran gerhana total di ${d.nama} pada ${teksTanggal(tengah, z)}.`);
  return () => gambarPiringan($("#piringan-pembuka"), piringan(d, tengah));
}

/* ---------- di daerahmu ---------- */
let lokalKini: Lokal | null = null;
const geser = $<HTMLInputElement>("#geser-waktu");

function waktuGeser(): Date | null {
  if (!lokalKini) return null;
  const a = lokalKini.mulai.ut.getTime();
  const b = lokalKini.selesai.ut.getTime();
  return new Date(a + ((b - a) * Number(geser.value)) / 1000);
}

function gambarLokal() {
  const t = waktuGeser();
  if (!t || !lokalKini) return;
  const z = zona(daerah);
  const p = piringan(daerah, t);
  const tutup = gambarPiringan($("#piringan-lokal"), p);
  $("[data-jam-geser]").textContent = `${teksJam(t, z)} · ${persen(tutup)}`;
  $("#piringan-lokal").setAttribute("aria-label", `Matahari dan Bulan dilihat dari ${daerah.nama} pukul ${teksJam(t, z)} ${namaZona(z)}, ${persen(tutup)} tertutup.`);
}

function teksFase(nama: string, f: { ut: Date; tinggi: number }, z: number) {
  const tinggi = f.tinggi <= 0 ? "Matahari di bawah ufuk" : f.tinggi < 1 ? "Matahari tepat di ufuk" : `Matahari ${Math.round(f.tinggi)}° di atas ufuk`;
  return `<dt>${nama}</dt><dd>${teksJam(f.ut, z)} ${namaZona(z)} <small>${tinggi}</small></dd>`;
}

function isiDaerah() {
  const z = zona(daerah);
  const r = RINGKAS[gerhanaI];
  $("[data-nama-daerah]").textContent = daerah.nama;
  lokalKini = lokal(daerah, r.tanggal);
  const kendali = $("[data-kendali]");
  if (!lokalKini) {
    $("[data-kalimat-lokal]").innerHTML = `Gerhana ${teksTanggal(r.tanggal, z)} tidak terlihat dari ${esc(daerah.nama)}.`;
    $("[data-fase]").innerHTML = "";
    $("#piringan-lokal").innerHTML = "";
    kendali.hidden = true;
  } else {
    const l = lokalKini;
    const tgl = teksTanggal(l.puncak.ut, z);
    const lamaUtama = l.totalMulai && l.totalSelesai ? l.totalSelesai.ut.getTime() - l.totalMulai.ut.getTime() : 0;
    const lampau = l.selesai.ut < SEKARANG;
    $("[data-kalimat-lokal]").innerHTML =
      l.jenis === 3
        ? `Pada ${tgl}, Matahari di ${esc(daerah.nama)} ${lampau ? "tertutup" : "akan tertutup"} <strong>total selama ${teksDurasi(lamaUtama)}</strong>.`
        : l.jenis === 2
          ? `Pada ${tgl}, Matahari di ${esc(daerah.nama)} ${lampau ? "menjadi" : "akan menjadi"} <strong>cincin api selama ${teksDurasi(lamaUtama)}</strong>.`
          : l.terlihat.sebab === "terbenam"
            ? `Pada ${tgl}, gerhana di ${esc(daerah.nama)} ${lampau ? "mulai" : "akan mulai"} menjelang Matahari terbenam. Hanya <strong>${persen(l.terlihat.tertutup)}</strong> yang sempat tertutup sebelum Matahari tenggelam.`
            : l.terlihat.sebab === "terbit"
              ? `Pada ${tgl}, Matahari ${lampau ? "terbit" : "akan terbit"} di ${esc(daerah.nama)} dalam keadaan <strong>${persen(l.terlihat.tertutup)}</strong> tertutup Bulan, lalu gerhananya berangsur selesai.`
              : `Pada ${tgl}, <strong>${persen(l.tertutup)}</strong> piringan Matahari di ${esc(daerah.nama)} ${lampau ? "tertutup" : "akan tertutup"} Bulan saat puncak.`;
    const nama = l.jenis === 2 ? "cincin" : "total";
    $("[data-fase]").innerHTML =
      teksFase("Mulai", l.mulai, z) +
      (l.jenis > 1 && l.totalMulai ? teksFase(`${besar(nama)} mulai`, l.totalMulai, z) : "") +
      teksFase("Puncak", l.puncak, z) +
      (l.jenis > 1 && l.totalSelesai ? teksFase(`${besar(nama)} selesai`, l.totalSelesai, z) : "") +
      teksFase("Selesai", l.selesai, z) +
      `<dt>Lama</dt><dd>${teksDurasi(l.selesai.ut.getTime() - l.mulai.ut.getTime())}</dd>`;
    kendali.hidden = false;
    // Mulai dari saat paling tertutup yang terlihat supaya gambar pertama langsung menunjukkan gerhananya.
    const a = l.mulai.ut.getTime();
    geser.value = String(Math.round(((l.terlihat.ut.getTime() - a) / (l.selesai.ut.getTime() - a)) * 1000));
    gambarLokal();
  }

  // Catatan: gerhana berikutnya di sini dan gerhana total terdekat.
  const catatan: string[] = [];
  const iBerikut = berikutnyaDi(daerah);
  if (lokalKini?.puncak.tinggi !== undefined && lokalKini.puncak.tinggi <= 0)
    catatan.push(`Puncaknya, ${persen(lokalKini.tertutup)} tertutup, terjadi saat Matahari di bawah ufuk.`);
  if (iBerikut >= 0 && iBerikut !== gerhanaI)
    catatan.push(`Gerhana berikutnya yang terlihat dari sini: <button type="button" data-ke="${iBerikut}">${teksTanggal(RINGKAS[iBerikut].tanggal, z)}</button>.`);
  const totalSini = RINGKAS.map((_, i) => i).filter((i) => nilaiDi(i).jenis === 3);
  const totalDatang = totalSini.find((i) => RINGKAS[i].tanggal > SEKARANG);
  if (totalDatang !== undefined && totalDatang !== gerhanaI)
    catatan.push(`Gerhana total berikutnya di sini: <button type="button" data-ke="${totalDatang}">${teksTanggal(RINGKAS[totalDatang].tanggal, z)}</button>.`);
  else if (!totalSini.length) catatan.push(`Dari ${data.rentang[0]} sampai ${data.rentang[1]}, tidak ada gerhana total di titik tengah ${esc(daerah.nama)}.`);
  $("[data-catatan-lokal]").innerHTML = catatan.join(" ");

  // Sebaran semua gerhana di daerah ini.
  const titik: TitikDaerah[] = [];
  RINGKAS.forEach((r, i) => {
    const k = nilaiDi(i);
    if (k.jenis) titik.push({ i, t: r.tanggal, jenis: k.jenis, tertutup: k.tertutup });
  });
  const hitung = (j: number) => titik.filter((p) => p.jenis === j).length;
  $("[data-judul-sebaran]").textContent =
    `${titik.length} gerhana matahari terlihat dari ${daerah.nama}, ${data.rentang[0]}–${data.rentang[1]}` +
    (hitung(3) || hitung(2) ? `: ${[hitung(3) && `${hitung(3)} total`, hitung(2) && `${hitung(2)} cincin`].filter(Boolean).join(", ")}` : "");
  gambarSebaran($("#sebaran"), titik, gerhanaI, SEKARANG, z, pilihGerhana);
  $("[data-tetangga]").innerHTML = htmlTetangga(daerah.id, daerah.nama, "gerhana");
}


/* ---------- putar ---------- */
const tombolPutar = $<HTMLButtonElement>("[data-putar]");
let animasi = 0;
function berhenti() {
  cancelAnimationFrame(animasi);
  animasi = 0;
  tombolPutar.textContent = "▶";
  tombolPutar.setAttribute("aria-label", "Putar jalannya gerhana");
}
tombolPutar.addEventListener("click", () => {
  if (animasi) return berhenti();
  if (Number(geser.value) >= 1000) geser.value = "0";
  let lalu = performance.now();
  const langkah = (kini: number) => {
    // Seluruh gerhana diputar dalam sekitar sembilan detik.
    const v = Math.min(1000, Number(geser.value) + ((kini - lalu) / 9000) * 1000);
    lalu = kini;
    geser.value = String(v);
    gambarLokal();
    if (v >= 1000) return berhenti();
    animasi = requestAnimationFrame(langkah);
  };
  tombolPutar.textContent = "❚❚";
  tombolPutar.setAttribute("aria-label", "Jeda");
  animasi = requestAnimationFrame(langkah);
});
geser.addEventListener("input", () => {
  if (animasi) berhenti();
  gambarLokal();
});

/* ---------- peta ---------- */
const pilihan = $<HTMLSelectElement>("#pilih-gerhana");
pilihan.innerHTML = RINGKAS.map((r, i) => {
  const j = jenisTerbesar(r);
  const n = r.jumlah[1] + r.jumlah[2] + r.jumlah[3];
  return `<option value="${i}">${teksTanggal(r.tanggal, 7, true)} · ${j === 1 ? `sebagian, ${n} kab/kota` : `${NAMA_JENIS[j]} di ${r.jumlah[j]} kab/kota`}</option>`;
}).join("");
pilihan.addEventListener("change", () => pilihGerhana(Number(pilihan.value)));
document.querySelectorAll<HTMLButtonElement>("[data-geser]").forEach((b) =>
  b.addEventListener("click", () => pilihGerhana(Math.max(0, Math.min(RINGKAS.length - 1, gerhanaI + Number(b.dataset.geser))))),
);

$("[data-legenda]").innerHTML =
  `<li class="judul-legenda">Sebagian</li>` +
  LEGENDA.slice(0, 5)
    .map(([k, t]) => `<li><span class="kotak-legenda k${k}"></span>${t}</li>`)
    .join("") +
  LEGENDA.slice(5)
    .map(([k, t]) => `<li><span class="kotak-legenda k${k}"></span>${t}</li>`)
    .join("") +
  `<li><span class="kotak-legenda k0"></span>tidak terlihat</li>`;

function isiPeta() {
  const r = RINGKAS[gerhanaI];
  pilihan.value = String(gerhanaI);
  document.querySelector<HTMLButtonElement>('[data-geser="-1"]')!.disabled = gerhanaI === 0;
  document.querySelector<HTMLButtonElement>('[data-geser="1"]')!.disabled = gerhanaI === RINGKAS.length - 1;
  const tgl = teksTanggal(r.tanggal);
  const terlihat = r.jumlah[1] + r.jumlah[2] + r.jumlah[3];
  let maksI = 0;
  r.g.v.forEach((n, i) => {
    if (buka(n).tertutup > buka(r.g.v[maksI]).tertutup) maksI = i;
  });
  const j = jenisTerbesar(r);
  const kalimat =
    j === 1
      ? `Pada ${tgl}, gerhana sebagian terlihat dari ${angka(terlihat)} kabupaten/kota. Paling tertutup di ${DAERAH[maksI].nama}, ${persen(buka(r.g.v[maksI]).tertutup)}.`
      : `Pada ${tgl}, Matahari ${j === 3 ? "tertutup total" : "menjadi cincin"} di ${angka(r.jumlah[j])} kabupaten/kota di ${daftar(r.provJalur)}` +
        (r.jumlah[1] ? `, dan tertutup sebagian di ${angka(r.jumlah[1])} lainnya.` : ".");
  $("[data-ringkasan-peta]").textContent = kalimat + (r.jumlah[0] ? ` Dari ${angka(r.jumlah[0])} kabupaten/kota lainnya, gerhana ini tidak terlihat sama sekali.` : "");
  $("#wadah-peta").setAttribute("aria-label", `Peta ketertutupan Matahari per kabupaten/kota pada ${tgl}. ${kalimat}`);
  if (peta) gambarPeta($("#wadah-peta"), peta, r.g, daerah.id, pilihDaerahDariPeta);
}

/* ---------- jalur ---------- */
function isiJalur() {
  const baris = RINGKAS.map((r, i) => ({ r, i })).filter(({ r }) => r.jumlah[2] || r.jumlah[3]);
  const total = baris.filter(({ r }) => r.jumlah[3]);
  const terluas = [...total].sort((a, b) => b.r.jumlah[3] - a.r.jumlah[3])[0];
  $("[data-pengantar-jalur]").textContent =
    `Gerhana total atau cincin hanya terlihat di jalur sempit bayangan Bulan. Dari ${data.rentang[0]} sampai ${data.rentang[1]}, jalur total melintasi Indonesia ${total.length} kali dan jalur cincin ${baris.length - total.length} kali. ` +
    (terluas ? `Jalur total yang melewati kabupaten/kota terbanyak terjadi ${teksTanggal(terluas.r.tanggal)}: ${terluas.r.jumlah[3]} daerah di ${daftar(terluas.r.provJalur, 3)}.` : "");
  $("[data-tabel-jalur]").innerHTML = baris
    .map(({ r, i }) => {
      const j = jenisTerbesar(r);
      return `<tr class="${r.tanggal < SEKARANG ? "lampau" : "datang"}${i === gerhanaI ? " terpilih-baris" : ""}" data-i="${i}">
        <td><button type="button" data-ke="${i}">${teksTanggal(r.tanggal, 7, true)}</button></td>
        <td><span class="jenis"><span class="titik-legenda j${j}"></span>${besar(NAMA_JENIS[j])}</span></td>
        <td class="angka">${r.jumlah[j]}</td>
        <td>${esc(daftar(r.provJalur))}</td>
      </tr>`;
    })
    .join("");
}
$("[data-tabel-jalur]").addEventListener("click", (e) => {
  const tr = (e.target as Element).closest<HTMLTableRowElement>("tr[data-i]");
  if (!tr) return;
  pilihGerhana(Number(tr.dataset.i));
  $("#peta").scrollIntoView({ behavior: "smooth" });
});
$("[data-catatan-lokal]").addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("button[data-ke]");
  if (b) pilihGerhana(Number(b.dataset.ke));
});

/* ---------- pilihan ---------- */
function pilihGerhana(i: number) {
  berhenti();
  gerhanaI = i;
  simpanHash();
  isiDaerah();
  isiPeta();
  document.querySelectorAll("[data-tabel-jalur] tr").forEach((tr) => tr.classList.toggle("terpilih-baris", Number((tr as HTMLElement).dataset.i) === i));
}

function pilihDaerah(d: Daerah) {
  berhenti();
  daerah = d;
  masuk.value = "";
  simpanHash();
  isiDaerah();
  isiPeta();
}
function pilihDaerahDariPeta(id: string) {
  pilihDaerah(daerahDariId(id));
  $("#daerah").scrollIntoView({ behavior: "smooth" });
}

/* ---------- cari ---------- */
const masuk = $<HTMLInputElement>("#cari-daerah");
const saran = $<HTMLUListElement>("#saran");
let hasil: Daerah[] = [];
let aktif = -1;
function tampilSaran() {
  hasil = cariDaerah(masuk.value);
  aktif = hasil.length ? 0 : -1;
  saran.hidden = !hasil.length;
  masuk.setAttribute("aria-expanded", String(hasil.length > 0));
  saran.innerHTML = hasil
    .map((d, i) => `<li role="option" id="saran-${i}" data-id="${d.id}" aria-selected="${i === aktif}">${esc(d.nama)} <small>${esc(d.prov)}</small></li>`)
    .join("");
  if (aktif >= 0) masuk.setAttribute("aria-activedescendant", `saran-${aktif}`);
}
function tutupSaran() {
  saran.hidden = true;
  masuk.setAttribute("aria-expanded", "false");
  masuk.removeAttribute("aria-activedescendant");
}
masuk.addEventListener("input", tampilSaran);
masuk.addEventListener("keydown", (e) => {
  if (saran.hidden) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    aktif = (aktif + (e.key === "ArrowDown" ? 1 : -1) + hasil.length) % hasil.length;
    saran.querySelectorAll("li").forEach((li, i) => li.setAttribute("aria-selected", String(i === aktif)));
    masuk.setAttribute("aria-activedescendant", `saran-${aktif}`);
  } else if (e.key === "Enter" && aktif >= 0) {
    e.preventDefault();
    pilihDaerah(hasil[aktif]);
    tutupSaran();
  } else if (e.key === "Escape") tutupSaran();
});
saran.addEventListener("mousedown", (e) => {
  const li = (e.target as Element).closest<HTMLLIElement>("li[data-id]");
  if (!li) return;
  e.preventDefault();
  pilihDaerah(daerahDariId(li.dataset.id!));
  tutupSaran();
});
masuk.addEventListener("blur", tutupSaran);

/* ---------- mulai ---------- */
isiPembuka();
const gambarPembuka = pembukaGambar();
isiJalur();
simpanHash();
function gambarSemua() {
  gambarPembuka?.();
  isiDaerah();
  isiPeta();
}
gambarSemua();

const io = "IntersectionObserver" in window
  ? new IntersectionObserver(
      (isi) => {
        if (!isi.some((e) => e.isIntersecting)) return;
        io?.disconnect();
        void muatPeta().then((p) => {
          peta = p;
          isiPeta();
        });
      },
      { rootMargin: "250px 0px" },
    )
  : null;
if (io) io.observe($("#peta"));
else void muatPeta().then((p) => ((peta = p), isiPeta()));

let lebarTerakhir
 = document.body.clientWidth;
new ResizeObserver(() => {
  const w = document.body.clientWidth;
  if (w === lebarTerakhir) return;
  lebarTerakhir = w;
  gambarSemua();
}).observe(document.body);
