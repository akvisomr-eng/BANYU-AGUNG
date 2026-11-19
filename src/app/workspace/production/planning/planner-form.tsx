"use client";

import { useMemo, useState } from "react";
import { createProductionBatch } from "../actions";

type BOM = { id: string; sku: string; product_name: string; version: string; output_quantity: string | number; unit_code: string | null };
type Line = { id: string; code: string; name: string; site_name: string };
type Material = { bom_id: string; sku: string; name: string; quantity_per_bom: string | number; scrap_factor: string | number; unit_code: string | null; available_quantity: string | number };

const fmt = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(value);

export function ProductionPlannerForm({ boms, lines, materials }: { boms: BOM[]; lines: Line[]; materials: Material[] }) {
  const [bomId, setBomId] = useState("");
  const [plannedQuantity, setPlannedQuantity] = useState("");
  const selected = boms.find((bom) => bom.id === bomId);
  const amount = Number(plannedQuantity);
  const requirements = useMemo(() => {
    if (!selected || !Number.isFinite(amount) || amount <= 0) return [];
    const output = Number(selected.output_quantity);
    if (!Number.isFinite(output) || output <= 0) return [];
    return materials.filter((item) => item.bom_id === selected.id).map((item) => {
      const perBom = Number(item.quantity_per_bom);
      const scrap = Number(item.scrap_factor);
      const needed = amount / output * perBom * (1 + scrap);
      const available = Number(item.available_quantity);
      return { ...item, needed, available, shortage: Math.max(0, needed - available), sufficient: available >= needed };
    });
  }, [selected, amount, materials]);
  const hasShortage = requirements.some((item) => !item.sufficient);

  return (
    <section className="metric" style={{ marginBottom: 28 }}>
      <h2 style={{ marginTop: 0 }}>Detail rencana produksi</h2>
      <form action={createProductionBatch} className="authForm" style={{ maxWidth: 760 }}>
        <label htmlFor="bom_id">Produk jadi & versi BOM</label>
        <select id="bom_id" name="bom_id" required value={bomId} onChange={(event) => setBomId(event.target.value)}>
          <option value="">Pilih BOM yang disetujui</option>
          {boms.map((bom) => <option key={bom.id} value={bom.id}>{bom.sku} · {bom.product_name} — BOM {bom.version} (standar {fmt(Number(bom.output_quantity))} {bom.unit_code ?? "unit"})</option>)}
        </select>
        <label htmlFor="production_line_id">Lini produksi</label>
        <select id="production_line_id" name="production_line_id" required defaultValue="">
          <option value="" disabled>Pilih lini aktif</option>
          {lines.map((line) => <option key={line.id} value={line.id}>{line.code} · {line.name} — {line.site_name}</option>)}
        </select>
        <label htmlFor="planned_quantity">Jumlah rencana (satuan dasar produk)</label>
        <input id="planned_quantity" name="planned_quantity" type="number" min="0.0001" max="1000000000" step="0.0001" required value={plannedQuantity} onChange={(event) => setPlannedQuantity(event.target.value)} placeholder="Contoh: 1000" />
        <label htmlFor="planned_start">Jadwal mulai (opsional)</label>
        <input id="planned_start" name="planned_start" type="datetime-local" />
        <button type="submit" className="primary">Simpan rencana batch</button>
      </form>

      {selected && (
        <div style={{ marginTop: 24 }}>
          <h3>Estimasi kebutuhan bahan</h3>
          <p className="muted">Perhitungan memakai kuantitas BOM, output standar BOM, dan faktor scrap. Stok tersedia dihitung dari stok fisik dikurangi reservasi pada gudang bahan baku dan kemasan yang aktif. Ini pemeriksaan indikatif, bukan reservasi atau jaminan stok saat eksekusi.</p>
          {requirements.length === 0 ? (
            <p className="setupNotice">BOM ini belum memiliki komponen bahan. Periksa kelengkapan BOM sebelum batch dijadwalkan.</p>
          ) : (
            <>
              <div className="inventoryTableWrap">
                <table className="inventoryTable">
                  <thead><tr><th>Bahan / SKU</th><th>Kebutuhan estimasi</th><th>Stok tersedia</th><th>Selisih</th><th>Kesiapan</th></tr></thead>
                  <tbody>{requirements.map((item) => <tr key={item.sku}>
                    <td><strong>{item.name}</strong><small>{item.sku}</small></td>
                    <td>{fmt(item.needed)} {item.unit_code ?? ""}</td>
                    <td>{fmt(item.available)} {item.unit_code ?? ""}</td>
                    <td>{item.shortage > 0 ? fmt(item.shortage) : "—"} {item.shortage > 0 ? item.unit_code ?? "" : ""}</td>
                    <td><strong>{item.sufficient ? "Cukup (indikatif)" : "Potensi kurang"}</strong></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <p className={hasShortage ? "authError" : "authSuccess"} role="status">
                {hasShortage ? "Ada bahan dengan potensi kekurangan. Tinjau pembelian atau jadwal sebelum produksi." : "Seluruh komponen memiliki stok indikatif yang mencukupi untuk jumlah rencana ini."}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
