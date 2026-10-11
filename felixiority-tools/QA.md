# Laporan verifikasi — FELIXIORITY TOOLS

Status: **pengujian di bawah merupakan hasil source awal berbasis Redis, sebelum migrasi Turso**. Hasil tersebut tidak membuktikan source revisi telah lolos build atau tes terbaru. Ini belum merupakan persetujuan produksi untuk instalasi Pterodactyl tertentu.

## Hasil historis sebelum migrasi (bukan hasil revisi)

| Pemeriksaan | Hasil |
| --- | --- |
| Next.js production build | Lulus; `/` prerendered dan `/api/[...path]` dynamic Node.js |
| TypeScript | Lulus sebagai bagian build terakhir |
| Vitest | 89/89 lulus, 8 file test, 0 gagal |
| Daftar Playwright | 8 skenario terdaftar: 4 skenario × desktop/Android |
| Sintaks setup Bash | Lulus `bash -n deploy/setup.sh` |
| Audit dependency produksi | 0 advisory dilaporkan saat pemeriksaan `npm audit --omit=dev` |

Rincian Vitest:

| Modul | Jumlah | Cakupan |
| --- | ---: | --- |
| security | 26 | Public/private IPv4/IPv6, metadata IP, URL, DNS campuran, origin, enkripsi dan modifikasi ciphertext |
| model | 11 | Owner >100, admin, user tanpa server, seluruh status non-stopped, proteksi |
| transport | 13 | 205 item/3 halaman, duplikat, total berubah, partial data, redirect, HTTP errors, DNS pinning, tidak retry DELETE |
| runtime | 8 | Tanpa PTLC, offline→stopped, suspended, format salah, 403/429/502/503 menjadi unknown |
| runtime-sync | 5 | Ronde otomatis, tidak mengarang tanpa key, cache dedup, cooldown rate limit, snapshot stale |
| jobs | 16 | Preview/confirmation, recheck, delete API call, hasil partial, stopped→running, protected/admin, owner baru, dry-run, suspend/unsuspend, cancel, upaya tidak pasti |
| routes | 6 | Connect valid/invalid, cookie flags, origin, CSRF, sesi expired, tidak mengembalikan API key |
| sync | 4 | Snapshot lengkap, node failure tanpa total palsu nol, user/server failure menghentikan publikasi |

Pengujian integration menggunakan transport/store fixture yang dikendalikan. Production modules kini memanggil HTTPS Pterodactyl dan Turso; tidak ada fallback mock dalam aplikasi produksi. Laporan JSON mentah disertakan dalam `verification/test-results.json`; output build dalam `verification/build-results.txt`.

## Belum dijalankan / belum dapat dinyatakan lulus

- Browser Chromium/Android: file tes sudah disediakan dan discovery berhasil, tetapi browser automation yang didukung tidak tersedia di lingkungan ini. Tidak ada klaim screenshot atau visual QA lulus.
- Panel asli: tidak tersedia domain/key panel disposable untuk menguji connect, izin, operasi nyata, data >100, dan runtime Wings.
- Turso, Docker Compose, Nginx, sertifikat TLS, dan systemd pada VPS target: konfigurasi disediakan; deployment belum dijalankan di VPS pengguna.
- Race dari operasi eksternal di panel tidak dapat dieliminasi melalui Application API standar. Periksa bagian runtime pada README.
- Cakupan Client API di seluruh server, cache runtime upstream, serta versi/fork panel belum diverifikasi. Versi instalasi tidak dideteksi otomatis.
- Agent Wings langsung dan analisis subuser belum diimplementasikan; UI menyatakan keterbatasan sumber data.

## Gate penerimaan pada VPS Anda

1. Pasang HTTPS + Turso dan pastikan koneksi app normal.
2. Jalankan `npm run test:e2e` dengan Chromium terpasang untuk desktop dan Android. Tes ini menguji UI melalui fixture, bukan panel asli.
3. Gunakan panel/akun/server disposable yang Anda miliki. Coba PTLA benar/salah dan key read-only. Pastikan semua permission failure tampil jujur.
4. Bandingkan seluruh total users/servers dengan panel yang berisi >100 item; uji halaman terakhir, pencarian, dan daftar admin.
5. Tambahkan PTLC, bandingkan state running/stopped/starting/suspended/unknown dan timestamps. Cabut akses Client API atau putus node: tidak boleh menjadi stopped.
6. Aktifkan dry-run. Preview server protected, admin, dan akun dengan server tidak boleh lolos cleanup yang tidak sesuai.
7. Pada resource disposable saja, uji suspend/unsuspend, rename, delete individual/massal, serta partial failure. Verifikasi kondisi panel, bukan hanya toast.
8. Ubah stopped→running sebelum delete, tambahkan server milik unused user, dan ubah role menjadi admin. Periksa hasil item ditolak saat preflight.
9. Uji expiry/disconnect dan pastikan credentials tidak ada di URL, localStorage, log, atau respons session.
10. Baru nyatakan instance Anda lolos acceptance setelah pemeriksaan aktual tersebut berhasil.

## Verifikasi revisi Turso

Source kini menggunakan `@libsql/client/web` dengan atomic SQL untuk rate limit dan lease lock, sesi terenkripsi, TTL cache, proteksi, serta audit. Belum ada database Turso kredensial pengguna untuk menjalankan integrasi end-to-end. **Jangan menganggap source ini bebas error produksi sebelum `npm ci`, `npm run typecheck`, `npm test`, dan `npm run build` serta smoke test Turso berhasil.**
