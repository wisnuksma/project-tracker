# Project Tracker (PWA) — panduan setup

Web app untuk tracking task tim yang bisa dibuka dari browser mana pun dan dipasang seperti aplikasi di laptop (Windows/Mac) maupun HP (Android/iPhone). Setiap orang login ke akunnya, melihat task beserta jadwal mulai & deadline, menandai **Mulai** dan **Done**, dan mendapat pengingat lewat **Google Calendar + email**. Admin membagikan task dan melihat dashboard waktu pengerjaan serta siapa yang overperforming.

Database tetap spreadsheet **"KPI dan Tracker"** — perubahan dari aplikasi langsung tertulis ke Sheets, dan sebaliknya.

```
project-tracker/
├── apps-script/Code.gs          ← backend, ditempel ke Apps Script spreadsheet
├── web/                         ← website/PWA (diunggah ke GitHub Pages)
│   └── config.js                ← tempat URL Web App
├── tests/                       ← uji otomatis
└── .github/workflows/pages.yml  ← publikasi otomatis ke GitHub Pages
```

Total waktu setup: ±20 menit, sekali saja.

---

## Langkah 1 — Backend di Google Sheets

1. Buka spreadsheet **KPI dan Tracker** → **Extensions → Apps Script**.
2. Hapus isi `Code.gs` bawaan, tempel seluruh isi `apps-script/Code.gs`, klik **Save**.
3. Kembali ke spreadsheet, **reload**. Muncul menu **Project Tracker**.
4. Klik **Project Tracker → 1. Setup / perbarui struktur** dan izinkan akses (peringatan "unverified app" normal untuk script buatan sendiri → *Advanced → Go to …*). Setup akan:
   - menambah kolom baru (*Start Time, End Time, Priority, Task ID, Started At, Done At, Notes*, dan kolom teknis *Cal …/Reminded*) di **akhir** tiap tab orang — kolom lama tidak digeser,
   - memberi Task ID ke setiap task yang sudah ada,
   - membuat tab **Users** dan **Activity Log**,
   - membuat akun untuk tiap tab orang (username = nama tab huruf kecil: `ari`, `wisnu`, …) + akun `admin`.
5. **Salin password sementara** yang muncul (tidak ditampilkan lagi; bisa di-reset kapan saja).
6. Klik **Project Tracker → 2. Aktifkan Calendar & email pengingat** dan izinkan akses Calendar & Gmail.
7. **Deploy → New deployment** → ikon gerigi → **Web app**:
   - *Execute as*: **Me** · *Who has access*: **Anyone**
   - klik **Deploy**, salin **Web app URL** (`https://script.google.com/macros/s/…/exec`).

> Akses "Anyone" hanya membuat URL bisa dihubungi; setiap aksi tetap wajib login dengan token bertanda tangan. Spreadsheet tetap privat, password disimpan sebagai hash, dan login dikunci 15 menit setelah 5 kali salah.

**Saat Code.gs diperbarui nanti:** tempel versi baru → jalankan menu *1. Setup* lagi → Deploy → *Manage deployments* → ✏️ → Version: *New version* → Deploy. URL tetap sama.

---

## Langkah 2 — Publikasikan website (GitHub Pages)

1. Buka `web/config.js`, isi URL dari langkah 1:
   ```js
   window.PT_CONFIG = { apiUrl: 'https://script.google.com/macros/s/XXXX/exec' };
   ```
   (Boleh dikosongkan — setiap orang lalu diminta menempel URL saat pertama membuka.)
2. Buat repository baru di GitHub, mis. `project-tracker`. Di akun GitHub gratis, GitHub Pages butuh repo **Public** — aman, karena repo hanya berisi kode tampilan; data tetap di spreadsheet.
3. Unggah **seluruh isi** folder `project-tracker` (termasuk folder `.github`) ke repo: *Add file → Upload files*, atau lewat GitHub Desktop.
4. Di repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. Buka tab **Actions** dan tunggu workflow *Deploy ke GitHub Pages* selesai (±1 menit). Alamat aplikasi: `https://<username>.github.io/project-tracker/`

Setiap kali file di `web/` diubah dan di-push, website otomatis diperbarui. Jika mengubah file aplikasi, naikkan juga `VERSION` di `web/sw.js` agar perangkat yang sudah memasang aplikasi langsung memuat versi baru.

> Ingin domain sendiri (mis. `tracker.linovhr.com`)? Settings → Pages → *Custom domain*, lalu buat record CNAME ke `<username>.github.io` di DNS.

---

## Langkah 3 — Bagikan ke tim

Kirim link aplikasi + username & password sementara masing-masing. Setiap orang:

1. Buka link → login → buat password baru.
2. Buka **Setelan** → isi **email Google** mereka (untuk Google Calendar & pengingat). Admin juga bisa mengisinya di menu **Pengguna**.
3. **Pasang sebagai aplikasi** (opsional, disarankan):
   - **Chrome/Edge (Windows & Mac):** ikon *Install* di ujung kanan kolom alamat.
   - **Android (Chrome):** menu ⋮ → *Tambahkan ke layar utama*.
   - **iPhone/iPad (Safari):** tombol *Bagikan* → *Tambah ke Layar Utama*.

