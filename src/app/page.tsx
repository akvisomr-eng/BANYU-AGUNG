import Link from "next/link";

const photos = [
  {
    title: "Alam dan sumber air",
    note: "Foto ilustrasi alam; bukan dokumentasi lokasi atau sumber produksi BANYU AGUNG.",
    src: "https://images.unsplash.com/photo-1437482078695-73f2ca6c96e2?auto=format&fit=crop&w=1400&q=85",
    alt: "Aliran air jernih di tengah alam hijau",
  },
  {
    title: "Kesegaran setiap hari",
    note: "Foto ilustrasi air minum untuk kebutuhan pelanggan.",
    src: "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1200&q=85",
    alt: "Gelas berisi air minum",
  },
  {
    title: "Proses dan ketelitian",
    note: "Foto ilustrasi proses produksi; bukan foto fasilitas BANYU AGUNG.",
    src: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1200&q=85",
    alt: "Lingkungan kerja industri dan proses teknis",
  },
];

const products = [
  { name: "Air Minum Kemasan", detail: "Pilihan kemasan untuk kebutuhan rumah tangga, usaha, dan institusi.", size: "Ukuran dan varian mengikuti katalog resmi" },
  { name: "Kemasan Galon", detail: "Solusi kebutuhan air minum berulang untuk pelanggan dan mitra.", size: "Ketersediaan dikonfirmasi oleh tim penjualan" },
  { name: "Kemitraan Distribusi", detail: "Peluang kerja sama untuk toko, reseller, agen, dan distributor.", size: "Wilayah layanan dikonfirmasi saat pendaftaran" },
];
const contacts = [
  { phone: "+62 851-3652-2392", href: "https://wa.me/6285136522392" },
  { phone: "+62 815-1505-5300", href: "https://wa.me/6281515055300" },
  { phone: "+62 877-7017-6553", href: "https://wa.me/6287770176553" },
];

