import Link from "next/link";

export const metadata = {
  title: "Katalog Produk | BANYU AGUNG – Air Minum Jolotundo",
  description: "Rancangan portofolio produk BANYU AGUNG untuk kebutuhan rumah tangga, usaha, dan institusi.",
};

const products = [
  { code: "BA-GAL-19", name: "BANYU AGUNG Galon", size: "19 L", pack: "Galon guna ulang", market: "Rumah tangga, kantor, institusi", phase: "Prioritas 1", detail: "Produk berulang dengan sistem langganan, deposit wadah, penjadwalan antar, dan pengembalian galon." },
  { code: "BA-PET-600", name: "BANYU AGUNG Daily", size: "600 mL", pack: "Botol PET sekali pakai", market: "Warung, toko, perjalanan, reseller", phase: "Prioritas 1", detail: "Ukuran utama untuk distribusi harian dan perluasan jaringan ritel." },
  { code: "BA-PET-1500", name: "BANYU AGUNG Family", size: "1.500 mL", pack: "Botol PET sekali pakai", market: "Keluarga, restoran, kantor", phase: "Prioritas 2", detail: "Pilihan konsumsi bersama untuk rumah tangga dan kanal food service." },
  { code: "BA-PET-330", name: "BANYU AGUNG Select", size: "330 mL", pack: "Botol PET sekali pakai", market: "Hotel, rapat, katering, acara", phase: "Prioritas 2 · kontrak", detail: "Dikembangkan untuk kebutuhan hospitality dan institusi dengan volume terencana." },
  { code: "BA-PET-5000", name: "BANYU AGUNG Home", size: "5 L", pack: "Jeriken/botol food-contact", market: "Rumah tangga, pantry, perjalanan", phase: "Prioritas 3", detail: "Ekspansi setelah validasi kebutuhan pasar, pemasok kemasan, dan kemampuan lini produksi." },
];

export default function ProductCataloguePage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f5f6f0", color: "#102c35" }}>
      <header style={{ padding: "22px clamp(20px,7vw,100px)", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #dce5df" }}>
        <Link href="/" style={{ color: "#102c35", textDecoration: "none", letterSpacing: ".16em", fontWeight: 700 }}>BANYU <span style={{ color: "#176b70" }}>AGUNG</span></Link>
        <Link href="/" style={{ color: "#176b70", fontSize: 13, textDecoration: "none" }}>← Kembali ke beranda</Link>
      </header>
      <section style={{ padding: "clamp(48px,8vw,100px) clamp(20px,9vw,130px) 45px", background: "linear-gradient(135deg,#e5f0e8,#f5f6f0 60%,#dcebe5)" }}>
        <p style={{ letterSpacing: ".2em", color: "#176b70", fontSize: 10, fontWeight: 700 }}>WARISAN AIR NUSANTARA · JOLOTUNDO</p>
        <h1 style={{ fontFamily: "Georgia,serif", fontWeight: 400, fontSize: "clamp(42px,6vw,76px)", lineHeight: 1.05, maxWidth: 800, margin: "22px 0" }}>Portofolio air minum untuk <em>setiap kebutuhan.</em></h1>
        <p style={{ maxWidth: 680, color: "#60747a", lineHeight: 1.9, fontSize: 15 }}>Rancangan lini produk BANYU AGUNG yang disusun untuk membangun bisnis berulang, distribusi yang efisien, dan kemasan yang sesuai kebutuhan rumah tangga, usaha, serta institusi.</p>
        <p style={{ marginTop: 28, padding: "13px 16px", background: "#fff4df", borderLeft: "3px solid #bd8d3f", color: "#735a2a", maxWidth: 760, fontSize: 12, lineHeight: 1.8 }}>Katalog ini merupakan usulan portofolio pra-produksi. Ukuran, kategori AMDK, spesifikasi, label, harga, dan ketersediaan belum ditetapkan sebagai produk komersial. Produksi dan penjualan hanya dilakukan setelah seluruh persyaratan mutu dan perizinan terpenuhi.</p>
      </section>
      <section style={{ padding: "35px clamp(20px,9vw,130px) 90px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 18 }}>
          {products.map((p, i) => <article key={p.code} style={{ background: "white", border: "1px solid #dce5df", padding: 24, minHeight: 285, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#78908a", fontSize: 10, letterSpacing: ".12em" }}><span>0{i + 1} / PROPOSED SKU</span><span>{p.phase}</span></div>
            <div style={{ margin: "26px 0 18px", minHeight: 70, display: "flex", alignItems: "center", justifyContent: "center", color: "#176b70", fontFamily: "Georgia,serif", fontSize: 38, background: "linear-gradient(135deg,#e7f1eb,#f6f8f2)" }}>{p.size}</div>
            <h2 style={{ fontFamily: "Georgia,serif", fontWeight: 400, fontSize: 25, margin: "0 0 8px" }}>{p.name}</h2>
            <p style={{ color: "#60747a", fontSize: 12, margin: "0 0 12px" }}>{p.pack} · {p.code}</p>
            <p style={{ color: "#52696e", fontSize: 13, lineHeight: 1.8 }}>{p.detail}</p>
            <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #e5ece7" }}><small style={{ color: "#176b70", fontWeight: 600 }}>SEGMEN</small><p style={{ fontSize: 12, color: "#60747a", margin: "6px 0 0" }}>{p.market}</p></div>
          </article>)}
        </div>
        <div style={{ marginTop: 35, background: "#123b43", color: "#edf4ef", padding: "clamp(24px,4vw,42px)" }}>
          <p style={{ letterSpacing: ".18em", color: "#a8d0c2", fontSize: 10 }}>PRINSIP KAMI</p>
          <h2 style={{ fontFamily: "Georgia,serif", fontWeight: 400, fontSize: 30 }}>Kepercayaan dibangun dari mutu yang dapat dibuktikan.</h2>
          <p style={{ color: "#c4d7d0", lineHeight: 1.9, fontSize: 13, maxWidth: 800 }}>Kategori air, proses, hasil uji laboratorium, klaim label, nomor izin edar, dan sertifikasi akan dipublikasikan hanya berdasarkan dokumen yang sah dan telah ditinjau penanggung jawab mutu serta regulatori.</p>
        </div>
        <p style={{ marginTop: 26, fontSize: 11, color: "#81928d", lineHeight: 1.8 }}>Harga belum dicantumkan karena HPP dan biaya distribusi masih harus dihitung berdasarkan quotation kemasan, kapasitas fasilitas, hasil pilot, biaya energi, tenaga kerja, QC, dan rute distribusi.</p>
        <p style={{ marginTop: 25 }}><Link href="/permintaan?jenis=kemitraan" style={{ color: "#176b70", fontSize: 13 }}>Diskusikan peluang kemitraan ↗</Link></p>
      </section>
    </main>
  );
}
