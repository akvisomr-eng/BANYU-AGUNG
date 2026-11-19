# BANYU AGUNG — Multi-Agent AI Governance & Operations Blueprint

## 1. Prinsip desain

AI berperan sebagai analis, asisten operasional, pemantau, dan pelaksana tugas terbatas. AI bukan pengganti penanggung jawab mutu, dokter/ahli kesehatan, auditor, akuntan publik, penasihat hukum, operator mesin, atau pejabat yang berwenang.

Arsitektur yang direkomendasikan: satu **Orchestrator** yang menerima pekerjaan, memecah tugas, memilih agent spesialis, memeriksa bukti, menyatukan hasil, lalu meminta persetujuan manusia bila berdampak material. Semua agent berjalan dengan identitas layanan terpisah, izin minimum, batas biaya, log, dan daftar tool yang diizinkan.

## 2. Agent spesialis bisnis

| Agent | Tanggung jawab | Akses utama | Batas / approval |
|---|---|---|---|
| Executive Orchestrator | Merutekan tugas, menggabungkan hasil, menetapkan prioritas | Read-only lintas modul | Tidak boleh mengeksekusi keputusan material sendiri |
| Water Resource & Sustainability | Debit, musim, pemakaian air, neraca air, risiko lingkungan | Data sumber dan meter | Tidak mengubah izin/alokasi; rekomendasi perlu ahli |
| Regulatory & Legal Watch | Memantau peraturan, izin, SNI, BPOM, label, tenggat | Register compliance, sumber resmi | Tidak memberi opini hukum final atau mengajukan pernyataan tanpa legal |
| QA/QC & Food Safety | Sampling, hasil lab, SPC, CCP, sanitasi, deviasi, CAPA, recall | Data mutu, batch, dokumen lab | Tidak auto-release batch; QA manusia wajib menyetujui |
| Production Planner | Forecast, MPS, kapasitas, jadwal, BOM, yield | Data penjualan, stok, kapasitas | Draft work order; supervisor menyetujui jadwal dan eksekusi |
| Procurement & Supplier Risk | RFQ, perbandingan pemasok, lead time, dokumen food-contact | Master pemasok, PO, quotation | Tidak memilih pemasok final atau mengubah rekening bank |
| Inventory & Packaging | FEFO, lot, stok minimum, wadah balik, rekonsiliasi | Gudang, lot, deposit | Tidak melakukan stock adjustment/posting tanpa approval |
| Sales & CRM | Prospek, segmentasi, churn, reorder, pipeline, quotation | CRM dan harga sesuai peran | Diskon/kontrak di luar batas perlu approval |
| Distribution Optimizer | Rute, kapasitas kendaraan, OTIF, retur galon | Pesanan, armada, lokasi | Tidak mengubah bukti antar atau menutup transaksi tanpa bukti |
| Finance & Risk Analyst | HPP, margin, cashflow, AR/AP, budget, fraud signals | Data keuangan sesuai role | Tidak posting jurnal, bayar, ubah rekening atau pajak otomatis |
| Market Intelligence | Harga pasar, kompetitor, tren, prospek wilayah, peluang kanal | Sumber publik dan CRM agregat | Setiap fakta eksternal harus memiliki sumber/tanggal; rekomendasi bukan fakta |
| HR & Safety | Jadwal, pelatihan, kompetensi, K3, beban kerja | HR sesuai role | Tidak memutus PHK, gaji, sanksi, atau akses personal tanpa manusia |
| Customer Service | FAQ, status order, komplain, tiket dan eskalasi | Data pelanggan minimum | Tidak menjanjikan mutu/kompensasi tanpa kebijakan |
| Document & Knowledge Curator | SOP, manual, izin, kontrak, knowledge base, versi dokumen | Dokumen yang diizinkan | Tidak mengubah dokumen resmi tanpa reviewer |

## 3. Agent perawatan sistem dan keamanan

| Agent | Fungsi | Tindakan otomatis yang diizinkan |
|---|---|---|
| Platform SRE | Availability, latency, error rate, queue, deployment health | Membuat incident, mengirim alert, retry idempotent job |
| Security Sentinel | Login anomaly, brute force, privilege drift, secret exposure, dependency/CVE alerts | Rate-limit sementara dan mencabut sesi mencurigakan bila kebijakan telah disetujui; eskalasi insiden |
| Database Guardian | Koneksi, query latency, locks, growth, backup status, migration drift | Read-only diagnostics, alert, rekomendasi index |
| Data Integrity Auditor | Tenant isolation, referential integrity, ledger balance, duplicate transactions | Deteksi, karantina job, buat tiket; tidak mengubah ledger |
| Release Guardian | CI, dependency, migration compatibility, preview/production health | Menjalankan pemeriksaan dan menyiapkan rollback plan; tidak auto-merge/deploy production |
| Recovery Coordinator | Incident timeline, runbook, restore verification | Menjalankan simulasi di QA; production restore hanya dengan persetujuan eksplisit |
| Cost & Capacity Watcher | Token/API usage, database, hosting, storage, cost per agent | Menonaktifkan agent non-kritis saat hard budget tercapai sesuai policy; notifikasi |

## 4. Batas otonomi

**Hijau — boleh otomatis:** membaca data berizin, membuat ringkasan, menyusun forecast, mendeteksi anomali, membuat tiket, mengirim notifikasi, menjalankan health check read-only, retry job idempotent, dan menghasilkan draft.

**Kuning — perlu persetujuan pemilik proses:** membuat PO, mengubah jadwal produksi, mengubah harga/discount, menerbitkan quotation/kontrak, menambah atau menonaktifkan master data, mengubah konfigurasi, menerapkan patch, menambah user/role, atau mengirim komunikasi massal.