---

## Cara kerja pengingat

| Saluran | Kapan | Muncul walau aplikasi ditutup? |
|---|---|---|
| **Google Calendar** — event `▶ <task>` di jam mulai dan `⏰ Deadline: <task>` yang berakhir tepat di jam deadline | Notifikasi sesuai setelan default Google Calendar masing-masing (biasanya 10–30 menit sebelumnya) | ✅ Ya, di HP & laptop |
| **Email** — pengingat saat deadline tinggal ≤ 24 jam, dan saat lewat deadline | Dicek tiap 15 menit, tiap email dikirim sekali | ✅ Ya |
| **Ringkasan pagi** — task terlambat, deadline hari ini, mulai hari ini | 07:00, Senin–Jumat; admin juga menerima rekap task terlambat tim | ✅ Ya |
| **Notifikasi browser** | Jam mulai, sebelum deadline (bisa diatur di Setelan), saat lewat deadline | ❌ Hanya saat aplikasi/tab terbuka |

- Event Calendar dibuat di kalender **"Project Tracker"** milik akun admin (pemilik script), dengan penanggung jawab sebagai tamu, sehingga muncul di Calendar mereka. Event otomatis **diperbarui** saat jadwal diubah dan **dihapus** saat task ditandai Done, Hold, atau dihapus.
- Perubahan dari aplikasi langsung tersinkron; perubahan yang diketik langsung di spreadsheet tersinkron dalam ≤ 15 menit (atau menu *Sinkronkan Calendar sekarang*).
- Admin pemilik script tidak mendapat notifikasi untuk setiap event (pengingat di kalender pemilik dimatikan). Kalender "Project Tracker" bisa disembunyikan dari tampilan admin.
- Ingin tamu menerima email undangan setiap event dibuat? Ubah `SEND_INVITES: true` di bagian atas `Code.gs`. Jam ringkasan pagi dan ambang email juga diatur di sana.
- Pastikan setelan Google Calendar tim mengizinkan undangan otomatis masuk (*Settings → Event settings → Add invitations to my calendar*). Default Google Workspace sudah mengizinkan undangan dari dalam organisasi.

---

## Cara pakai singkat

**Anggota tim — "Task Saya"**: task dikelompokkan *Terlambat / Hari ini & berjalan / Akan datang / Tanpa jadwal / Selesai*. **▶ Mulai** mencatat waktu mulai dikerjakan, **✓ Done** mencatat waktu selesai, **Buka lagi** bila ternyata belum selesai. Task berupa URL artikel bisa diklik.

**Admin**: **Semua Task** (buat/edit/pindahkan/hapus task lengkap dengan jam), **Project** (tab Main Project + progres), **Pengguna** (tambah anggota — tab baru dibuat otomatis — email, role, reset password), **Dashboard** (filter periode & orang).

### Cara dashboard menghitung
| Metrik | Definisi |
|---|---|
| Waktu pengerjaan | *Done At* − *Started At* (saat tombol Mulai ditekan); bila tidak pernah ditekan, dihitung dari jadwal mulai |
| Overperforming | Selesai sebelum deadline **dan** memakai ≤ 80% durasi rencana (ubah `OVERPERFORM_RATIO` di `web/js/logic.js`) |
| Tepat waktu | Selesai sebelum/tepat deadline |
| Selesai terlambat | Done setelah deadline |
| Overdue aktif | Belum done dan sudah lewat deadline |
| Selisih deadline | Deadline − waktu Done (positif = lebih cepat) |

Jam default bila kolom jam kosong: mulai 09:00, deadline 17:00. Task berstatus *Recurring* atau bertanggal teks (*TBD*) tetap tampil tapi tidak memicu pengingat.

---

## Mode demo
Di layar awal (sebelum URL diisi) klik **Coba mode demo** → login `admin`, `ari`, `wisnu`, dst. dengan password `demo`. Data demo tidak menyentuh spreadsheet.

## Menjalankan & menguji secara lokal
```bash
cd web && python3 -m http.server 8080      # buka http://localhost:8080
node tests/logic.test.js                   # logika durasi, performa & notifikasi
TZ=Asia/Jakarta node tests/backend.test.js # backend dengan simulasi Sheets/Calendar/Gmail
```

## Batasan
- Kuota gratis Apps Script (Workspace): ±1.500 email/hari dan ribuan event Calendar/hari — jauh di atas kebutuhan tim ±20 orang. Respons tiap aksi biasanya 1–3 detik.
- Jangan mengubah nama header kolom, nama tab orang (tersimpan di kolom *Sheet Name* tab Users), atau kolom *Task ID*/*Cal …*. Urutan kolom boleh diubah.
