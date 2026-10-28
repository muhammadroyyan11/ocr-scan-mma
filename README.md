# Stock Arrival Scanner / Arrival

Aplikasi penerimaan barang mandiri: Laravel 10, PHP 8.2-FPM, MariaDB 10.11,
Nginx, Blade, JavaScript native, Canvas, dan Tesseract.js 6. Foto diproses lokal
di browser, **tidak diunggah atau disimpan permanen**. Bukan integrasi ERP JezPro.

> Laravel 10 sudah di luar dukungan keamanan. Versi dipertahankan sesuai spesifikasi,
> bukan rekomendasi untuk deployment publik. Baca `SECURITY.md` sebelum deployment.
> OCR tidak menjamin akurasi label, keaslian tanggal, atau keamanan produk.

## Mulai dengan Docker

Prasyarat: Docker Engine + Docker Compose v2, port host 8092 tersedia, dan
OpenSSL pada host. Tidak perlu PHP, Composer, atau Node pada host untuk menjalankan aplikasi.
Build pertama membutuhkan internet untuk menarik image dan dependency; runtime OCR tidak membutuhkan CDN.

```bash
bash scripts/setup.sh
docker compose up -d --build
docker compose ps
curl --fail http://localhost:8092/api/health
```

Buka `http://localhost:8092`. Login pertama:

- Email: `admin@stock.local` (atau `INITIAL_ADMIN_EMAIL` di `.env`).
- Password acak: lihat `INITIAL_ADMIN_PASSWORD` di `.env`, misalnya `grep '^INITIAL_ADMIN_PASSWORD=' .env`.
- Segera ganti password melalui profil / Pengaturan akun.
- Buat akun staf melalui **Pengguna & akses**; tidak ada registrasi publik atau akun demo berpassword tetap.

`setup.sh` menghasilkan APP_KEY, password database/root, dan password admin dengan OpenSSL.
File `.env` berizin 600 dan tidak masuk Git/image. Script tidak menimpa konfigurasi yang sudah diinisialisasi.
Bootstrap admin hanya bekerja jika tabel users masih kosong; restart tidak mereset password.
Setelah login pertama, hapus nilai `INITIAL_ADMIN_PASSWORD` dari `.env` dan recreate app agar
password awal tidak terus berada dalam environment container. Akun database tetap tersimpan.

```bash
docker compose up -d --force-recreate app web
```

Simpan `.env` dan backup database secara aman. Jangan menaruh secret di Dockerfile.

## Operasional

```bash
# Build/start dan migration otomatis setelah DB siap
docker compose up -d --build

# Migration eksplisit (idempoten)
docker compose exec app php artisan migrate --force

# Status dan log
docker compose ps
docker compose logs -f

# Stop tanpa menghapus data
docker compose down
```

JANGAN gunakan `docker compose down -v` untuk prosedur normal. Named volume `db_data`
menyimpan database; `app_storage` menyimpan session, compiled view, dan cache.
Tidak ada port database yang dipublikasikan. Container tidak menyentuh service proyek lain.
PHP-FPM diakses Nginx melalui `app:9000`; document root hanya `public/`.
Entrypoint memeriksa koneksi PDO (maksimal 30 percobaan), migration, bootstrap awal, lalu PHP-FPM.
Service memiliki health check dan restart policy `unless-stopped`.

Source dibake ke image, bukan bind mount. Setelah perubahan PHP/Blade/CSS/JS:

```bash
docker compose up -d --build
```

