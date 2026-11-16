import Link from "next/link";

const products = [
  { number: "01", title: "Air Minum Kemasan", text: "Pilihan air minum kemasan untuk kebutuhan rumah tangga, usaha, dan institusi.", note: "Varian dan ukuran mengikuti katalog resmi" },
  { number: "02", title: "Kemasan Galon", text: "Solusi kebutuhan air minum berulang untuk pelanggan, kantor, dan mitra.", note: "Ketersediaan dikonfirmasi oleh tim penjualan" },
  { number: "03", title: "Kemitraan Distribusi", text: "Peluang kerja sama bagi toko, reseller, agen, dan distributor.", note: "Wilayah layanan dikonfirmasi saat pendaftaran" },
];

const gallery = [
  { title: "Alam dan sumber air", text: "Foto ilustrasi alam, bukan dokumentasi sumber produksi BANYU AGUNG.", src: "https://images.unsplash.com/photo-1437482078695-73f2ca6c96e2?auto=format&fit=crop&w=1200&q=85", alt: "Aliran air di tengah alam hijau" },
  { title: "Kesegaran setiap hari", text: "Foto ilustrasi air minum untuk kebutuhan pelanggan.", src: "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1000&q=85", alt: "Gelas berisi air minum" },
  { title: "Proses dan ketelitian", text: "Foto ilustrasi lingkungan kerja, bukan fasilitas produksi BANYU AGUNG.", src: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1000&q=85", alt: "Lingkungan kerja industri" },
];

const contacts = [
  { phone: "+62 851-3652-2392", href: "https://wa.me/6285136522392" },
  { phone: "+62 815-1505-5300", href: "https://wa.me/6281515055300" },
  { phone: "+62 877-7017-6553", href: "https://wa.me/6287770176553" },
];

const navItems = [
  ["Beranda", "#beranda"], ["Tentang", "#tentang"], ["Produk", "#produk"],
  ["Galeri", "#galeri"], ["Mutu", "#mutu"], ["Kemitraan", "#mitra"], ["Kontak", "#kontak"],
];

export default function Home() {
  return (
    <div className="novemberSite">
      <header className="novemberHeader">
        <div className="novemberHeaderInner">
          <Link href="/" className="novemberLogo" aria-label="BANYU AGUNG beranda">
            <span className="novemberLogoMark">BA</span>
            <span className="novemberLogoText">BANYU <b>AGUNG</b><small>JOLOTUNDO · MOJOKERTO</small></span>
          </Link>
          <nav className="novemberDesktopNav" aria-label="Navigasi utama">
            {navItems.map(([label, href]) => <a href={href} key={href}>{label}</a>)}
            <Link className="novemberWorkspace" href="/workspace">Workspace ↗</Link>
          </nav>
          <details className="novemberMobileNav">
            <summary aria-label="Buka menu navigasi"><span></span><span></span><span></span></summary>
            <nav aria-label="Navigasi mobile">
              {navItems.map(([label, href]) => <a href={href} key={href}>{label}</a>)}
              <Link href="/workspace">Akses Workspace ↗</Link>
            </nav>
          </details>
        </div>
      </header>

      <main>
        <section className="novemberHero" id="beranda">
          <div className="novemberHeroImage" role="img" aria-label="Aliran air jernih di alam hijau" />
          <div className="novemberHeroShade" />
          <div className="novemberHeroContent">
            <p className="novemberEyebrow">AIR KEMASAN · JOLOTUNDO · MOJOKERTO</p>
            <h1>Kesegaran alam,<br /><em>untuk kehidupan.</em></h1>
            <p>BANYU AGUNG membangun layanan air minum kemasan dengan perhatian pada sumber air, proses produksi, pengendalian mutu, dan pelayanan distribusi.</p>
            <div className="novemberHeroActions">
              <a href="#produk" className="novemberButton">Jelajahi Produk <span>↗</span></a>
              <a href="#tentang" className="novemberTextButton">Kenali Perusahaan <span>↓</span></a>
            </div>
          </div>
          <div className="novemberHeroIndex"><strong>01</strong><span>QUALITY · CARE · TRUST</span></div>
        </section>

        <section className="novemberIntro" id="tentang">
          <div className="novemberSectionNumber">01 <span>/ TENTANG KAMI</span></div>
          <div className="novemberIntroGrid">
            <h2>Air yang baik dimulai dari <em>tanggung jawab.</em></h2>
            <div>
              <p>BANYU AGUNG dipersiapkan sebagai usaha air kemasan yang mengutamakan tata kelola sumber air, proses produksi yang terkendali, transparansi informasi, dan jaringan distribusi yang dapat diandalkan.</p>
              <p className="novemberMuted">Informasi badan usaha, alamat fasilitas, sejarah, kapasitas, dan legalitas akan dilengkapi berdasarkan data resmi perusahaan.</p>
              <a className="novemberInlineLink" href="#mutu">Komitmen mutu kami <span>→</span></a>
            </div>
          </div>
          <div className="novemberIntroRule"><span></span><span>JOLOTUNDO, MOJOKERTO · JAWA TIMUR</span></div>
        </section>

        <section className="novemberProducts" id="produk">
          <div className="novemberSectionHeading">
            <div><div className="novemberSectionNumber">02 <span>/ PRODUK & LAYANAN</span></div><h2>Solusi untuk kebutuhan <em>setiap hari.</em></h2></div>
            <p>Solusi air minum untuk pelanggan, pelaku usaha, dan mitra distribusi.</p>
          </div>
          <div className="novemberProductGrid">
            {products.map((product) => <article className="novemberProductCard" key={product.number}>
              <div className="novemberProductVisual">
                <span className="novemberCardNumber">{product.number}</span>
                <div className={`novemberWaterShape novemberWaterShape${product.number}`}><i></i></div>
                <span className="novemberProductWord">BANYU AGUNG</span>
              </div>
              <div className="novemberProductBody"><h3>{product.title}</h3><p>{product.text}</p><small>{product.note}</small></div>
            </article>)}
          </div>
        </section>

        <section className="novemberGallery" id="galeri">
          <div className="novemberSectionHeading">
            <div><div className="novemberSectionNumber">03 <span>/ GALERI</span></div><h2>Alam, air, dan <em>proses.</em></h2></div>
            <p>Materi visual ilustratif. Dokumentasi sumber, produk, dan fasilitas resmi akan ditampilkan setelah tersedia.</p>
          </div>
          <div className="novemberGalleryGrid">
            {gallery.map((item, index) => <figure className={`novemberGalleryItem novemberGalleryItem${index + 1}`} key={item.title}>
              <div className="novemberGalleryPhoto"><img src={item.src} alt={item.alt} loading="lazy" /></div>
              <figcaption><span>0{index + 1} / VISUAL STORY</span><strong>{item.title}</strong><small>{item.text}</small></figcaption>
            </figure>)}
          </div>
          <p className="novemberImageNote">Foto ilustrasi: Unsplash. Gambar bukan bukti sumber air, hasil produksi, atau fasilitas milik BANYU AGUNG.</p>
          <div className="novemberVideoBand">
            <div><span className="novemberEyebrow">VIDEO / REFERENSI VISUAL</span><h3>Menampilkan cerita air dengan lebih dekat.</h3><p>Footage bertema mata air, aliran air, dan alam dapat dipilih dari pustaka berlisensi dengan menyimpan halaman sumber dan bukti lisensinya.</p></div>
            <div className="novemberVideoLinks">
              <a href="https://www.pexels.com/video/peaceful-forest-stream-with-waterfall-33105917/" target="_blank" rel="noreferrer">Pexels · Aliran mata air di hutan ↗</a>
              <a href="https://www.pexels.com/video/water-stream-among-trees-11911387/" target="_blank" rel="noreferrer">Pexels · Aliran air di antara pepohonan ↗</a>
              <a href="https://pixabay.com/videos/waterflow-waterfall-spring-water-373001/" target="_blank" rel="noreferrer">Pixabay · Mata air di hutan hujan ↗</a>
            </div>
          </div>
        </section>

        <section className="novemberQuality" id="mutu">
          <div className="novemberQualityPhoto" role="img" aria-label="Ilustrasi air jernih" />
          <div className="novemberQualityContent">
            <div className="novemberSectionNumber">04 <span>/ MUTU & TANGGUNG JAWAB</span></div>
            <h2>Kepercayaan harus <em>dibuktikan.</em></h2>
            <p>Informasi kualitas air, proses pengolahan, sanitasi, dan pengujian laboratorium akan disampaikan secara transparan berdasarkan dokumen yang sah dan hasil uji terkini.</p>
            <div className="novemberQualityPoints"><span><b>01</b> Informasi terverifikasi</span><span><b>02</b> Pengujian terdokumentasi</span><span><b>03</b> Transparansi kepada pelanggan</span></div>
            <p className="novemberMuted">Publikasi parameter mutu hanya dilakukan setelah verifikasi laporan laboratorium, metode uji, tanggal sampling, dan kesesuaian regulasi.</p>
          </div>
        </section>

        <section className="novemberPartner" id="mitra">
          <div className="novemberSectionNumber">05 <span>/ KEMITRAAN</span></div>
          <h2>Tumbuh bersama dalam<br /><em>jaringan distribusi.</em></h2>
          <p>Terbuka untuk diskusi kerja sama toko, reseller, agen, distributor, dan kebutuhan institusi.</p>
          <a className="novemberButton novemberButtonDark" href="mailto:akvisomr@gmail.com?subject=Kemitraan%20BANYU%20AGUNG">Diskusikan Kemitraan <span>↗</span></a>
        </section>

        <section className="novemberContact" id="kontak">
          <div className="novemberContactIntro"><div className="novemberSectionNumber">06 <span>/ KONTAK RESMI</span></div><h2>Mari mulai <em>percakapan.</em></h2><p>Untuk informasi produk, pemesanan, kemitraan, dan layanan pelanggan, hubungi tim BANYU AGUNG.</p><a href="mailto:akvisomr@gmail.com">akvisomr@gmail.com ↗</a></div>
          <div className="novemberContactList">{contacts.map((contact, index) => <a href={contact.href} target="_blank" rel="noreferrer" key={contact.phone}><span>0{index + 1} / WHATSAPP</span><strong>{contact.phone}</strong><small>Mulai percakapan ↗</small></a>)}</div>
        </section>
      </main>

      <footer className="novemberFooter">
        <Link href="/" className="novemberLogo"><span className="novemberLogoMark">BA</span><span className="novemberLogoText">BANYU <b>AGUNG</b><small>JOLOTUNDO · MOJOKERTO</small></span></Link>
        <p>Air Kemasan Jolotundo · Mojokerto, Jawa Timur</p>
        <small>© {new Date().getFullYear()} BANYU AGUNG. Informasi perusahaan dan produk diperbarui setelah verifikasi data resmi.</small>
        <Link href="/workspace">Akses Workspace ↗</Link>
      </footer>
    </div>
  );
}