export default function Home() {
  return <main>
    <header className="topbar">
      <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
      <nav aria-label="Navigasi utama"><a href="#tentang">Tentang</a><a href="#produk">Produk</a><a href="#galeri">Galeri</a><a href="#mutu">Mutu & Proses</a><a href="#mitra">Kemitraan</a></nav>
      <a className="navCta" href="#kontak">Hubungi Kami ↗</a>
    </header>

    <section className="hero">
      <div className="heroCopy">
        <p className="eyebrow">AIR KEMASAN • JOLOTUNDO • MOJOKERTO</p>
        <h1>Berawal dari alam.<br /><em>Hadir untuk kehidupan.</em></h1>
        <p className="lead">BANYU AGUNG membangun layanan air minum kemasan dengan perhatian pada sumber air, proses produksi, pengendalian mutu, dan pelayanan distribusi.</p>
        <div className="actions"><a className="primary" href="#produk">Jelajahi Produk <span>↗</span></a><a className="secondary" href="#tentang">Kenali Perusahaan ↓</a></div>
        <div className="heroMeta"><span>JOLOTUNDO, MOJOKERTO</span><span>QUALITY • CARE • TRUST</span></div>
      </div>
      <div className="heroVisual">
        <div className="heroImage" role="img" aria-label="Pemandangan air dan alam hijau" />
        <div className="heroStamp"><span>BA</span><small>PURE WATER<br />THOUGHTFULLY MANAGED</small></div>
        <p className="visualNote">Menghargai alam,<br />menjaga kepercayaan.</p>
      </div>
    </section>

    <section id="tentang" className="intro section">
      <div><p className="eyebrow">01 / TENTANG KAMI</p><h2>Membangun bisnis air minum dengan fondasi yang bertanggung jawab.</h2></div>
      <div><p>BANYU AGUNG dipersiapkan sebagai usaha air kemasan yang mengutamakan tata kelola sumber air, proses produksi yang terkendali, transparansi informasi, dan jaringan distribusi yang dapat diandalkan.</p><p className="muted">Informasi badan usaha, alamat fasilitas, sejarah, kapasitas, dan legalitas akan dilengkapi berdasarkan data resmi perusahaan.</p></div>
    </section>

    <section id="produk" className="products section">
      <div className="sectionHead"><div><p className="eyebrow">02 / PORTOFOLIO</p><h2>Produk & layanan</h2></div><p>Solusi air minum untuk pelanggan, pelaku usaha, dan mitra distribusi.</p></div>
      <div className="productGrid">{products.map((p,i)=><article className="productCard" key={p.name}><div className={`productArt productArt${i+1}`}><span>0{i+1}</span><div className="bottle"><i /></div></div><h3>{p.name}</h3><p>{p.detail}</p><small>{p.size}</small></article>)}</div>
    </section>

    <section id="galeri" className="gallery section">
      <div className="sectionHead"><div><p className="eyebrow">03 / CERITA VISUAL</p><h2>Air, alam, dan proses.</h2></div><p>Materi visual ilustratif untuk memperkenalkan tema air dan proses. Dokumentasi fasilitas resmi akan menggantikan foto ilustrasi setelah tersedia.</p></div>
      <div className="galleryGrid">{photos.map((photo,i)=><figure className={`galleryCard galleryCard${i+1}`} key={photo.title}><img src={photo.src} alt={photo.alt} loading="lazy" /><figcaption><strong>{photo.title}</strong><span>{photo.note}</span></figcaption></figure>)}</div>
      <div className="videoFeature">
        <div><p className="eyebrow">VIDEO / STOCK FOOTAGE</p><h3>Gerak air dan keindahan alam.</h3><p>Jelajahi footage bertema mata air, air mengalir, tetesan air, dan proses pembotolan dari pustaka video berlisensi Pexels dan Pixabay. Pilih klip satu per satu dan simpan halaman sumber serta bukti lisensinya.</p></div>
        <div className="videoLinks"><a href="https://www.pexels.com/video/peaceful-forest-stream-with-waterfall-33105917/" target="_blank" rel="noreferrer">Pexels · Aliran mata air di hutan · Grzegorz Lewandowski ↗</a><a href="https://www.pexels.com/video/water-stream-among-trees-11911387/" target="_blank" rel="noreferrer">Pexels · Aliran air di antara pepohonan · João Pavese ↗</a><a href="https://pixabay.com/videos/waterflow-waterfall-spring-water-373001/" target="_blank" rel="noreferrer">Pixabay · Mata air di hutan hujan · Simonus18 ↗</a></div>
      </div>
      <p className="mediaCredit">Foto ilustrasi: Unsplash License. Foto ini bukan bukti sumber air, hasil produksi, atau fasilitas milik BANYU AGUNG.</p>
    </section>

    <section id="mutu" className="quality section">
      <div><p className="eyebrow">04 / MUTU & TANGGUNG JAWAB</p><h2>Kepercayaan harus dibuktikan, bukan sekadar diklaim.</h2><p>Informasi kualitas air, proses pengolahan, sanitasi, dan pengujian laboratorium akan disampaikan secara transparan berdasarkan dokumen yang sah dan hasil uji terkini.</p><a className="textLink" href="#kontak">Tanyakan informasi mutu ↗</a></div>
      <div className="qualityPanel"><span className="qualityIcon">◌</span><h3>Transparansi kualitas</h3><p>Publikasi parameter mutu hanya dilakukan setelah verifikasi laporan laboratorium, metode uji, tanggal sampling, dan kesesuaian regulasi.</p><div className="qualityRule" /></div>
    </section>

    <section id="mitra" className="partner section"><p className="eyebrow">05 / TUMBUH BERSAMA</p><h2>Menjadi bagian dari jaringan BANYU AGUNG.</h2><p>Terbuka untuk diskusi kerja sama toko, reseller, agen, distributor, dan kebutuhan institusi.</p><a className="primary" href="mailto:akvisomr@gmail.com?subject=Kemitraan%20BANYU%20AGUNG">Ajukan Kerja Sama</a></section>

    <section id="kontak" className="contact section"><p className="eyebrow">06 / KONTAK RESMI</p><h2>Hubungi tim BANYU AGUNG</h2><p className="contactIntro">Untuk informasi produk, pemesanan, kemitraan, dan layanan pelanggan.</p><div className="contactGrid">{contacts.map(c=><a className="contactItem" href={c.href} target="_blank" rel="noreferrer" key={c.phone}><span>WhatsApp</span><strong>{c.phone}</strong><small>Mulai percakapan ↗</small></a>)}</div><a className="contactEmail" href="mailto:akvisomr@gmail.com">akvisomr@gmail.com</a></section>
    <footer><Link className="brand" href="/">BANYU <span>AGUNG</span></Link><p>Air Kemasan Jolotundo · Mojokerto, Jawa Timur</p><small>© {new Date().getFullYear()} BANYU AGUNG. Informasi perusahaan dan produk akan diperbarui setelah verifikasi data resmi.</small></footer>
  </main>;
}