Konfigurasi `.env`: `APP_PORT=8092`, `APP_URL`, `APP_ENV`, `APP_DEBUG=false`,
`SESSION_SECURE_COOKIE`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`.
`INSTALL_DEV=true` menyediakan PHPUnit/Pint pada image untuk pengujian. Untuk image
operasional tanpa dependency dev: `INSTALL_DEV=false docker compose up -d --build`.

APP_KEY dapat dibuat menggunakan Artisan tanpa menyimpan `.env` dalam image:

```bash
docker compose exec app php artisan key:generate --show
```

Masukkan hasil ke APP_KEY pada `.env` host, lalu recreate app/web. Jangan merotasi key
sembarangan pada instalasi aktif: cookie/session lama akan tidak valid.

## Role Dan Hak Akses

Semua halaman operasional membutuhkan login session Laravel. Tidak ada autentikasi palsu.

| Operasi | Admin | Supervisor | Operator | Viewer |
| --- | --- | --- | --- | --- |
| Baca/dashboard/CSV | Semua sesi | Semua sesi | Sesi sendiri | Semua sesi |
| Buat sesi | Ya | Ya | Ya | Tidak |
| Scan/tambah/edit/hapus item | Semua sesi aktif | Semua sesi aktif | Sesi sendiri aktif | Tidak |
| Selesaikan/buka kembali sesi | Ya | Ya | Tidak | Tidak |
| Kelola akun/role/nonaktifkan | Ya | Tidak | Tidak | Tidak |
| Ganti password sendiri | Ya | Ya | Ya | Ya |

Kepemilikan dicek pada server dengan Eloquent scope + policy, termasuk URL langsung,
API, scanner, dan export. Sesi selesai bersifat baca-saja, termasuk untuk admin.
Akun nonaktif kehilangan akses pada request berikutnya. Perubahan password membatalkan
session lama melalui `auth.session`. Admin tidak dapat menurunkan role/menonaktifkan dirinya;
minimal satu admin aktif dipertahankan. Password minimum 12 karakter dengan huruf dan angka.

## Alur Pemakaian

1. Buat sesi penerimaan; supplier, referensi, kode gudang, dan catatan opsional.
2. Tampilan utama berisi dua langkah: **Foto label** dan **Periksa & simpan**.
   Hanya LOT, tanggal produksi, dan kedaluwarsa yang ditampilkan; semua boleh dikosongkan jika tidak ada pada label.
   Pilih **Mulai kamera**, izinkan akses, arahkan ke label, lalu tekan **Scan label**.
   Tombol aktif setelah preview kamera siap; satu klik mengambil foto dan membaca LOT/MG/ED sekaligus.
   Tidak perlu menekan **Ambil foto** atau memilih jenis data terlebih dahulu. Mode Otomatis menjadi pilihan awal.
   Untuk satu field, buka **Alat bantu scan**, pilih **LOT**, **MG / MFG** (tanggal produksi), atau **Expired Date**,
   lalu tekan **Baca LOT / MG / MFG / Expired Date** untuk langsung memotret dan membaca field tersebut.
   **Ambil foto**, pengaturan tampilan foto, dan pemilihan area tetap tersedia di **Alat bantu scan**.
   Mode **Otomatis** mengenali penanda LOT/BATCH, MG/MFG/MFD, serta ED/EXP dan mengisi field masing-masing.
   Tanggal valid langsung mengisi input kalender MG dan ED; teks asli tersimpan di bagian yang dapat dibuka.
   Label dengan simbol pabrik dan jam pasir juga dibaca dari bentuk simbol serta posisi tanggal di sebelah kanannya,
   tanpa harus ada tulisan MFG/EXP. Tanggal dapat berupa satu token, terpisah oleh spasi seperti `2026 - 08 - 11`,
   memakai nama bulan seperti `11 agustus 2026`, atau hanya bulan/tahun seperti `08/2031` / `AUG 2031`.
   Ikon harus berada pada baris tanggal yang sama; sistem tidak menetapkan jenis dari urutan tanggal atau perkiraan masa berlaku.
   OCR mengulang pembacaan baris tanggal hingga dua baris
   jika pembacaan seluruh foto belum lengkap. Pengenalan memakai pencocokan bentuk lokal di browser, bukan layanan AI server;
   simbol buram, terlalu miring, atau berbeda bentuk mungkin perlu crop/pilihan field manual.
   Contoh `26.08.11` masuk sebagai kandidat MG; pilih format `YY.MM.DD` dan abad `2000-2099` setelah memeriksa label
   agar kalender terisi `2026-08-11`. Pilihan format yang sudah ditetapkan dipakai pada scan berikutnya untuk item yang sama.
   ED `2031.08`, `08/2031`, atau `AUG 2031` langsung mengisi input bulan/tahun `2031-08`, tanpa mengarang hari.
   Ketelitian bulan/tahun disimpan di `mfg_month` / `exp_month`, tetap terlihat saat edit dan tersedia di CSV.
   Mode satu field hanya mengisi field yang dipilih dan menambah riwayat area.
   Tanpa penanda jenis, sistem tidak menebak apakah tanggal adalah MG atau ED; pilih mode satu field.
   Gunakan **Foto ulang**, pilih field berikutnya, lalu ulangi tanpa menghapus hasil sebelumnya.
   Alternatif: **Pilih foto** JPEG/PNG/WebP, maksimal 15 MB / 40 MP. Foto tidak dikirim ke server.
3. Kamera belakang diutamakan. Ganti kamera dan lampu hanya aktif jika hardware mendukung.
   Foto ulang membuka kamera lagi; Hentikan menghentikan semua track.
   Preview ditampilkan sebelum menunggu playback; pencarian daftar kamera berjalan terpisah dan tidak
   menutup stream jika ditolak atau belum selesai. Status izin/error tampil di dekat tombol kamera.
   Permintaan izin yang belum dijawab dapat dibatalkan lewat **Hentikan**; stream yang datang terlambat langsung ditutup.
   Modul OCR dimuat saat tombol baca ditekan, sehingga aset OCR yang hilang tidak memblokir kamera.
4. Untuk foto dari perangkat, tekan **Scan label** untuk seluruh foto. Di HP, tampilan berpindah ke hasil setelah pembacaan selesai.
   Buka **Informasi tambahan** untuk nama produk, barcode, catatan, teks mentah, confidence, dan analisis teks.
   **Pilihan hasil baca lainnya** menyediakan kandidat; bagian ini terbuka otomatis jika satu field memiliki beberapa kandidat.
   Keyword tidak bergantung pada posisi/urutan label. Format tanggal dan teks aslinya ada pada **Ubah format atau lihat teks asli**.
5. Jika perlu, buka **Alat bantu scan**, tekan **Pilih area**, lalu tarik kotak dengan mouse/satu jari pada foto.
   **Preview crop** menampilkan crop + preset; **Baca area terpilih** menjalankan OCR crop.
   Jenis field dapat dipilih LOT/MFG/EXP/OTHER atau dideteksi dari keyword.
6. Setiap pembacaan crop menambah kartu baru (maksimal 30). Kartu memiliki preview,
   teks OCR asli, teks koreksi, jenis field, Terapkan ke field, dan Hapus catatan crop.
   Membuat seleksi baru atau Foto ulang tidak menghapus kartu sebelumnya dalam item yang sama.
7. Periksa form, centang konfirmasi, lalu tekan **Simpan item**. Gunakan **Analisis teks** di **Informasi tambahan** untuk parsing ulang; **Scan label** dapat ditekan
   kembali untuk membaca ulang. Kandidat tunggal mengisi field kosong saja; klik kandidat
   untuk mengganti field secara eksplisit. Tidak ada koreksi LOT O/0, I/1, S/5, B/8 otomatis.
8. Pilih status verifikasi, centang **Saya sudah memeriksa hasil scan**, lalu **Simpan item**.
   Perubahan berikutnya membatalkan centang; double submit dicegah. Menyimpan ulang item
   yang sama melakukan UPDATE, bukan membuat duplikat.
9. Tekan **Scan item berikutnya** untuk mengosongkan form/foto/crop. Jika belum disimpan,
   ada konfirmasi pembuangan perubahan. Semua item tetap dalam sesi yang sama.
10. Buka detail sesi untuk jumlah item/terverifikasi, edit item, hapus, CSV, atau selesaikan sesi.

Gambar kerja dibatasi maksimal sisi 2560px; koordinat crop dihitung dalam piksel canvas
sumber (bukan CSS). Metadata menyimpan x/y/width/height serta dimensi canvas sumber dan preset.
Preview asli tetap bersih: rectangle berada pada canvas overlay terpisah, tidak masuk OCR.

## Tanggal Dan Verifikasi

- LOT Number opsional. Jika tercantum, OCR mengenali LOT / LOT NUMBER / BATCH dan pengguna
  dapat mengoreksi nilainya. Jika tidak ada atau tidak terbaca, biarkan kosong; item tetap
  dapat disimpan dengan informasi produk atau hasil scan lain, setelah dikonfirmasi.
- ISO `YYYY-MM-DD`, tanggal numerik dengan pemisah titik/strip/garis miring, `DDMMYYYY`,
  `YYYYMMDD`, serta nama/singkatan bulan Indonesia dan Inggris didukung.
  `11 agustus 2026`, `11 aug 2026`, dan `2026.08.11` dibaca sebagai `2026-08-11`.
- `26.08.11` tidak ditebak: pilih **YY.MM.DD** dan **2000-2099** untuk `2026-08-11`,
  atau **DD.MM.YY** dan **2000-2099** untuk `2011-08-26`. Pilihan interpretasi otomatis terbuka
  jika hasil scan MG/MFG atau ED/EXP ambigu. Setelah format dan abad dipilih, input tanggal langsung
  diperbarui otomatis jika valid; pilihan yang belum lengkap/invalid mengosongkan tanggal lama.
- `03/04/2025` menampilkan dua kandidat; tidak diisi otomatis. Pilih format pada
  **Interpretasi kode tanggal**, lalu **Interpretasikan**.
- Kode enam digit memerlukan pilihan **YYMMDD atau DDMMYY sekaligus abad** 1900/2000/2100.
  Tidak ada century pivot tersembunyi. `251218` dapat berarti 2025-12-18 atau 2018-12-25.
- `DEC 2027` tidak diubah ke hari pertama/terakhir bulan. Simpan teks mentah dan perlu verifikasi.
- Kode tanpa keyword tidak otomatis ditetapkan ke MFG/EXP. Kalender dan tahun kabisat divalidasi.
- Koreksi karakter pada tanggal hanya saran, bukan penggantian otomatis. Periksa foto, lalu edit raw text.
- EXP sebelum MFG memunculkan peringatan; nilai tidak ditukar. Backend menandai `needs_review`.
- Raw tanggal tanpa parsed date juga ditandai `needs_review` oleh backend, bahkan jika browser mengirim `verified`.
- Produk boleh tidak memiliki salah satu atau kedua tanggal. Item dengan semua informasi produk/OCR kosong ditolak.
- Confidence berasal dari OCR, bukan probabilitas kebenaran bisnis. Confidence rendah tetap dapat menghasilkan
  teks yang benar; confidence tinggi tetap perlu diperiksa. `verified` adalah konfirmasi manusia.

## Arsitektur

- `database/migrations/2026_10_16_000001_create_receiving_tables.php`: FK, index, sesi/item/multi-scan.
- `app/Models/`: relasi Eloquent, tanggal `DATE` ISO, scope kepemilikan.
- `app/Http/Requests/`: validasi payload, konfirmasi, batas crop, whitelist metadata.
- `app/Policies/`: akses sesi/item. `app/Http/Middleware/`: akun aktif dan admin.
- `app/Http/Controllers/`: session auth, API transaksional, CSV tahan formula injection, halaman, akun.
- `resources/views/`: Blade dengan escaping. `public/css/app.css`: UI mobile-first lokal, tanpa CDN.
- `public/js/scanner/camera.js`: izin, perangkat, torch, lifecycle track.
- `image-capture.js`, `image-cropper.js`, `image-preprocessor.js`: capture, Pointer Events, crop, preset.
- `ocr-engine.js`: satu worker reusable, bahasa `eng` eksplisit, progress, retry error, terminate.
- `lot-mfg-exp-parser.js`: parser murni tanpa DOM, kandidat dan ambiguitas tanggal.
- `scanner-ui.js`, `item-form.js`, `api-client.js`: orchestration, konfirmasi, Fetch + CSRF.
- `docker-compose.yml`, `Dockerfile`, `docker/nginx/default.conf`: service terpisah dengan named volumes.

Preprocessing: asli, grayscale, kontras sedang, threshold tetap. Crop kecil diperbesar maksimal 3x
dan canvas OCR dibatasi 3000px. Preset asli adalah default untuk menghindari kerusakan karakter.
Tidak ada OCR setiap frame; hanya Capture -> OCR. Worker dipakai ulang sampai keluar scanner.
Kamera berhenti saat capture, OCR, tab disembunyikan, atau meninggalkan halaman.

## REST API

Base path `/api`. Health publik; endpoint lainnya membutuhkan cookie login Laravel.
Endpoint mutasi memakai middleware web + CSRF, bukan API publik tanpa proteksi.
Gunakan `Accept: application/json`, `Content-Type: application/json`, dan `X-CSRF-TOKEN`
dari meta tag halaman, dengan Fetch `credentials: 'same-origin'`.
Token Sanctum/Bearer dan autentikasi integrasi ERP belum disediakan.

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/health` | Status aplikasi + koneksi DB (200/503) |
| GET/POST | `/api/receiving-sessions` | Daftar pagination / buat sesi |
| GET | `/api/receiving-sessions/{id}` | Detail sesi + pagination item |
| PATCH | `/api/receiving-sessions/{id}/status` | open/completed (admin/supervisor) |
| POST | `/api/receiving-sessions/{id}/items` | Simpan item + semua catatan crop dalam transaksi |
| GET/PUT/DELETE | `/api/receiving-items/{id}` | Detail / koreksi / hapus item |
| POST | `/api/users` | Buat pengguna (admin) |
| PUT | `/api/users/{id}` | Role/status/data/password pengguna (admin) |

