# Tamper-Evident Digital Evidence Management System

Prototype skripsi: sistem manajemen bukti digital dengan cryptographic hash chain, Merkle Tree, digital signature (Ed25519), chain of custody, verifikasi integritas, dan simulasi tamper — di atas Lovable Cloud.

## Yang perlu disiapkan (jawaban singkat)

Semua kebutuhan disiapkan otomatis di dalam proyek; kamu tidak perlu akun atau tool eksternal:
- Lovable Cloud untuk database, file storage (penyimpanan artefak bukti), dan server functions.
- Kriptografi memakai Web Crypto API (SHA-256) + Ed25519 — tanpa library eksternal berat.
- Desain dashboard forensik (dark, monospace untuk hash) dibangun dengan Tailwind + shadcn.

## Arsitektur data (Lovable Cloud)

```text
cases (kasus) ──< evidence (bukti: file, sha256, prev_hash, chain_hash, merkle_path)
     │                     │
     └── merkle_batches (root hash, signature, timestamp)
                           │
     custody_log (aktor, aksi, timestamp, hash-snapshot) per evidence
```

- Tabel: `cases`, `evidence`, `merkle_batches`, `custody_log` (semua dengan RLS; prototype = satu investigator, akses authenticated penuh).
- Storage bucket `evidence-files` untuk artefak asli.
- Migration sekaligus berisi 1 kasus demo + 3 bukti ter-hash-chain agar layar pertama langsung berisi data.

## Alur kriptografi

1. **Upload** — file di-hash SHA-256 (client-side sebelum upload), metadata dicatat; `chain_hash = SHA256(prev_chain_hash + file_hash + timestamp + actor)` membentuk hash chain per kasus; entri custody log "COLLECTED" dibuat.
2. **Merkle Tree per batch** — saat investigator "seal batch", semua `chain_hash` bukti dalam batch disusun jadi Merkle Tree; root hash ditandatangani Ed25519 (keypair server, private key di secret) dan disimpan di `merkle_batches` beserta proof path tiap bukti.
3. **Verifikasi** — engine menghitung ulang: file hash → chain hash → Merkle proof → verifikasi signature root. Status per bukti: `VALID` / `TAMPERED` / `CHAIN_BROKEN`.
4. **Simulasi tamper** — tombol khusus "Simulate Tampering" yang mengubah file/record di belakang layar, lalu dashboard menunjukkan deteksinya. Ini inti pengujian penelitian.
5. **Laporan** — ekspor proof report (JSON + tampilan printable) berisi hash chain, Merkle proof, signature, dan custody log.

## Halaman

1. `/` — Dashboard: ringkasan kasus, status integritas global, visualisasi rantai hash.
2. `/cases/$id` — Detail kasus: daftar bukti, upload, seal batch, status verifikasi per bukti, visualisasi Merkle Tree.
3. `/verify/$id` — Halaman verifikasi bukti: re-hash file, hasil perbandingan step-by-step (hash → chain → Merkle → signature).
4. `/custody/$id` — Timeline chain of custody per bukti + tombol aksi (transfer/analyze) yang menambah entri log.
5. `/auth` — Login sederhana (email/password) via Lovable Cloud auth.

## Server functions

- `uploadEvidence` — simpan file + hitung hash chain (server-side re-hash sebagai otoritas).
- `sealBatch` — bangun Merkle Tree, tanda tangani root (Ed25519, key di server secret via `generate_secret`).
- `verifyEvidence` / `verifyBatch` — verifikasi penuh, kembalikan status per langkah.
- `simulateTamper` — ubah artefak/record untuk pengujian.
- `addCustodyEntry`, `getCaseData`, `exportProofReport`.

## Teknis

- SHA-256: Web Crypto API (`crypto.subtle.digest`) — tersedia di browser dan worker.
- Ed25519: `crypto.subtle` sign/verify; private key disimpan sebagai secret Lovable Cloud.
- Merkle Tree: implementasi sendiri (~60 baris, duplikasi hash ganjil, proof path array of {hash, position}).
- Upload file via FormData ke server function; batas ukuran wajar (~50MB).
- Desain: tema dark forensik, font monospace untuk hash, badge status hijau/merah, timeline vertikal custody.

## Tahapan pengerjaan

1. Enable Lovable Cloud, migration schema + data demo ter-chain.
2. Util kripto (hash, chain, merkle, signature) + server functions.
3. UI: dashboard, detail kasus + upload, verifikasi, custody.
4. Simulasi tamper + ekspor laporan.
5. Metadata SEO per route + uji alur lengkap (upload → seal → tamper → verify).
