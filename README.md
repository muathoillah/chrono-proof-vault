# Trusty Evidence Chain

Informatika

Digital Forensics & Security Audit

Rancang Bangun Tamper-Evident Digital Evidence Management System MenggunakanCryptographic Hash Chain dan Merkle Tree

Kebutuhan: Bukti digital harus dapatdibuktikan integritasnya sepanjang proses pengumpulan, penyimpanan, dan pemeriksaan. Penelitian ini membangunsistem manajemen bukti digital yang mampumendeteksi perubahan terhadap artefak. Use case teknis: Ketika file diunggah, sistemmembuat hash dan mencatat metadata. Bukti berikutnya dihubungkan menggunakan hash chain dan Merkle Tree sehingga perubahanterhadap salah satu bukti dapat dideteksimelalui proses verifikasi. Metode: SHA-256, Merkle Tree, Digital Signature, Chain of Custody Modeling, dan Digital Forensics Process Model. Pengujian dilakukan melaluisimulasi manipulasi bukti. Hasil akhir:Digital Evidence Repository, integrity verification engine, chain-of-custody log, proof generation module, dan dashboard verifikasi.

apa aja yang disiapain sebelum bikin itu

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6410e5eb-d525-4451-a65a-8f108c19df59).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