GET daftar menerima `?search=...&status=open&page=1`. Detail sesi memisahkan
`data.session` dan `data.items` (paginator). Export: GET `/receiving-sessions/{id}/export`.
PUT item menggunakan payload form yang sama; `confirmed` dan `verification_status` wajib.
Jika `scans` tidak disertakan, catatan lama dipertahankan. Jika disertakan, daftar diganti atomik.
Owner dan status sesi tidak dapat dipalsukan lewat mass assignment.

Contoh pemanggilan pada console browser setelah login (gunakan ID sesi Anda):

```javascript
const response = await fetch('/api/receiving-sessions/1/items', {
  method: 'POST', credentials: 'same-origin',
  headers: {
    Accept: 'application/json', 'Content-Type': 'application/json',
    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
  },
  body: JSON.stringify({
    product_name: 'Produk A', lot_number: 'ABC12345',
    mfg_raw: '25 DEC 2025', mfg_date: '2025-12-25',
    exp_raw: 'DEC 2027', exp_date: null,
    verification_status: 'needs_review', confirmed: true,
    scans: [{ field_type: 'LOT', raw_text: 'LOT ABC12345', confidence: 88 }],
  }),
});
console.log(await response.json());
```

Response sukses `{data, message, warnings?}`; gagal `{data: null, message, errors}`.
Status: 201 create, 200 read/update/delete, 401 belum login, 403 akses ditolak/sesi tertutup,
404 tidak ditemukan, 419 CSRF/session, 422 validasi, 429 rate limit.
API 60 request/menit/pengguna; login 5/menit/email+IP dan 30/menit/IP;
export 20/menit; ganti password 10/menit. Foto/base64 bukan bagian kontrak API.

