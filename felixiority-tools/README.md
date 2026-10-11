# FELIXIORITY TOOLS

Manajemen Pterodactyl 1.x dengan Next.js App Router, React, TypeScript, Tailwind CSS, komponen bergaya shadcn/Radix, Lucide, Motion, TanStack Query, Zod, dan Turso (libSQL). Desain navy–putih Neo-Brutalism; antarmuka utama berbahasa Indonesia.

**Status penyerahan:** implementasi frontend/backend tersedia dan memakai API nyata. Unit/integration test memakai fixture khusus tes. Tidak ada mode demo atau angka panel buatan di produksi. Uji ke panel Pterodactyl sungguhan dan QA visual browser belum dilakukan di lingkungan pembuatan. Lihat `QA.md` untuk bukti dan batas verifikasi. Jangan menganggap ZIP ini sudah lolos uji penerimaan terhadap instalasi panel Anda.


## Deploy Vercel — konfigurasi sama seperti source awal

Sumber tetap website **FELIXIORITY TOOLS**, bukan website auto-order. Tidak ada payment gateway, fitur jualan, Firebase, atau Redis. Root Directory: `felixiority-tools` (jika ZIP diekstrak utuh) atau `/` (jika yang di-upload hanya isi folder tersebut). Framework Next.js, Install Command `npm ci`, Build Command `npm run build`.

Di **Vercel → Project → Settings → Environment Variables** cukup variabel pada `.env.example`:

```env
APP_ORIGIN=https://tl-panelfelix.vercel.app
TURSO_DATABASE_URL=libsql://alamat-database-kamu.turso.io
TURSO_AUTH_TOKEN=isi-di-vercel-jangan-dibagikan
SESSION_SECRET=isi-64-karakter-hex-acak
SESSION_TTL_SECONDS=3600
ENABLE_BULK_DELETE=true
PANEL_ALLOWED_HOSTS=
TRUST_PROXY=false
ALLOW_INSECURE_DEV=false
```

Dua variabel Turso menggantikan satu `REDIS_URL`. Ini **sembilan ENV**; tidak ada ENV lain. Setelah mengisi dua nilai asli dari Turso dan `SESSION_SECRET`, lakukan Redeploy. Tabel Turso dibuat otomatis pertama kali API mengakses database; token memerlukan izin tulis. Jangan memasukkan PTLA/PTLC melalui ENV: keduanya dimasukkan di antarmuka seperti semula.

**Peringatan migrasi data:** sesi, protected IDs, dan audit yang dulu disimpan dalam Redis **tidak otomatis disalin** ke Turso. Jika Anda perlu menyelamatkan data lama, ekspor dahulu sebelum mematikan Redis. Pengguna perlu connect ulang setelah database berganti.

## Memulai di VPS Ubuntu dengan Docker

Diperlukan Docker Engine + Compose plugin, OpenSSL, Nginx, serta domain tools yang mengarah ke VPS. Gunakan Node.js 24 untuk opsi native. Jika Nginx panel sudah berjalan, pakai virtual host/domain baru; jangan menimpa konfigurasi panel.

1. Ekstrak ZIP, masuk ke folder `felixiority-tools`.
2. Jalankan (ganti domain tools):

```bash
bash deploy/setup.sh https://tools.domainanda.com
```

Script membuat `.env` jika belum ada, menghasilkan secret acak, lalu membangun/menjalankan container app. **Isi URL dan token Turso pada `.env` sebelum deploy**; jika menggunakan script setup, konfigurasi file `.env` dahulu sebelum aplikasi dipakai. Database ada di Turso. `.env` yang sudah ada tidak ditimpa. App hanya dipublikasikan di loopback `127.0.0.1:3000`; Ini belum memasang HTTPS.

3. Pasang virtual host Nginx:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/felixiority-tools
sudo nano /etc/nginx/sites-available/felixiority-tools
```

Ganti `tools.example.com` dengan domain tools Anda. Lalu:

```bash
sudo ln -s /etc/nginx/sites-available/felixiority-tools /etc/nginx/sites-enabled/felixiority-tools
sudo nginx -t
sudo systemctl reload nginx
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tools.domainanda.com --redirect
```

Jika symlink sudah ada, jangan membuatnya lagi. Jika port 3000 dipakai aplikasi lain, ganti port host pada `compose.yml` dan `proxy_pass` Nginx bersama-sama. Tidak ada port Redis yang perlu diatur.

4. Buka `https://tools.domainanda.com`. Masukkan domain **panel**, bukan domain tools, dan PTLA administrator.

