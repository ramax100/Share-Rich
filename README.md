<div align="center">

![Share Rich Logo](https://github.com/ramax100/Share-Rich/raw/main/public/icons/logo.png)

# Share Rich P2P — Transfer File Wi-Fi Direct

**Kirim file langsung antar perangkat, P2P (point-to-point), tanpa server, tanpa kuota internet.**

Aplikasi web berbasis **WebRTC** untuk mentransfer file (foto, video, dokumen, APK, ZIP, dll.) secara langsung antara dua perangkat yang terhubung ke **jaringan Wi-Fi / Hotspot yang sama** — cepat, aman, dan 100% gratis.

<br/>

**🌐 Live Demo:** [https://sharerich.vercel.app](https://sharerich.vercel.app) &nbsp;·&nbsp; **📦 Repo:** [github.com/ramax100/Share-Rich](https://github.com/ramax100/Share-Rich)

</div>

---

## ✨ Fitur Utama

- **⚡ Transfer P2P Langsung (WebRTC DataChannel)** — File dipindahkan langsung dari chip Wi-Fi perangkat satu ke perangkat lain. **Tidak pernah** diunggah / disimpan di cloud.
- **🔗 Koneksi Lewat QR Code & PIN** — Dua perangkat bertemu lewat QR yang di-scan kamera, atau PIN Room 6 digit.
- **📷 Scanner QR Real-Time** — Tombol *Kirim* langsung membuka kamera untuk memindai QR perangkat penerima.
- **📊 Progress Transfer** — Kecepatan (MB/s), ETA, dan progress bar real-time.
- **🗄️ Riwayat & Brankas File** — Kumpulan file yang dikirim & diterima, dengan pratinjau dan tombol unduh ulang.
- **📥 Auto-Download** — File otomatis masuk ke folder Download browser setelah selesai (tombol unduh manual sebagai cadangan).
- **🔔 Konfirmasi Masuk** — Layar *"Terima Perangkat"* & *"Terima File"* untuk persetujuan yang disengaja.
- **📶 Panduan Wi-Fi Direct / Hotspot** — Panduan memilih pita 5 GHz untuk kecepatan maksimal.
- **📱 Responsif & Mobile-First** — UI flat putih/pink, rapi di HP maupun desktop, semua modal terpusat & bisa di-scroll.
- **🧩 Anti Duplikat Kirim** — Pengaman double-tap agar file tidak terkirim dua kali.

---

## 🧠 Cara Kerja

1. Satu perangkat membuka aplikasi dan **menampilkan QR / PIN** (tab *Terima*).
2. Perangkat kedua **memindai QR** atau **memasukkan PIN** (tab *Kirim* / modal Koneksi Cepat).
3. Keduanya terhubung lewat **PeerJS → WebRTC DataChannel**, hanya di jaringan lokal yang sama.
4. Pilih file → klik **Kirim File** → penerima menyetujui → file mengalir langsung (Direct P2P) dengan kecepatan Wi-Fi 5 GHz.
5. Setelah selesai, file otomatis masuk ke Download penerima dan tercatat di **Riwayat**.

> **Mengapa ini gratis & cepat?** Tidak ada server penyimpan file. Hanya ada *signaling + radar* (WebSocket / serverless) untuk "mempertemukan" kedua perangkat; data file itu sendiri mengalir langsung dari perangkat ke perangkat.

---

## 🛠️ Teknologi & Kebutuhan

| Bagian | Stack |
|--------|-------|
| **Frontend** | React 19, Vite 6, TypeScript, Tailwind CSS 4 (flat white/pink), lucide-react (icons) |
| **P2P Transfer** | PeerJS (WebRTC DataChannel) |
| **QR** | `qrcode` (generate) + `jsqr` (scan kamera) |
| **Radar / Signaling** | WebSocket (`ws`) di `server.ts` + serverless Vercel `api/peers.ts` |
| **Server lokal** | Node.js + Express 5 + Vite (mode middleware) |
| **Efek** | `canvas-confetti` |
| **Deploy** | Vercel (static + serverless function) |

**Prasyarat:**

- **Node.js** v18+ (disarankan v20) dan **npm** (atau bun/pnpm/yarn).
- Untuk **scan QR kamera**, gunakan HTTPS atau `localhost` (izin kamera).
- Untuk uji nyata butuh **dua perangkat** di Wi-Fi/Hotspot yang sama (bisa coba flag "loopback" / demo virtual dari satu perangkat).

---

## 📦 Cara Clone & Jalankan di Lokal

```bash
# 1. Clone repositori
git clone https://github.com/ramax100/Share-Rich.git
cd Share-Rich

# 2. Install dependensi
npm install          # atau: npm ci   /   bun install

# 3. Jalankan mode pengembangan (otomatis membuka server + radar)
npm run dev
# → buka http://localhost:3000

# 4. Build untuk produksi
npm run build
# → hasil static ada di folder /dist

# 5. (Opsional) Jalankan server produksi lokal
npm start
```

> **Catatan:** File `.env.local` bersifat opsional (digunakan untuk integrasi Vercel/AI Studio). Aplikasi utama **tidak membutuhkan API key** untuk menjalankan transfer P2P.

---

## ☁️ Deploy ke Vercel (Rekomendasi)

Proyek ini sudah dikonfigurasi untuk Vercel (`vercel.json` + serverless `api/peers.ts`):

1. Import repo di [vercel.com](https://vercel.com) (atau dari CLI):
   ```bash
   npm i -g vercel
   vercel
   ```
2. Framework otomatis terdeteksi **Vite**, build `vite build`, output `dist`.
3. Deploy. Perangkat bisa diakses publik via URL Vercel kamu (mis. `https://sharerich.vercel.app`).

> **Penting:** Karena QR/radar perlu mempertemukan perangkat, pastikan fungsi serverless `api/peers.ts` ikut ter-deploy (bukan hanya static). Untuk jaringan lokal paling stabil, cukup akses lewat URL yang sama di kedua perangkat dalam satu Wi-Fi/Hotspot.

---

## 📁 Struktur Proyek

```
Share-Rich/
├── api/
│   └── peers.ts              # Serverless radar (Vercel): daftar perangkat satu jaringan
├── public/
│   ├── icons/                # Logo & favicon (logo.png, favicon-*.png)
│   ├── avatars/              # Avatar chibi + avatar full-body untuk animasi duel
│   └── site.webmanifest      # Ikon PWA
├── src/
│   ├── App.tsx               # Komponen akar: state, WebRTC, routing modal, deep-link
│   ├── main.tsx              # Bootstrap React
│   ├── index.css             # Tailwind + animasi global (entry tanpa transform)
│   ├── types.ts              # Tipe data (Peer, FileItem, session, riwayat, dll.)
│   ├── components/
│   │   ├── Header.tsx            # Header + badge Room + menu
│   │   ├── WelcomeModal.tsx      # Pop-up sambutan (footer sticky, tombol selalu terlihat)
│   │   ├── QrModal.tsx           # QR / PIN / Scanner Kamera
│   │   ├── RadarVisual.tsx       # Radar visual dekoratif (posisi stabil)
│   │   ├── ConnectDevicesPanel.tsx  # Daftar perangkat terhubung
│   │   ├── FilePicker.tsx        # Pilih file + drag&drop + tombol kirim
│   │   ├── TransferProgressModal.tsx  # Progress + kecepatan + duel avatar + confetti
│   │   ├── TransferDuel.tsx      # Animasi duel avatar & pesawat kertas
│   │   ├── TransferHistory.tsx   # Riwayat & brankas file (pratinjau/unduh)
│   │   ├── IncomingTransferDialog.tsx  # Pop-up "Terima File"
│   │   ├── AcceptDeviceDialog.tsx      # Pop-up "Terima Perangkat"
│   │   ├── DeviceSettingsModal.tsx     # Profil avatar & nama + reset identitas
│   │   ├── ChangeRoomModal.tsx         # Ganti Room / PIN
│   │   ├── HotspotGuideModal.tsx       # Panduan Wi-Fi Direct 5 GHz
│   │   ├── AnimeAvatar.tsx        # Render avatar anime
│   │   └── ErrorBoundary.tsx      # Penanganan error
│   └── utils/
│       ├── webrtc.ts          # PeerJS: sendFiles, streaming, chunking (256 KB / batch 8 MB)
│       └── helpers.ts         # ID stabil, reset identitas, format, kategori file
├── server.ts                 # Server lokal: Express + Vite + WebSocket signaling
├── vercel.json               # Konfigurasi deploy Vercel
├── vite.config.ts            # Konfigurasi Vite (alias, chunking)
├── package.json              # Script & dependensi
└── tsconfig.json
```

---

## 🔧 Konfigurasi Penting

- **Chunk transfer & buffering** (`src/utils/webrtc.ts`): `CHUNK_SIZE = 256 KB`, `BATCH_READ_SIZE = 8 MB`, `BUFFER_CEILING = 8 MB`, `BUFFER_LOW_THRESHOLD = 2 MB` — tuning kecepatan transfer Wi-Fi.
- **Identitas perangkat** tersimpan di `localStorage` (kunci `shareit_*`) sehingga tetap ada saat refresh, dan hanya direset lewat menu *Reset ID & Profil Perangkat*.
- **Pop-up sambutan** hanya muncul sekali; bisa dihilangkan permanen lewat *"Jangan tampilkan lagi"* (kunci `shareit_welcome_dismissed`).

---

## 📜 Lisensi

Proyek ini **gratis & bebas dimodifikasi** (open-source). Kamu bebas menggunakan, menyalin, memodifikasi, bahkan mengembangkan kembali untuk keperluan pribadi maupun komersial.

Jika ingin menambahkan file lisensi resmi (mis. **MIT**), silakan tambahkan `LICENSE` sendiri. Tuliskan atribusi bila kamu membagikan modifikasi.

---

## 📬 Join Channel Telegram

Dapatkan info update, fitur baru, dan dukungan resmi:

<p align="center">
  <a href="https://t.me/ChRichStore">
    <img src="https://img.shields.io/badge/Telegram-Rich__Store-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Join Telegram" />
  </a>
</p>

**👉 https://t.me/ChRichStore**

---

<div align="center">

**Share Rich P2P** — *Kirim file langsung antar perangkat. Gratis. Tanpa server. Tanpa batas.*

</div>