## Android, HTTPS, Dan Privasi

`http://localhost:8092` aman untuk pengembangan pada komputer itu sendiri.
`localhost` di HP menunjuk HP, bukan komputer. Kamera pada `http://IP-KOMPUTER:8092`
umumnya diblokir browser karena bukan secure context; upload foto/manual tetap tersedia.
Untuk kamera HP gunakan reverse proxy HTTPS dengan sertifikat yang dipercaya perangkat,
misalnya domain internal/publik yang menuju host ini dan proxy ke port 8092.

Contoh Caddy di host/proxy terpisah, setelah DNS dan akses jaringan disiapkan:

```caddyfile
scanner.example.com {
    reverse_proxy 127.0.0.1:8092
}
```

Ganti domain contoh dengan domain sendiri; sertifikat dan port 80/443 harus dikonfigurasi operator.
Untuk CA internal, instal CA root pada HP; sekadar melewati peringatan sertifikat belum tentu cukup.
Atur `.env`: `APP_URL=https://domain-anda`, `SESSION_SECURE_COOKIE=true`, `APP_DEBUG=false`,
lalu recreate app/web. APP_URL HTTPS memaksa URL yang dihasilkan Laravel menggunakan HTTPS.
Jangan menyalakan secure cookie untuk URL HTTP localhost. Tidak ada trust proxy wildcard;
jika menambahkan proxy, atur hanya IP proxy tepercaya untuk rate limit IP klien yang benar.
Batasi port 8092 dengan firewall atau bind localhost jika reverse proxy dipakai di host yang sama.
Uji Start, Capture, Retake, Torch, dan Switch pada HP Android fisik; hardware tidak dapat dibuktikan oleh fake camera test.

