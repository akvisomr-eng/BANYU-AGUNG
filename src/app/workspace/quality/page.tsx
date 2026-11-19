import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { recordLotInspection } from "./actions";

export const dynamic = "force-dynamic";

type Lot={id:string;lot_code:string;product_sku:string;product_name:string;quality_status:string;received_at:string|null;expires_at:string|null;supplier_name:string|null;warehouse_names:string|null};
type Inspection={inspection_number:string;lot_code:string;product_name:string;result:string;report_reference:string|null;inspected_at:string;inspector_name:string|null};
type BatchQA={batch_number:string;product_sku:string;product_name:string;produced_quantity:string|number;rejected_quantity:string|number;status:string;quality_status:string;test_count:string|number;failed_count:string|number};
type QATest={test_number:string;sample_type:string;sample_point:string;sampled_at:string;batch_number:string|null;lot_code:string|null;product_name:string|null;laboratory_name:string|null;report_reference:string|null;status:string;result_count:string|number;critical_failures:string|number};

const qualityLabels:Record<string,string>={pending:"Menunggu QC",quarantined:"Karantina",released:"Lulus QC",rejected:"Ditolak",expired:"Kedaluwarsa"};

export default async function QualityPage({searchParams}:{searchParams:Promise<{recorded?:string;error?:string}>}) {
  const {data:session}=await auth.getSession();
  if(!session?.user) redirect("/auth/sign-in");
  const {sql}=await import("@/lib/db");
  const actors=await sql`
    SELECT p.organization_id,r.name AS role_name,r.code AS role_code
    FROM user_profiles p JOIN user_role_assignments a ON a.user_id=p.id JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code IN ('OWNER','ADMIN')
    ORDER BY r.code LIMIT 1
  `;
  const actor=actors[0] as {organization_id:string;role_name:string;role_code:string}|undefined;
  if(!actor) redirect("/workspace?access=denied");
  const lots=await sql`
    SELECT l.id,l.lot_code,l.quality_status,l.received_at,l.expires_at,p.sku AS product_sku,p.name AS product_name,
      s.name AS supplier_name,string_agg(DISTINCT w.name, ', ') AS warehouse_names
    FROM inventory_lots l
    JOIN products p ON p.id=l.product_id
    LEFT JOIN suppliers s ON s.id=l.supplier_id
    LEFT JOIN goods_receipt_items gri ON gri.lot_id=l.id
    LEFT JOIN goods_receipts gr ON gr.id=gri.goods_receipt_id
    LEFT JOIN warehouses w ON w.id=gr.warehouse_id
    WHERE l.organization_id=${actor.organization_id}::uuid AND l.quality_status IN ('pending','quarantined')
    GROUP BY l.id,p.sku,p.name,s.name
    ORDER BY l.expires_at NULLS LAST,l.received_at NULLS LAST LIMIT 200
  ` as Lot[];
  const history=await sql`
    SELECT qi.inspection_number,l.lot_code,p.name AS product_name,qi.result,qi.report_reference,qi.inspected_at,up.full_name AS inspector_name
    FROM quality_inspections qi
    JOIN inventory_lots l ON l.id=qi.lot_id
    JOIN products p ON p.id=l.product_id
    LEFT JOIN user_profiles up ON up.id=qi.inspected_by
    WHERE qi.organization_id=${actor.organization_id}::uuid
    ORDER BY qi.inspected_at DESC LIMIT 50
  ` as Inspection[];
  const [batchQA, qaTests] = await Promise.all([
    sql`
      SELECT b.batch_number,p.sku AS product_sku,p.name AS product_name,
        b.produced_quantity,b.rejected_quantity,b.status,b.quality_status,
        count(DISTINCT q.id)::int AS test_count,
        count(DISTINCT q.id) FILTER (WHERE q.status='failed')::int AS failed_count
      FROM production_batches b
      JOIN products p ON p.id=b.product_id
      LEFT JOIN qa_tests q ON q.batch_id=b.id
      WHERE b.organization_id=${actor.organization_id}::uuid
        AND b.status IN ('completed','quality_hold')
      GROUP BY b.id,p.sku,p.name
      ORDER BY b.completed_at DESC NULLS LAST,b.created_at DESC
      LIMIT 30
    `,
    sql`
      SELECT q.test_number,q.sample_type,q.sample_point,q.sampled_at,q.status,
        q.laboratory_name,q.report_reference,b.batch_number,l.lot_code,p.name AS product_name,
        count(r.id)::int AS result_count,
        count(r.id) FILTER (WHERE qp.is_critical=true AND r.within_limit=false)::int AS critical_failures
      FROM qa_tests q
      LEFT JOIN production_batches b ON b.id=q.batch_id AND b.organization_id=q.organization_id
      LEFT JOIN inventory_lots l ON l.id=q.lot_id AND l.organization_id=q.organization_id
      LEFT JOIN products p ON p.id=coalesce(b.product_id,l.product_id)
      LEFT JOIN qa_test_results r ON r.qa_test_id=q.id
      LEFT JOIN qa_parameters qp ON qp.id=r.parameter_id
      WHERE q.organization_id=${actor.organization_id}::uuid
      GROUP BY q.id,b.batch_number,l.lot_code,p.name
      ORDER BY q.sampled_at DESC
      LIMIT 50
    `
  ]) as [BatchQA[], QATest[]];
  const params=await searchParams;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">QUALITY CONTROL</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideActive" href="/workspace/quality">Pemeriksaan lot</Link>
        <Link className="sideLink" href="/workspace/inventory">Inventory</Link>
        <Link className="sideLink" href="/workspace/goods-receipts">Goods Receipts</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / QUALITY</p><h1>Pemeriksaan Mutu Lot</h1><p className="muted">Pencatatan hasil pemeriksaan berdasarkan dokumen nyata · {actor.role_name}</p></div><SignOutButton /></header>
        {params.recorded==="1" && <p className="authSuccess" role="status">Hasil pemeriksaan berhasil dicatat. Status lot telah diperbarui.</p>}
        {params.error && <p className="authError" role="alert">{params.error==="invalid" ? "Isi hasil, referensi laporan, dan catatan pemeriksaan dengan benar." : "Pemeriksaan tidak dapat disimpan. Lot mungkin sudah diproses atau hak akses tidak mencukupi."}</p>}
        <div className="inventoryNotice">Tidak ada ambang pH, TDS, mikrobiologi, atau standar kelayakan yang ditetapkan otomatis. Pelepasan lot hanya dilakukan berdasarkan pemeriksaan dan dokumen mutu aktual. Pelepasan status ini bukan pengganti izin edar atau sertifikasi resmi.</div>
        <div className="metricGrid">
          <article className="metric"><span>Menunggu pemeriksaan</span><strong>{lots.filter(l=>l.quality_status==="pending").length}</strong><small>Lot baru diterima</small></article>
          <article className="metric"><span>Karantina</span><strong>{lots.filter(l=>l.quality_status==="quarantined").length}</strong><small>Perlu tindak lanjut</small></article>
          <article className="metric"><span>Riwayat pemeriksaan</span><strong>{history.length}</strong><small>Maksimal 50 catatan terbaru</small></article>
          <article className="metric"><span>Hak pelepasan</span><strong className="metricText">{actor.role_code==="OWNER"?"OWNER":"TERBATAS"}</strong><small>Hanya OWNER yang dapat meluluskan lot</small></article>
        </div>
        <h2>Quality Assurance Produksi</h2>
        <p className="muted">Pantau batch selesai/tertahan, pengujian sampel, hasil parameter, dan temuan kritis. Status QC batch tidak diubah dari panel pemantauan ini.</p>
        <div className="metricGrid">
          <article className="metric"><span>Batch menunggu keputusan QC</span><strong>{batchQA.filter(b=>b.quality_status==="pending").length}</strong><small>Batch selesai / ditahan dengan status pending</small></article>
          <article className="metric"><span>Pengujian laboratorium</span><strong>{qaTests.length}</strong><small>Maksimal 50 pengujian terbaru</small></article>
          <article className="metric"><span>Pengujian gagal</span><strong>{qaTests.filter(t=>t.status==="failed").length}</strong><small>Perlu evaluasi dan tindak lanjut</small></article>
          <article className="metric"><span>Temuan parameter kritis</span><strong>{qaTests.reduce((n,t)=>n+Number(t.critical_failures),0)}</strong><small>Nilai di luar batas parameter kritis</small></article>
        </div>
        <h3>Batch produksi menunggu keputusan</h3>
        {batchQA.length===0 ? <article className="moduleCard"><small>Belum ada batch selesai atau tertahan yang memerlukan pemantauan QA.</small></article> :
          <div className="orderList">{batchQA.map(b=><article className="orderItem" key={b.batch_number}>
            <div><span className="inquiryType">{b.batch_number} · {b.quality_status==="pending"?"Menunggu keputusan":b.quality_status==="released"?"Lulus QA":"Ditolak QA"}</span>
              <h3>{b.product_sku} · {b.product_name}</h3>
              <small>Hasil {Number(b.produced_quantity).toLocaleString("id-ID")} · Reject {Number(b.rejected_quantity).toLocaleString("id-ID")} · {b.test_count} pengujian · {b.failed_count} gagal</small>
            </div>
          </article>)}</div>
        }
        <h3>Pengujian sampel terbaru</h3>
        {qaTests.length===0 ? <article className="moduleCard"><small>Belum ada pengujian QA yang ditautkan ke lot atau batch.</small></article> :
          <div className="orderList">{qaTests.map(t=><article className="orderItem" key={t.test_number}>
            <div><span className="inquiryType">{t.test_number} · {t.status}</span>
              <h3>{t.sample_point} · {t.sample_type}</h3>
              <small>{t.batch_number??t.lot_code??"Sampel belum ditautkan"} · {t.product_name??"Produk belum diketahui"} · {new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(t.sampled_at))}</small>
              <small>{t.laboratory_name??"Laboratorium belum dicatat"} · {t.report_reference??"Referensi laporan belum dicatat"} · {t.result_count} parameter · {t.critical_failures} temuan kritis</small>
            </div>
          </article>)}</div>
        }
        <h2>Lot menunggu pemeriksaan</h2>
        {lots.length===0 ? <article className="moduleCard"><strong>Tidak ada lot yang menunggu pemeriksaan</strong><small>Lot baru akan muncul setelah penerimaan barang diposting.</small></article> :
          <div className="qualityList">{lots.map(lot=><article className="qualityItem" key={lot.id}>
            <div className="qualityItemHead"><div><span className="inquiryType">{lot.lot_code} · {qualityLabels[lot.quality_status]}</span><h3>{lot.product_sku} · {lot.product_name}</h3><small>{lot.supplier_name??"Pemasok tidak tercatat"} · {lot.warehouse_names??"Gudang belum diketahui"}</small></div><span className="inquiryStatus inquiryStatus-new">{lot.expires_at ? "Exp " + new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeZone:"Asia/Jakarta"}).format(new Date(lot.expires_at)) : "Tanpa tanggal kedaluwarsa"}</span></div>
            <form action={recordLotInspection} className="authForm qualityForm">
              <input type="hidden" name="lot_id" value={lot.id}/>
              <label>Hasil pemeriksaan</label>
              <select name="result" defaultValue="quarantined">
                <option value="quarantined">Karantina / perlu pemeriksaan ulang</option>
                <option value="rejected">Tolak lot</option>
                <option value="expired">Kedaluwarsa</option>
                {actor.role_code==="OWNER" && <option value="released">Lulus QC (OWNER)</option>}
              </select>
              <label>Referensi laporan / dokumen (wajib untuk lulus QC)</label><input name="report_reference" maxLength={160} placeholder="Nomor sertifikat / hasil uji / dokumen internal" />
              <label>Catatan pemeriksaan</label><textarea name="notes" rows={3} minLength={10} maxLength={2000} required placeholder="Catat kondisi fisik, dokumen yang diperiksa, temuan dan tindak lanjut."/>
              <button className="primary authSubmit" type="submit">Simpan hasil pemeriksaan</button>
            </form>
          </article>)}</div>
        }
        <h2>Riwayat pemeriksaan</h2>
        {history.length===0 ? <article className="moduleCard"><small>Belum ada hasil pemeriksaan yang dicatat.</small></article> :
          <div className="orderList">{history.map(h=><article className="orderItem" key={h.inspection_number}><div><span className="inquiryType">{h.inspection_number} · {qualityLabels[h.result]??h.result}</span><h3>{h.lot_code} · {h.product_name}</h3><small>{h.report_reference??"Tanpa referensi dokumen"} · {new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(h.inspected_at))} · {h.inspector_name??"Petugas"}</small></div></article>)}</div>
        }
        <p className="workspaceFoot"><Link href="/workspace/inventory">Kembali ke posisi stok</Link> · Lot lulus QC baru dihitung sebagai stok siap tersedia.</p>
      </section>
    </main>
  );
}