Log dan pembaruan:

```bash
docker compose logs --tail=100 app
docker compose ps
docker compose up -d --build
```

Data proteksi server, pekerjaan, sesi terenkripsi, serta audit tersimpan di Turso. Simpan `.env` dengan hak akses terbatas. Tidak ada PTLA di `.env`.

## Opsi tanpa Docker

Pasang Node.js 24, npm, Nginx, dan unzip. Letakkan source di `/opt/felixiority-tools`; jalankan di folder tersebut:

```bash
npm ci
cp .env.example .env
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex')+'\\n')"
nano .env
npm test
npm run build
```

Isi `SESSION_SECRET` dengan hasil acak tadi, `APP_ORIGIN` dengan origin HTTPS tools tanpa slash akhir, serta `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN` dari Turso. Tidak memerlukan Redis. Setelah memasang konfigurasi Nginx/HTTPS di atas:

```bash
sudo useradd --system --home /opt/felixiority-tools --shell /usr/sbin/nologin felix
sudo chown -R felix:felix /opt/felixiority-tools
sudo chmod 600 /opt/felixiority-tools/.env
sudo cp deploy/felixiority-tools.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now felixiority-tools
sudo systemctl status felixiority-tools
```

Lewati `useradd` jika user sudah ada. Sesuaikan path Node pada service bila Node tidak berada di `/usr/bin/node`. `deploy/felixiority-tools.service` menggunakan port loopback 3000. `npm start` juga tersedia untuk lingkungan container/proses yang sudah dibatasi jaringan.

## Konfigurasi

| Variabel | Fungsi |
| --- | --- |
| `APP_ORIGIN` | Origin HTTPS aplikasi tools; harus sama persis dengan Origin browser, tanpa slash akhir. |
| `TURSO_DATABASE_URL` | URL koneksi `libsql://...` dari dashboard Turso. |
| `TURSO_AUTH_TOKEN` | Token database Turso; simpan rahasia di server/Vercel. |
| `SESSION_SECRET` | Tepat 64 karakter hex acak; enkripsi AES-256-GCM untuk kredensial sesi. Sama di seluruh instance. Mengganti secret membuat sesi lama tidak dapat dipakai. |
| `SESSION_TTL_SECONDS` | Masa sesi absolut; default 3.600 detik, rentang 300–86.400. |
| `ENABLE_BULK_DELETE` | Harus `true` untuk penghapusan lebih dari satu resource. Penghapusan satu resource tetap tersedia. |
| `PANEL_ALLOWED_HOSTS` | Opsional: hostname panel dipisah koma. Tanpa isian, origin HTTPS publik diterima setelah validasi SSRF. |
| `TRUST_PROXY` | `true` hanya di belakang proxy tepercaya yang menimpa `X-Real-IP`, seperti contoh Nginx. Jika `false`, limit koneksi awal berbagi bucket konservatif. |
| `ALLOW_INSECURE_DEV` | Hanya untuk `next dev` lokal. Tidak berlaku pada production. |

Development lokal:

```bash
# Siapkan Turso dan .env: APP_ORIGIN=http://127.0.0.1:3000,
# ALLOW_INSECURE_DEV=true, SESSION_SECRET acak, URL dan token Turso.
npm run dev
```

Koneksi ke panel tetap **wajib HTTPS dengan sertifikat valid**, bahkan saat tools berjalan di development. Origin panel harus hostname publik tanpa path, query, kredensial URL, atau port selain 443.

## Cara memakai