Foto hanya ada di RAM halaman dan hilang saat reload/Scan item berikutnya. Yang tersimpan:
data produk, teks OCR/crop, confidence, metadata koordinat, waktu, dan pengguna pembuat sesi.
Retensi data teks/database ditentukan operator (tidak ada penghapusan otomatis); hanya pengguna
berhak dapat membacanya. Aplikasi tidak menyimpan bukti foto dan tidak menyediakan upload gambar.

## OCR Offline Dan Lisensi

Semua aset OCR dilayani dari `/vendor/ocr/`: JS, worker, semua varian WASM core,
dan `lang/eng.traineddata.gz`. Docker build menyalin dependency yang dikunci `package-lock.json`;
tidak ada fallback CDN tersembunyi. Font juga lokal.

Library OCR dimuat saat tombol Baca/OCR ditekan; proses menunggu sampai library siap.
Jika pemuatan gagal, tombol yang sama dapat dicoba lagi tanpa memuat ulang halaman.

Untuk menyiapkan aset tanpa build Docker (Node 20+):

```bash
npm ci
npm run vendor:ocr
```

Salin seluruh `public/vendor/ocr/`, bukan hanya `tesseract.min.js`, ke paket offline.
Untuk deployment sepenuhnya offline, build image saat online lalu `docker save` image
app/web dan `mariadb:10.11`, pindahkan arsip, dan `docker load` pada host tujuan.
Jalankan `docker compose up -d --no-build --pull never` setelah menjalankan setup lokal.
Cold load tetap memerlukan akses LAN ke server; OCR tidak memerlukan internet publik.
Jangan menghapus salah satu varian core: worker memilih SIMD/LSTM sesuai browser.
Bahasa Inggris mencakup kode alfanumerik/nama bulan yang digunakan; OCR bahasa lain perlu aset tambahan.
Lisensi: Tesseract/core/traineddata Apache-2.0, Laravel MIT, Manrope OFL-1.1.
Baca `THIRD_PARTY_NOTICES.md` dan notice font/aset.

