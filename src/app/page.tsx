import Link from "next/link";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "./workspace/sign-out-button";

export const dynamic = "force-dynamic";

const products = [
  { number: "01", title: "Air Minum Kemasan", text: "Pilihan air minum kemasan untuk kebutuhan rumah tangga, usaha, dan institusi.", note: "Varian dan ukuran mengikuti katalog resmi" },
  { number: "02", title: "Kemasan Galon", text: "Solusi kebutuhan air minum berulang untuk pelanggan, kantor, dan mitra.", note: "Ketersediaan dikonfirmasi oleh tim penjualan" },
  { number: "03", title: "Kemitraan Distribusi", text: "Peluang kerja sama bagi toko, reseller, agen, dan distributor.", note: "Wilayah layanan dikonfirmasi saat pendaftaran" },
];

const gallery = [
  {
    title: "Aliran air di alam Indonesia",
    text: "Inspirasi visual tentang alam dan aliran air; bukan lokasi sumber produksi BANYU AGUNG.",
    src: "https://images.unsplash.com/photo-1725183514517-079893b5ab50?auto=format&fit=crop&w=1400&q=85",
    alt: "Aliran sungai jernih di tengah hutan hijau",
    credit: "Walyudin",
    source: "https://unsplash.com/photos/a-stream-running-through-a-lush-green-forest-Pgf1bvKH6Mw",
  },
  {
    title: "Air minum yang menyegarkan",
    text: "Foto ilustrasi air minum dalam botol dan gelas; bukan foto produk resmi.",
    src: "https://images.unsplash.com/photo-1639256150782-ecdb00b01e84?auto=format&fit=crop&w=1100&q=85",
    alt: "Botol air dan gelas berisi air minum",
    credit: "Greg Rosenke",
    source: "https://unsplash.com/photos/a-bottle-of-water-next-to-a-glass-of-water-hpHM0OlOHT0",
  },
  {
    title: "Kemasan air minum",
    text: "Foto ilustrasi kemasan air; bukan desain atau merek dagang produk BANYU AGUNG.",
    src: "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1100&q=85",
    alt: "Botol bening berisi air minum dengan pencahayaan alami",
    credit: "Steve A Johnson",
    source: "https://unsplash.com/photos/clear-drinking-bottle-filled-with-water-N-MqWXXZvNY",
  },
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

export default async function Home() {
  const { data: session } = await auth.getSession();
  let account: { full_name: string; role_name: string } | null = null;
  if (session?.user) {
    const { sql } = await import("@/lib/db");
    const rows = await sql`SELECT p.full_name, r.name AS role_name FROM user_profiles p JOIN user_role_assignments ura ON ura.user_id = p.id JOIN roles r ON r.id = ura.role_id WHERE p.auth_subject = ${session.user.id} AND p.status = 'active' ORDER BY r.code LIMIT 1`;
    account = (rows[0] as { full_name: string; role_name: string } | undefined) ?? null;
  }
  return (
    <div className="novemberSite">
      <header className="novemberHeader">
        <div className="novemberHeaderInner">
          <Link href="/" className="novemberLogo novemberHeritageLogo" aria-label="BANYU AGUNG – AIR MINUM JOLOTUNDO beranda">
            <span className="novemberLogoMark" aria-hidden="true"><img src="/images/banyu-agung-surya-air-emblem.svg" alt="" /></span>
            <span className="novemberLogoText"><strong>BANYU AGUNG</strong><span className="novemberJavanese" lang="jv">ꦧꦚꦸ ꦲꦒꦸꦁ</span><small>AIR MINUM JOLOTUNDO</small></span>
          </Link>
          <nav className="novemberDesktopNav" aria-label="Navigasi utama">
            {navItems.map(([label, href]) => <a href={href} key={href}>{label}</a>)}
              {session?.user ? <>{account && <a href="/workspace">Dashboard · {account.role_name}</a>}<a href="/auth/sign-in">Kelola akun / Sign Out</a></> : <Link href="/auth/sign-in">Sign In / Masuk</Link>}
          </nav>
          <div className="novemberAccountNav">
            {session?.user ? <>{account ? <><span className="novemberAccountIdentity">{account.full_name} · {account.role_name}</span><Link className="novemberAccountLink" href="/workspace">Dashboard</Link></> : <span className="novemberAccountIdentity">Akun menunggu aktivasi peran</span>}<SignOutButton /></> : <Link className="novemberAccountLink" href="/auth/sign-in">Sign In</Link>}
          </div>
          <details className="novemberMobileNav">
            <summary aria-label="Buka menu navigasi"><span></span><span></span><span></span></summary>
            <nav aria-label="Navigasi mobile">
              {navItems.map(([label, href]) => <a href={href} key={href}>{label}</a>)}
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
          <div className="novemberHeroIndex"><strong>01</strong><span>QUALITY · CARE · TRUST</span><a href="https://unsplash.com/photos/a-stream-running-through-a-lush-green-forest-Pgf1bvKH6Mw" target="_blank" rel="noreferrer">Foto: Walyudin / Unsplash ↗</a></div>
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
                <img
                  src={product.number === "01" ? "/images/banyu-agung-bottle-concept.svg" : product.number === "02" ? "/images/banyu-agung-gallon-concept.svg" : "/images/banyu-agung-distribution-concept.svg"}
                  alt={product.number === "01" ? "Konsep desain botol BANYU AGUNG" : product.number === "02" ? "Konsep desain galon BANYU AGUNG" : "Ilustrasi kemitraan distribusi BANYU AGUNG"}
                  loading="lazy"
                />
                <span className="novemberProductWord">KONSEP VISUAL</span>
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
              <figcaption><span>0{index + 1} / VISUAL STORY</span><strong>{item.title}</strong><small>{item.text}</small><a className="novemberPhotoCredit" href={item.source} target="_blank" rel="noreferrer">Foto: {item.credit} / Unsplash ↗</a></figcaption>
            </figure>)}
          </div>
          <p className="novemberImageNote">Seluruh foto pada bagian ini merupakan foto stok yang tersedia di bawah Unsplash License. Foto hanya ilustrasi dan bukan dokumentasi sumber air, produk, kemasan, laboratorium, atau fasilitas milik BANYU AGUNG. <a href="https://unsplash.com/license" target="_blank" rel="noreferrer">Baca lisensi Unsplash ↗</a></p>
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
          <a className="novemberButton novemberButtonDark" href="/permintaan?jenis=kemitraan">Diskusikan Kemitraan <span>↗</span></a>
        </section>

        <section className="novemberContact" id="kontak">
          <div className="novemberContactIntro"><div className="novemberSectionNumber">06 <span>/ KONTAK RESMI</span></div><h2>Mari mulai <em>percakapan.</em></h2><p>Untuk informasi produk, pemesanan, kemitraan, dan layanan pelanggan, hubungi tim BANYU AGUNG.</p><a className="novemberContactRequest" href="/permintaan">Kirim permintaan melalui formulir resmi ↗</a><a href="mailto:akvisomr@gmail.com">akvisomr@gmail.com ↗</a></div>
          <div className="novemberContactList">{contacts.map((contact, index) => <a href={contact.href} target="_blank" rel="noreferrer" key={contact.phone}><span>0{index + 1} / WHATSAPP</span><strong>{contact.phone}</strong><small>Mulai percakapan ↗</small></a>)}</div>
        </section>
      </main>

      <footer className="novemberFooter">
        <Link href="/" className="novemberLogo novemberHeritageLogo" aria-label="BANYU AGUNG – AIR MINUM JOLOTUNDO beranda">
          <span className="novemberLogoMark" aria-hidden="true"><img src="/images/banyu-agung-surya-air-emblem.svg" alt="" /></span>
          <span className="novemberLogoText"><strong>BANYU AGUNG</strong><span className="novemberJavanese" lang="jv">ꦧꦚꦸ ꦲꦒꦸꦁ</span><small>AIR MINUM JOLOTUNDO</small></span>
        </Link>
        <p>Air Kemasan Jolotundo · Mojokerto, Jawa Timur</p>
        <small>© {new Date().getFullYear()} BANYU AGUNG. Informasi perusahaan dan produk diperbarui setelah verifikasi data resmi.</small>
      </footer>
    </div>
  );
}
