import * as A from "astronomy-engine";
import { describe, expect, it } from "vitest";
import { buka, daerahDariId, luasTertutup, lokal, persen, piringan, teksDurasi, teksJam, teksTanggal, zona } from "./gerhana";

/** Puncak global gerhana matahari pertama setelah tanggal itu. */
const puncakSetelah = (iso: string) => A.SearchGlobalSolarEclipse(A.MakeTime(new Date(iso))).peak.date;

describe("keadaan lokal", () => {
  it("9 Maret 2016: total di Palu sekitar dua menit, pagi hari WITA", () => {
    const palu = daerahDariId("kota-palu");
    const l = lokal(palu, puncakSetelah("2016-03-01"))!;
    expect(l.jenis).toBe(3);
    expect(l.tertutup).toBe(1);
    const lama = l.totalSelesai!.ut.getTime() - l.totalMulai!.ut.getTime();
    expect(lama).toBeGreaterThan(100_000);
    expect(lama).toBeLessThan(140_000);
    expect(teksJam(l.totalMulai!.ut, zona(palu))).toMatch(/^08\.3/);
  });

  it("9 Maret 2016: di Jakarta hanya sebagian", () => {
    const l = lokal(daerahDariId("kota-jakarta-pusat"), puncakSetelah("2016-03-01"))!;
    expect(l.jenis).toBe(1);
    expect(l.tertutup).toBeGreaterThan(0.75);
    expect(l.tertutup).toBeLessThan(0.95);
  });

  it("26 Desember 2019: cincin di Singkawang", () => {
    const l = lokal(daerahDariId("kota-singkawang"), puncakSetelah("2019-12-20"))!;
    expect(l.jenis).toBe(2);
    expect(l.tertutup).toBeGreaterThan(0.85);
  });

  it("11 Juni 1983: total di Yogyakarta", () => {
    expect(lokal(daerahDariId("kota-yogyakarta"), puncakSetelah("1983-06-01"))!.jenis).toBe(3);
  });

  it("2 Agustus 2027: di Jakarta mulai menjelang terbenam, hanya sedikit yang terlihat", () => {
    const l = lokal(daerahDariId("kota-jakarta-pusat"), puncakSetelah("2027-07-25"))!;
    expect(l.puncak.tinggi).toBeLessThan(0);
    expect(l.tertutup).toBeGreaterThan(0.5);
    expect(l.terlihat.sebab).toBe("terbenam");
    expect(l.terlihat.tertutup).toBeLessThan(0.1);
    expect(l.terlihat.ut.getTime()).toBeGreaterThan(l.mulai.ut.getTime());
  });

  it("puncak di atas ufuk: yang terlihat adalah puncaknya", () => {
    const l = lokal(daerahDariId("kota-palu"), puncakSetelah("2016-03-01"))!;
    expect(l.terlihat.sebab).toBe("puncak");
    expect(l.terlihat.tertutup).toBe(l.tertutup);
  });

  it("gerhana yang tidak lewat Indonesia menghasilkan null", () => {
    // 21 Agustus 2017, Amerika Serikat.
    expect(lokal(daerahDariId("kota-jakarta-pusat"), puncakSetelah("2017-08-15"))).toBeNull();
  });
});

describe("piringan", () => {
  it("luas tertutup dari posisi piringan cocok dengan ketertutupan astronomy-engine", () => {
    for (const [id, iso] of [
      ["kota-jakarta-pusat", "2016-03-01"],
      ["kota-palu", "2016-03-01"],
      ["kota-singkawang", "2019-12-20"],
    ] as const) {
      const d = daerahDariId(id);
      const l = lokal(d, puncakSetelah(iso))!;
      expect(Math.abs(luasTertutup(piringan(d, l.puncak.ut)) - l.tertutup)).toBeLessThan(0.03);
    }
  });

  it("luasTertutup untuk kasus batas", () => {
    expect(luasTertutup({ rMatahari: 0.27, rBulan: 0.25, dx: 1, dy: 0 })).toBe(0);
    expect(luasTertutup({ rMatahari: 0.26, rBulan: 0.27, dx: 0, dy: 0 })).toBe(1);
    expect(luasTertutup({ rMatahari: 0.27, rBulan: 0.25, dx: 0, dy: 0 })).toBeCloseTo((0.25 / 0.27) ** 2, 6);
  });
});

describe("kode dan teks", () => {
  it("membuka kode skrip data", () => {
    expect(buka(0)).toEqual({ jenis: 0, tertutup: 0, puncakTerbenam: false });
    expect(buka(31000)).toEqual({ jenis: 3, tertutup: 1, puncakTerbenam: false });
    expect(buka(110420)).toEqual({ jenis: 1, tertutup: 0.42, puncakTerbenam: true });
  });

  it("format", () => {
    expect(teksTanggal(new Date("2016-03-09T01:58:00Z"), 8)).toBe("9 Maret 2016");
    expect(teksTanggal(new Date("2016-03-08T23:30:00Z"), 7)).toBe("9 Maret 2016");
    expect(teksJam(new Date("2016-03-09T00:37:40Z"), 8)).toBe("08.38");
    expect(teksDurasi(124_000)).toBe("2 menit 4 detik");
    expect(teksDurasi(45_000)).toBe("45 detik");
    expect(persen(0.004)).toBe("<1%");
    expect(persen(0.9996)).toBe("100%");
    expect(persen(0.884)).toBe("88%");
  });
});