## Testing

```bash
# Backend: SQLite in-memory, tidak menyentuh MariaDB operasional
docker compose exec app php artisan test

# Parser tanggal/keyword/crop geometry: Node bawaan, tanpa runner berat
npm ci
npm test

# Browser nyata headless: butuh aplikasi aktif dan akun admin test
npx playwright install chromium
npm run test:browser

# Persistensi: restart service proyek ini, probe dibuat lalu dihapus
bash scripts/test-persistence.sh
```

Jalankan browser test pada instance development khusus, bukan database operasional.
Tests membuat sesi berprefiks `E2E-` dengan fixture sintetis; sesi ini sengaja dapat dilihat
untuk inspeksi dan tidak dihapus otomatis. Login menggunakan admin awal dari `.env` atau
`TEST_EMAIL=... TEST_PASSWORD=... npm run test:browser` jika password sudah diganti.
`TEST_BASE_URL` mengganti alamat aplikasi. Browser state disimpan dalam memori, bukan file.
Artefak `test-results/` dapat mengandung data uji; tidak masuk Git/image.

Backend mencakup autentikasi, role/IDOR, CSRF, create/relasi/multi-item/crop,
validasi kalender, konfirmasi wajib, raw ambigu, EXP<MFG, item tanpa tanggal, edit,
cascade delete, CSV injection, nonaktif akun, dan password. JS mencakup seluruh contoh
label, dictionary, urutan acak, ambiguitas, leap year, koreksi kontekstual, dan koordinat crop.
Browser mencakup OCR WASM benar-benar berjalan dari aset lokal, worker reusable,
multi-crop mouse, crop touch, konfirmasi batal setelah edit, save/edit/CSV,
fake camera stop/retake, serta viewport 390px tanpa overflow halaman.

