import Link from "next/link";
import { createInquiry } from "./actions";

export const metadata = {
  title: "Kirim Permintaan | BANYU AGUNG",
  description: "Hubungi tim BANYU AGUNG untuk informasi produk, pemesanan, kemitraan, dan layanan pelanggan.",
};

export default async function InquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; jenis?: string }>;
}) {
  const params = await searchParams;
  const initialType = params.jenis === "kemitraan" ? "partnership" : "product_info";

  return (
    <main className="authPage">
      <section className="authCard inquiryCard">
        <Link href="/" className="authBrand">BANYU <span>AGUNG</span></Link>
        <p className="novemberSectionNumber">LAYANAN PELANGGAN / JOLOTUNDO</p>
        <h1>Kami siap mendengarkan.</h1>
        <p className="authIntro">Sampaikan kebutuhan Anda. Tim BANYU AGUNG dapat menindaklanjuti permintaan informasi produk, pemesanan, kemitraan, maupun layanan pelanggan.</p>

        {params.sent === "1" && (
          <p className="authSuccess" role="status">Permintaan berhasil dikirim. Tim BANYU AGUNG akan menindaklanjuti melalui kontak yang Anda pilih.</p>
        )}
        {params.error === "invalid" && (
          <p className="authError" role="alert">Periksa kembali isian, nomor telepon, pesan, dan persetujuan privasi.</p>
        )}
        {params.error === "rate" && (
          <p className="authError" role="alert">Permintaan serupa baru saja diterima. Silakan tunggu beberapa menit sebelum mengirim kembali.</p>
        )}
        {params.error === "save" && (
          <p className="authError" role="alert">Permintaan belum dapat disimpan. Silakan coba kembali atau hubungi kami melalui WhatsApp.</p>
        )}

        <form action={createInquiry} className="authForm inquiryForm">
          <label htmlFor="inquiry_type">Keperluan</label>
          <select id="inquiry_type" name="inquiry_type" defaultValue={initialType} required>
            <option value="product_info">Informasi produk</option>
            <option value="order">Pemesanan / permintaan penawaran</option>
            <option value="partnership">Kemitraan / distribusi</option>
            <option value="complaint">Layanan pelanggan / keluhan</option>
            <option value="other">Lainnya</option>
          </select>

          <label htmlFor="contact_name">Nama</label>
          <input id="contact_name" name="contact_name" required minLength={2} maxLength={120} autoComplete="name" placeholder="Nama Anda / nama usaha" />

          <label htmlFor="phone">Nomor telepon / WhatsApp</label>
          <input id="phone" name="phone" required minLength={8} maxLength={24} inputMode="tel" autoComplete="tel" placeholder="Contoh: 08xx xxxx xxxx" />

          <label htmlFor="email">Email (opsional)</label>
          <input id="email" name="email" type="email" maxLength={254} autoComplete="email" placeholder="nama@email.com" />

          <label htmlFor="preferred_contact">Cara dihubungi</label>
          <select id="preferred_contact" name="preferred_contact" defaultValue="whatsapp" required>
            <option value="whatsapp">WhatsApp</option>
            <option value="phone">Telepon</option>
            <option value="email">Email</option>
          </select>

          <label htmlFor="message">Pesan / kebutuhan</label>
          <textarea id="message" name="message" required minLength={10} maxLength={2000} rows={5} placeholder="Tuliskan produk, jumlah kebutuhan, lokasi pengiriman, atau pertanyaan Anda." />

          <div className="inquiryHoneypot" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          <label className="inquiryConsent">
            <input type="checkbox" name="consent" required />
            <span>Saya menyetujui data kontak dan pesan ini digunakan BANYU AGUNG untuk menindaklanjuti permintaan saya.</span>
          </label>
          <button className="primary authSubmit" type="submit">Kirim permintaan</button>
        </form>

        <p className="inquiryPrivacy">Data permintaan disimpan secara terbatas untuk tindak lanjut layanan. Jangan kirim kata sandi, data pembayaran, atau informasi pribadi sensitif.</p>
        <p className="authFoot"><Link href="/">← Kembali ke website</Link> · Perlu bantuan langsung? <a href="https://wa.me/6285136522392" target="_blank" rel="noreferrer">Hubungi WhatsApp</a></p>
      </section>
    </main>
  );
}