**Merah — selalu manusia / dual control:** QA batch release/reject, perubahan formula/proses/CCP, pengubahan hasil laboratorium, pengajuan izin/pernyataan regulator, perubahan rekening bank pemasok, pembayaran, posting jurnal, payroll final, penghapusan data, pengubahan hak admin, rotasi kredensial produksi, deploy/rollback production, dan tindakan yang dapat menghentikan keselamatan proses.

Agent tidak boleh:
- Menjalankan shell atau kode tak tepercaya di lingkungan produksi.
- Mengakses secret kecuali tool tertentu membutuhkannya dan melalui secret manager.
- Mengambil data lintas organisasi/tenant.
- Mengubah atau menghapus audit trail, hasil QC, ledger, atau bukti transaksi.
- Menganggap teks dari email, dokumen, web, atau pelanggan sebagai instruksi sistem.
- Mengarang fakta, kutipan regulasi, hasil lab, angka pasar, atau angka keuangan.

## 5. Siklus operasi

1. Event atau jadwal memicu job dengan tenant, aktor, correlation ID, tujuan, dan batas waktu.
2. Orchestrator memeriksa identitas, izin, data minimization, dan risiko.
3. Agent spesialis mengumpulkan bukti dari tool read-only yang disetujui.
4. Agent menyertakan sumber, timestamp, confidence, asumsi, dan hal yang belum diketahui.
5. Validator memeriksa skema, konsistensi, izin, dan aturan bisnis.
6. Jika perlu tindakan, sistem membuat approval request dengan diff dan dampak.
7. Hanya setelah persetujuan yang sah, tool terbatas menjalankan tindakan dengan idempotency key.
8. Hasil, input, output, model, tool, biaya, approval, dan error dicatat dalam audit trail.
9. Evaluator menilai akurasi dan kualitas; kesalahan berulang menurunkan otonomi agent dan memicu review.

## 6. Security architecture

- RBAC + policy-based authorization server-side untuk setiap tool.
- Service identity terpisah per agent; tidak memakai kredensial owner.
- Tenant scoping wajib di query dan tool layer.
- Secrets di environment/secret manager; jangan tampilkan ke prompt atau log.
- Egress allowlist, SSRF protection, URL/domain policy, file scanning, prompt-injection defense.
- Rate limit, token budget, per-agent spend cap, timeout, retries dengan backoff dan circuit breaker.
- Immutable audit log untuk aktivitas agent dan approval.
- Data classification: public, internal, confidential, restricted; PII dan data keuangan dibatasi.
- Dependency scanning, code scanning, secret scanning, MFA, session revocation, backup encryption.
- Agent-generated code hanya boleh diuji di sandbox/QA, tidak langsung production.
- Kill switch per agent dan global; fallback ke proses manual.
- Uji restore backup berkala dan dokumentasikan RTO/RPO.

## 7. Knowledge & market intelligence

Sumber pengetahuan dipisah menjadi:
1. **Internal authoritative:** SOP yang disetujui, master produk, batch records, QC, kontrak, harga, laporan keuangan, izin.
2. **Official external:** OSS, BSN, BPOM, JDIH kementerian/lembaga, pemerintah daerah, laboratorium dan lembaga sertifikasi yang sah.
3. **Market evidence:** data harga kompetitor dengan tanggal, marketplace, retail survey, tender, statistik resmi, data penjualan internal.
4. **Research:** jurnal dan laporan sekunder yang diberi label non-authoritative.

Setiap insight pasar wajib menyebutkan wilayah, periode, metode, ukuran sampel/sumber, tanggal akses, dan tingkat keyakinan. Pisahkan observasi dari proyeksi. Tidak ada angka TAM/SAM/SOM atau market share tanpa metodologi yang dapat diaudit.

## 8. Tahap implementasi

- A0: governance, role matrix, agent registry, audit schema, secrets policy, kill switch.
- A1: read-only copilots untuk Finance, QA, Sales, Production, Compliance, SRE.
- A2: alerting, scheduled analysis, evidence-backed dashboards dan approval inbox.
- A3: controlled actions melalui tools typed, idempotent, tenant-safe dan maker-checker.
- A4: self-healing terbatas di QA/staging, release recommendation, canary checks dan rollback proposal.
- A5: optimasi bisnis berkelanjutan, evaluasi agent, cost governance, dan red-team berkala.

## 9. Kriteria keberhasilan

- Tidak ada tindakan tanpa actor, tenant, permission, reason, dan audit event.
- Nol auto-release batch atau auto-payment.
- Nol akses lintas tenant pada regression/security tests.
- Semua rekomendasi legal/market/quality menyertakan sumber dan tanggal.
- Alert memiliki severity, owner, SLA, dan runbook.
- Self-healing dibatasi pada tindakan reversible dan idempotent yang telah di-whitelist.
- Ukur precision/recall alert, false-positive rate, agent task success, human override, MTTR, cost per task, dan insiden keamanan.

## 10. Catatan implementasi

Repo saat ini adalah aplikasi Next.js + Neon Postgres. Implementasi runtime agent harus mengikuti stack dan dependensi aktual setelah diperiksa. Jangan menambahkan runtime agent framework atau menjalankan autonomous agents di production tanpa verifikasi kompatibilitas, secrets, observability, budget, approval controls, dan test suite. Model/provider tidak boleh dipanggil sampai kredensial dan biaya yang diperlukan tersedia serta diaktifkan secara sadar.