Tes fixture bersih tidak mengukur akurasi lapangan. Label melengkung, emboss, refleksi,
blur, pencetakan dot-matrix, atau kontras buruk masih memerlukan crop/preset/manual.

## Backup

Contoh backup menggunakan kredensial dari environment container, tidak menulisnya di command host:

```bash
docker compose exec -T db sh -c 'exec mariadb-dump -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" --single-transaction "$MARIADB_DATABASE"' > backup.sql
```

Backup juga `.env` dengan akses terbatas. Uji restore pada instance terpisah sebelum
menggunakannya untuk pemulihan. Database tidak hilang setelah restart/rebuild selama volume tidak dihapus.

## Troubleshooting

- **`item-form.js` membaca `.value` dari null / kamera tidak bereaksi setelah deploy:** HTML Blade dan JavaScript
  dapat berbeda versi jika hanya satu image di-rebuild atau compiled view lama masih tersimpan di volume storage.
  Rebuild **app dan web**, jalankan `docker compose exec --user www-data app php artisan view:clear`, lalu muat ulang halaman.
  Entrypoint sekarang membersihkan compiled view saat app dimulai, dan JavaScript aplikasi selalu direvalidasi browser.
  JavaScript tetap dapat menjalankan kamera dan tanggal lengkap pada form lama tanpa kontrol bulan/tahun;
  tanggal bulanan dipertahankan sebagai teks mentah dan perlu review sampai HTML baru tersedia, bukan diberi hari buatan.
- **Port terpakai:** `ss -ltnp | grep ':8092'`; jangan hentikan service proyek lain.
  Ubah APP_PORT dan APP_URL jika secara sadar membutuhkan port lain.
- **DB belum siap / app restart:** lihat `docker compose logs db app`; periksa password,
  health check, dan kapasitas disk. Mengganti password `.env` tidak otomatis mengubah user
  database pada volume lama; ubah password DB secara terencana, jangan hapus volumenya.
- **Permission storage:** `docker compose exec app chown -R www-data:www-data storage bootstrap/cache`.
  Jalankan operasi tulis cache/view sebagai www-data. Tests memakai cache/session array dan
  compiled views di `/tmp`, terpisah dari runtime.
- **419:** muat ulang/login ulang; pastikan origin/cookie benar. HTTP localhost tidak
  boleh memakai SESSION_SECURE_COOKIE=true. Jangan menonaktifkan CSRF sebagai solusi.
- **429:** tunggu sesuai Retry-After; jangan mematikan rate limiter untuk mengulang login cepat.
- **Worker/language gagal:** periksa tab Network `/vendor/ocr/worker.min.js`, direktori core,
  dan `lang/eng.traineddata.gz`; rebuild image. Perangkat bermemori kecil mungkin perlu crop lebih kecil.
- **Kamera ditolak:** cek izin situs/OS, tutup aplikasi lain yang memakai kamera, gunakan HTTPS,
  dan pilih foto sebagai alternatif. Tombol lampu/ganti kamera disabled berarti tidak didukung.
- **OCR keliru:** gunakan pencahayaan merata, fokus lebih dekat, pilih area kecil, lalu coba preset.
  Jangan menganggap threshold selalu lebih baik; ubah hasil secara manual dan konfirmasi.
- **Akun awal tidak muncul:** periksa INITIAL_ADMIN_EMAIL/PASSWORD dan log app. Bootstrap
  tidak membuat akun tambahan bila users sudah terisi; gunakan admin yang ada.

## Batasan Yang Disengaja

Tidak ada integrasi ERP, barcode decoder otomatis (field barcode manual), bukti foto permanen,
reset password lewat email, offline database/service-worker PWA, atau token API eksternal.
CSV diekspor per sesi. Viewer memang dapat membaca seluruh sesi; operator hanya sesi sendiri.
Bahasa OCR awal hanya Inggris. HTTPS publik dan pengujian kamera/torch HP fisik perlu
infrastruktur/perangkat operator. Evaluasi ulang dependency dan framework sebelum produksi.

# ocr-scan-mma