1. **Connect Panel:** hanya domain panel + PTLA. Backend menguji akses daftar users dan servers sebelum membuat sesi. Tidak ada akun website tambahan.
2. **Dashboard:** daftar lengkap dipoll setiap 15 detik. Total users/servers mengambil metadata pagination dan diverifikasi terhadap seluruh halaman serta ID unik. Kegagalan users/servers tidak menerbitkan snapshot parsial. Izin nodes yang gagal ditampilkan terpisah dan total node menjadi tidak tersedia, bukan nol.
3. **Servers/Users:** pencarian lokal atas daftar yang sudah diambil lengkap, filter, sortir, 15 item per halaman, seleksi seluruh hasil filter, detail, dan export. Di Android daftar menjadi kartu. Semua admin dilindungi di UI dan backend.
4. **Server detail:** rename, suspend, unsuspend, copy UUID, buka panel, tandai Protected, atau hapus. Detail port/egg memerlukan izin allocations/nests; keterbatasan izin ditampilkan.
5. **Settings:** masukkan Client API key `ptlc_...` untuk runtime. Key diuji melalui `/api/client/account`, disimpan hanya dalam sesi backend, dan tidak dikirim kembali ke browser. Key yang valid tidak berarti bisa membaca setiap server.
6. **Offline Cleaner:** Scan Servers → preview scan → mulai → pilih stopped → preview penghapusan → ketik teks konfirmasi. Runtime dicek lagi sebelum DELETE. Perubahan menjadi running/starting/stopping, suspended, unknown, atau Protected menggagalkan penghapusan item tersebut.
7. **Unused User Cleaner:** scan seluruh users/servers → pilih akun biasa tanpa server → konfirmasi. Sesaat sebelum DELETE, backend membaca user dan seluruh server lagi; akun yang memiliki server atau berubah menjadi admin dilewati. Server suspended/stopped tetap dihitung sebagai milik user.
8. **Dry-run:** aktifkan di Settings sebelum membuat pekerjaan. Preview menyimpan konfigurasi yang dipakai pekerjaan itu. Tidak mengirim delete/suspend/unsuspend; rename terpisah dan tetap mutasi nyata.
9. **Pekerjaan massal:** diproses bertahap, satu mutasi per langkah (scan runtime concurrency 4). Layar menunjukkan hasil tiap item. Batalkan menghentikan langkah berikutnya; request yang sedang dikirim tidak dapat dibatalkan secara transaksional.
10. **Disconnect:** menghapus sesi dan kredensialnya. Protected resources dan audit tetap tersimpan per origin panel. Aplikasi hanya menyimpan ID sesi pada cookie HttpOnly, Secure di produksi, SameSite Strict.

## Runtime, akurasi, dan batas penting

- PTLA tidak diperlakukan sebagai sumber power state. Runtime adapter menggunakan `GET /api/client/servers/{identifier}/resources` dengan PTLC; `offline` dipetakan ke `stopped` hanya dari respons valid. Suspended/installing dipisahkan.
- Dashboard melakukan pembacaan runtime otomatis dalam ronde terbatas: concurrency 4, maksimal 80 server per ronde, berhenti setelah budget kerja sekitar 8 detik setelah batch selesai. Request lambat bisa membuat ronde lebih lama; setiap request memiliki deadline. Ronde berikut memprioritaskan server paling lama diperiksa. Limit panel 429 memicu cooldown.
- Timestamp adalah **waktu respons diperiksa oleh tools**, bukan timestamp pengukuran Wings. Panel/proxy dapat memiliki cache runtime. Polling tidak sama dengan push instan. Hasil UI dianggap kedaluwarsa setelah 30 detik; jangan mengasumsikan state tidak pernah berubah di antara dua pemeriksaan.
- Angka total running/stopped hanya muncul ketika cakupan seluruh server valid dan masih fresh. Jika sebagian tidak diketahui, total menjadi `—` dan cakupan parsial dijelaskan. Untuk panel besar/latensi tinggi, cakupan segar seluruh panel bisa tidak tercapai. Scan manual menampilkan progres seluruh target.
- Error jaringan, 403, 429, 502/503, dan format tidak dikenal menjadi **unknown**. Adapter ini tidak bisa membuktikan node unreachable secara khusus dari kegagalan umum Client API, sehingga tidak membuat label tersebut tanpa bukti.
- Offline delete membaca ulang runtime dan status administratif serta melakukan beberapa observasi sesuai Settings. `minStopped` adalah rentang observasi saat preflight, bukan riwayat power state kontinu. Application API tidak menyediakan operasi atomik "delete only if still stopped"; administrator lain bisa mengubah state di antara pemeriksaan terakhir dan DELETE. Tidak ada jaminan nol race terhadap aksi langsung di panel. Koordinasikan operasi destruktif; gunakan dry-run untuk peninjauan pertama.
- Backend memakai distributed lease lock Turso per panel, heartbeat, dan verifikasi kepemilikan lock sebelum mutasi. Ini menyerialkan operasi **dari aplikasi ini**, bukan aktivitas administrator eksternal.
- Setiap upaya mutasi diberi marker sebelum eksekusi. Jika request/proses putus dan hasil tidak pasti, item tidak dicoba ulang otomatis; periksa panel, lalu buat preview baru bila diperlukan. DELETE tidak di-retry otomatis dan Force Delete tidak dipakai.
- Tidak ada akses database Pterodactyl langsung. Snapshot API bukan transaksi atomik lintas endpoint. Perubahan total/halaman, ID ganda, dan relasi owner hilang membatalkan snapshot; perubahan serentak yang tidak terlihat dalam metadata masih mungkin.
- Kontrak API ditargetkan untuk Pterodactyl 1.x. **Versi instalasi tidak dideteksi otomatis**; label UI menjelaskan hal ini. Fork panel/versi lain memerlukan pengujian kompatibilitas. Read permissions diverifikasi dari hasil request; write permissions baru teruji ketika aksi dijalankan, tanpa mutasi percobaan.
- Integrasi agent Wings langsung dan analisis keanggotaan subuser belum disediakan. Akun tanpa server mungkin masih subuser; UI memberi catatan untuk ditinjau.
- Daftar node menampilkan Location ID. Status online node tidak disimpulkan dari keberhasilan list API.
- Job disimpan maksimal satu jam dan discope ke sesi. Browser menggerakkan langkah pekerjaan; bukan background worker tahan penutupan tab. Menutup/reload tab menghentikan langkah baru; untuk pekerjaan yang terhenti, periksa hasil panel sebelum membuat preview baru.
- Export CSV/JSON berisi metadata, **bukan backup file server**. CSV mengutip field serta melindungi awalan formula spreadsheet.
- Audit adalah log tools, bukan seluruh aktivitas Pterodactyl. Maksimum 1.000 entri, hanya waktu/action/ID/hasil. Tidak menyimpan API key atau pesan upstream mentah.

