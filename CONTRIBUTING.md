# Contributing to Share Rich

Terima kasih sudah tertarik berkontribusi ke **Share Rich P2P**! 🎉

Proyek ini open-source, gratis, dan bebas dimodifikasi. Panduan singkat ini membantu kamu ikut berkontribusi dengan rapi dan aman.

---

## 📌 Sebelum mulai

- Selesaikan dulu masalah di **issue** yang ada, atau buka issue baru sebelum membuat PR besar.
- Satu PR idealnya satu hal (mis. satu bug, satu fitur kecil). PR besar sulit ditinjau.
- Gunakan bahasa Indonesia atau Inggris untuk komentar/deskripsi PR — keduanya diterima.

---

## 🧰 Prasyarat

- **Node.js** v18+ (disarankan v20)
- **npm** (atau bun/pnpm/yarn)

```bash
git clone https://github.com/ramax100/Share-Rich.git
cd Share-Rich
npm ci
npm run dev   # http://localhost:3000
```

> Proyek bukan AI Studio/Gemini — tidak membutuhkan `GEMINI_API_KEY` untuk menjalankan transfer P2P.

---

## 🔧 Alur kerja umum

1. **Fork** repositori ini ke akun kamu.
2. Buat **branch** baru dari `main`:
   ```bash
   git checkout -b feat/nama-fitur
   ```
3. Lakukan perubahan.
4. Pastikan aplikasi tetap berjalan & build sukses:
   ```bash
   npm run lint        # typecheck (tsc --noEmit)
   npm run build       # build produksi
   ```
5. Commit dengan pesan yang jelas:
   ```bash
   git commit -m "feat: deskripsi singkat fitur"
   ```
   (Gunakan `fix:`, `feat:`, `docs:`, `refactor:`, `style:`, `test:` sesuai jenis.)
6. **Push** branch ke fork, lalu buka **Pull Request** ke `main`.

---

## ✅ Pedoman kode

- **Bahasa UI:** semua label/tombol dalam Bahasa Indonesia (mis. "Kirim", "Terima", "Mulai Menggunakan").
- **Branding:** semua merek yang terlihat pengguna adalah **"Share Rich"** (jangan pakai "ShareIt").
- **Kunci storage & prefix jaringan:** jangan mengubah kunci `localStorage` (`shareit_peerid`, `shareit_name`, `shareit_avatar`, `shareit_profile_locked`, `shareit_roomcode`, `shareit_device_id`), prefix id PeerJS `shareit-`, atau saluran mesh (`shareit_mesh_network`, `shareit-mesh-*`, `shareit-net-*`). Mengubahnya akan merusak konektivitas dan meng-reset identitas pengguna lama. Kunci **UI saja** (mis. `shareit_welcome_dismissed`) boleh ditambah, tapi jangan dihapus oleh `resetDeviceIdentity()`.
- **Tema:** ikuti tema **flat putih/pink**. Hindari background gelap (`bg-*-950`) dan gradien (`bg-gradient`).
- **Layout mobile:** pastikan tampilan tetap rapi di layar sempit; semua modal terpusat & bisa di-scroll. Hindari teks terlalu kecil (< 12px) bila memungkinkan.
- **Tidak menambah footer** — footer sudah sengaja dihapus.
- **Jangan menambahkan TURN/relay atau radar lintas jaringan** — aplikasi hanya butuh satu jaringan lokal (Wi-Fi/Hotspot sama).

---

## 🐛 Melaporkan bug

Sertakan di laporan issue:

1. **Langkah reproduksi** (apa yang diklik)
2. **Perilaku yang diharapkan** vs **realita**
3. **Perangkat/browser** (mis. iPhone 13 + Safari, Chrome Android)
4. **Screenshot** (jika ada)

---

## 🔒 Keamanan

- Jangan pernah commit file `.env*` (sudah di-`.gitignore`).
- Jangan pernah kirim token/API key ke repo atau ke issue.
- Jika menemukan kerentanan, **jangan** buka issue publik — laporkan secara pribadi lewat channel (lihat di bawah).

---

## 💬 Komunitas

Info update & dukungan resmi ada di channel Telegram:

<p align="center">
  <a href="https://t.me/ChRichStore">
    <img src="https://img.shields.io/badge/Telegram-Rich__Store-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Join Telegram" />
  </a>
</p>

**👉 https://t.me/ChRichStore**

---

## 📜 Lisensi

Proyek ini dilisensikan di bawah **MIT License** — gratis, bebas dipakai, dimodifikasi, dan didistribusikan. Lihat file [`LICENSE`](LICENSE) untuk detail.

Terima kasih sudah ikut membangun Share Rich! 💗
