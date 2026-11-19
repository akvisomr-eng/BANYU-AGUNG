"use client";
import Link from "next/link";
import { createProductionBatch } from "../actions";

export default function ProductionPlanningPage() {
  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">OPERATIONS</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideLink" href="/workspace/production">Kontrol Produksi</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader">
          <div><p className="eyebrow">BANYU AGUNG / OPERATIONS</p><h1>Rencana Batch Produksi</h1>
          <p className="muted">Pencatatan rencana batch memerlukan BOM yang telah disetujui dan lini produksi aktif.</p></div>
        </header>
        <div className="inventoryNotice">
          Tahap perencanaan ini hanya menyimpan batch berstatus Terencana. Belum ada pengeluaran bahan, perubahan stok,
          perintah mulai produksi, hasil produksi, atau jurnal akuntansi.
        </div>
        <p className="workspaceFoot"><Link href="/workspace/production">← Kembali ke kontrol produksi</Link></p>
        <p className="muted">Form perencanaan tersedia dari halaman kontrol produksi setelah data BOM dan lini diverifikasi.</p>
      </section>
    </main>
  );
}