## Keamanan implementasi

- Kredensial browser hanya berada dalam input sampai tersambung; tidak memakai localStorage, URL, analytics, atau logging kredensial. Tidak ada API key default.
- Session backend terenkripsi AES-256-GCM; ID cookie acak 256 bit, key penyimpanan di-hash, TTL absolut.
- Origin check + token CSRF per sesi untuk mutasi, JSON-only, body size limit, rate limit awal/sesi.
- URL panel dibatasi HTTPS/443. Semua alamat hasil DNS harus public unicast. Koneksi dipin ke IP tervalidasi, Host/SNI asli dipertahankan, redirect tidak diikuti. Loopback, LAN, link-local, metadata cloud, IPv4-mapped private IPv6, multicast, dan rentang khusus ditolak.
- TLS diverifikasi; tidak ada `rejectUnauthorized:false`. Kredensial hanya diteruskan ke origin panel yang dipilih.
- Produksi memerlukan HTTPS di reverse proxy. Jalankan app non-root; simpan token Turso hanya di backend; contoh Compose dan service disediakan.

## Pengujian

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Browser suite disediakan untuk Chromium desktop + Android:

```bash
npx playwright install chromium
npm run test:e2e
```

Suite browser memakai intercept jaringan khusus tes untuk menguji UI tanpa menghapus server sungguhan. Ini **bukan bukti API end-to-end terhadap panel asli**. Jalankan tahap smoke test di panel disposable: valid/invalid key, izin terbatas, >100 data, suspend/unsuspend, user/server disposable, partial failure, expiry, serta runtime stopped→running. Jangan melakukan pengujian delete pada data produksi yang ingin dipertahankan.

## Struktur

- `app/page.tsx`: provider Query/Motion, connect dan dashboard.
- `app/api/[...path]/route.ts`: API backend dengan session, CSRF, validasi, error mapping.
- `components/`: connect, dashboard, tabel/kartu, dialog dan button.
- `lib/services/`: transport HTTPS, pagination, users, servers, nodes, snapshot, runtime adapter dan ronde runtime.
- `lib/jobs.ts`: preview, confirmation, scan, preflight, langkah bulk, dry-run dan hasil per item.
- `lib/store.ts`: Turso (libSQL), enkripsi, TTL, lock, rate limit, protected IDs, audit.
- `lib/security.ts`: URL, IP, DNS, origin.
- `tests/`: unit dan integration tests dengan fixture hanya untuk tes.
- `e2e/`: browser tests.
- `deploy/`, `Dockerfile`, `compose.yml`: deployment Ubuntu/container.

## Referensi kontrak

Implementasi mengikuti rute resmi Pterodactyl 1.x:

- https://github.com/pterodactyl/panel/blob/1.0-develop/routes/api-application.php
- https://github.com/pterodactyl/panel/blob/1.0-develop/routes/api-client.php

Endpoint rename: `PATCH /api/application/servers/{id}/details`; delete biasa tanpa suffix force. Baca `QA.md` sebelum menyatakan deployment Anda lolos penerimaan.
