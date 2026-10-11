"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Server,
  Activity,
  Layers,
  KeyRound,
  Globe,
  Terminal,
  Check,
  LoaderCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { api } from "@/lib/client";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        F<span>.</span>
      </span>
      <span>
        FELIXIORITY<span className="brand-sub">TOOLS / PANEL MANAGEMENT</span>
      </span>
    </span>
  );
}
export function Connect({ onConnected }: { onConnected: () => void }) {
  const [domain, D] = useState(""),
    [key, K] = useState(""),
    [show, S] = useState(false),
    [busy, B] = useState(false),
    [error, E] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    B(true);
    E("");
    try {
      await api("connect", { domain: domain.trim(), key: key.trim() });
      K("");
      onConnected();
    } catch (e) {
      E(e instanceof Error ? e.message : "Gagal terhubung.");
    } finally {
      B(false);
    }
  }
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <nav>
          <a href="#fitur">Fitur</a>
          <a href="#cara">Cara kerja</a>
          <a href="#faq">FAQ</a>
        </nav>
        <span className="header-tag">
          <span className="dot" /> PTERODACTYL 1.x
        </span>
      </header>
      <main>
        <section className="hero">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="eyebrow">
              <span className="tiny-square" /> YOUR PANEL. YOUR CONTROL.
            </div>
            <h1>
              Manage Your
              <br />
              Panel.
              <br />
              <span className="underline-word">Effortlessly.</span>
            </h1>
            <p className="hero-copy">
              Kelola seluruh server dan pengguna Pterodactyl dalam satu
              dashboard yang cepat, sederhana, dan terintegrasi.
            </p>
            <div className="hero-pills">
              <span>
                <Check size={15} /> Tanpa akun tambahan
              </span>
              <span>
                <ShieldCheck size={15} /> Sesi sementara
              </span>
            </div>
          </motion.div>
          <div className="connect-stack">
            <div className="infrastructure" aria-hidden="true">
              <svg viewBox="0 0 520 240" role="img">
                <defs>
                  <pattern
                    id="grid"
                    width="24"
                    height="24"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 24 0 L 0 0 0 24"
                      fill="none"
                      stroke="#c1d3ee"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="520" height="240" rx="16" fill="url(#grid)" />
                <path
                  d="M95 113 L260 204 L434 113 L268 29Z"
                  fill="#d5e3fa"
                  stroke="#101827"
                  strokeWidth="2"
                />
                <path
                  d="M137 81l116 64v57l-116-64z"
                  fill="#12356b"
                  stroke="#101827"
                  strokeWidth="3"
                />
                <path
                  d="M253 145l106-59v57l-106 59z"
                  fill="#2563eb"
                  stroke="#101827"
                  strokeWidth="3"
                />
                <path
                  d="M137 81l108-60 114 65-106 59z"
                  fill="white"
                  stroke="#101827"
                  strokeWidth="3"
                />
                {[0, 1, 2].map((i) => (
                  <g key={i} transform={`translate(0 ${i * 17})`}>
                    <path d="M149 94l89 48" stroke="#eaf2ff" strokeWidth="3" />
                    <circle cx="150" cy="95" r="3" fill="#95c4ff" />
                  </g>
                ))}
                <rect
                  x="333"
                  y="27"
                  width="136"
                  height="59"
                  rx="8"
                  fill="white"
                  stroke="#101827"
                  strokeWidth="3"
                />
                <text
                  x="348"
                  y="50"
                  fill="#12356b"
                  fontSize="12"
                  fontFamily="monospace"
                >
                  &gt; connect panel
                </text>
                <path d="M349 65h38m9 0h18" stroke="#2563eb" strokeWidth="4" />
                <path
                  d="M94 71v70h39m232 27h72v-61"
                  stroke="#101827"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
                <rect
                  x="66"
                  y="45"
                  width="54"
                  height="40"
                  rx="7"
                  fill="#2563eb"
                  stroke="#101827"
                  strokeWidth="3"
                />
                <path
                  d="M80 57l-7 8 7 8m23-16 7 8-7 8"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                />
              </svg>
              <span className="illustration-label">
                <Terminal size={13} /> INFRASTRUCTURE, SIMPLIFIED.
              </span>
            </div>
            <form className="connect-card" onSubmit={submit}>
              <div className="card-head">
                <div>
                  <span className="eyebrow">MULAI DI SINI</span>
                  <h2>Hubungkan panel.</h2>
                </div>
                <ArrowUpRight size={30} />
              </div>
              <label htmlFor="domain">Panel Domain</label>
              <div className="input-icon">
                <Globe size={18} />
                <input
                  id="domain"
                  type="url"
                  value={domain}
                  onChange={(e) => D(e.target.value)}
                  placeholder="https://panel.example.com"
                  required
                  autoComplete="url"
                />
              </div>
              <label htmlFor="key">Application API Key</label>
              <div className="input-icon">
                <KeyRound size={18} />
                <input
                  id="key"
                  type={show ? "text" : "password"}
                  value={key}
                  onChange={(e) => K(e.target.value)}
                  placeholder="ptla_xxxxxxxxxxxxxxxx"
                  required
                  pattern="ptla_[a-zA-Z0-9]{16,256}"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  aria-label={
                    show ? "Sembunyikan API key" : "Tampilkan API key"
                  }
                  onClick={() => S(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <Button className="full" disabled={busy}>
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={18} /> Memeriksa izin
                    panel…
                  </>
                ) : (
                  <>
                    Connect Panel <ArrowRight size={19} />
                  </>
                )}
              </Button>
              <p className="security-note">
                <ShieldCheck size={15} /> Key hanya disimpan dalam sesi backend
                sementara.
              </p>
            </form>
          </div>
        </section>
        <section className="trust-strip">
          <span>
            <Layers /> Pagination lengkap
          </span>
          <span>
            <Activity /> Sinkronisasi berkala
          </span>
          <span>
            <ShieldCheck /> Validasi sebelum hapus
          </span>
          <span>
            <Server /> Data panel asli
          </span>
        </section>
        <section id="fitur" className="landing-section">
          <div className="section-title">
            <div>
              <span className="eyebrow">ONE WORKSPACE. LESS FRICTION.</span>
              <h2>
                Semua kendali.
                <br />
                Satu tempat.
              </h2>
            </div>
            <p>
              Dari daftar server sampai cleanup.
              <br />
              Tahu apa yang dikelola sebelum bertindak.
            </p>
          </div>
          <div className="feature-grid">
            {[
              [
                Server,
                "01",
                "Kelola server",
                "Cari, filter, suspend, dan kelola server secara individual atau massal.",
              ],
              [
                Activity,
                "02",
                "Status yang jujur",
                "Runtime diverifikasi melalui Client API. Status tidak diketahui tidak dianggap offline.",
              ],
              [
                ShieldCheck,
                "03",
                "Cleanup terkendali",
                "Preview target, lindungi resource, lalu konfirmasi setiap operasi.",
              ],
            ].map(([Icon, n, title, copy]) => {
              const I = Icon as typeof Server;
              return (
                <article className="feature" key={String(n)}>
                  <div className="feature-top">
                    <I size={29} />
                    <span>{String(n)}</span>
                  </div>
                  <h3>{String(title)}</h3>
                  <p>{String(copy)}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section id="cara" className="how-section">
          <div>
            <span className="eyebrow">TANPA LANGKAH YANG BERLEBIHAN</span>
            <h2>
              Hubungkan.
              <br />
              Periksa. Kelola.
            </h2>
            <p>
              Domain dan Application API key adalah awalnya.
              <br />
              Tambahkan Client API di Settings untuk runtime.
            </p>
          </div>
          <ol>
            <li>
              <b>01</b>
              <span>Hubungkan panel HTTPS dengan PTLA.</span>
            </li>
            <li>
              <b>02</b>
              <span>Periksa data lengkap dan cakupan izin API.</span>
            </li>
            <li>
              <b>03</b>
              <span>Kelola resource dengan preview dan konfirmasi.</span>
            </li>
          </ol>
        </section>
        <section id="faq" className="landing-section faq">
          <h2>Pertanyaan umum.</h2>
          {[
            [
              "Apakah perlu membuat akun?",
              "Tidak. Cukup masukkan domain panel dan Application API key milik administrator.",
            ],
            [
              "Apakah PTLA bisa melihat server online?",
              "PTLA tidak menjamin akses power state. Tambahkan Client API di Settings. Hanya server yang dapat diakses key tersebut yang bisa diperiksa.",
            ],
            [
              "Seberapa sering data diperbarui?",
              "Dashboard memakai polling 15 detik dan menampilkan waktu sinkronisasi terakhir. Runtime memiliki waktu pemeriksaan terpisah.",
            ],
            [
              "Apakah export merupakan backup server?",
              "Bukan. Export hanya berisi metadata daftar resource. Data file server tidak disertakan.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span>+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </main>
      <footer>
        <Brand />
        <span>Built for control. Designed for clarity.</span>
      </footer>
    </div>
  );
}
