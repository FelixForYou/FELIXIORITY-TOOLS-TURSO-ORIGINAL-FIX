import { createClient, type Client } from "@libsql/client/web";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "./errors";
import { hash, token } from "./security";
import type { Session, Audit } from "./model";

// Turso replaces the Redis store, keeping the same public interface for all routes,
// jobs and components. Tables are created lazily; no manual SQL or extra ENV needed.
const globalStore = globalThis as unknown as {
  felixTursoClient?: Client;
  felixTursoReady?: Promise<void>;
  felixLastSweep?: number;
};

function client(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken)
    throw new AppError(503, "CONFIG", "Isi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN di Vercel.");
  if (!/^libsql:\/\/[\w.-]+(?:\/)?$/.test(url) && !/^https:\/\/[\w.-]+(?:\/)?$/.test(url))
    throw new AppError(503, "CONFIG", "TURSO_DATABASE_URL tidak valid.");
  return (globalStore.felixTursoClient ??= createClient({ url, authToken }));
}

async function db(): Promise<Client> {
  const c = client();
  if (!globalStore.felixTursoReady) {
    globalStore.felixTursoReady = (async () => {
      await c.execute(`CREATE TABLE IF NOT EXISTS felix_kv (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL
      )`);
      await c.execute(`CREATE TABLE IF NOT EXISTS felix_rates (
        key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL
      )`);
      await c.execute(`CREATE TABLE IF NOT EXISTS felix_locks (
        key TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL
      )`);
      await c.execute(`CREATE TABLE IF NOT EXISTS felix_protected (
        panel TEXT NOT NULL, server_id INTEGER NOT NULL,
        PRIMARY KEY (panel, server_id)
      )`);
      await c.execute(`CREATE TABLE IF NOT EXISTS felix_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        panel TEXT NOT NULL, created_at INTEGER NOT NULL, value TEXT NOT NULL
      )`);
      await c.execute(`CREATE INDEX IF NOT EXISTS felix_audit_panel_idx
        ON felix_audit(panel, id DESC)`);
      await c.execute("CREATE INDEX IF NOT EXISTS felix_kv_expiry_idx ON felix_kv(expires_at)");
      await c.execute("CREATE INDEX IF NOT EXISTS felix_rates_expiry_idx ON felix_rates(expires_at)");
      await c.execute("CREATE INDEX IF NOT EXISTS felix_locks_expiry_idx ON felix_locks(expires_at)");
    })().catch((err) => {
      globalStore.felixTursoReady = undefined;
      throw err;
    });
  }
  await globalStore.felixTursoReady;
  // Turso does not automatically expire SQL rows like Redis did.
  // Bounded lazy sweeping prevents expired sessions/cache/rate rows from
  // consuming the free database indefinitely. Reads still enforce TTLs.
  const now = Date.now();
  if (now - (globalStore.felixLastSweep ?? 0) > 15 * 60_000) {
    globalStore.felixLastSweep = now;
    try {
      await c.batch([
        { sql: "DELETE FROM felix_kv WHERE expires_at <= ?", args: [now] },
        { sql: "DELETE FROM felix_rates WHERE expires_at <= ?", args: [now] },
        { sql: "DELETE FROM felix_locks WHERE expires_at <= ?", args: [now] },
      ], "write");
    } catch {
      // Cleanup is best-effort. Do not block valid requests over pruning.
      globalStore.felixLastSweep = 0;
    }
  }
  return c;
}

function encryptionKey() {
  const s = process.env.SESSION_SECRET;
  if (!s || !/^[a-f0-9]{64}$/i.test(s))
    throw new AppError(503, "CONFIG", "SESSION_SECRET harus 64 karakter hex acak.");
  return Buffer.from(s, "hex");
}
export function seal(value: unknown) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}
export function unseal<T>(v: string): T {
  const b = Buffer.from(v, "base64"), d = createDecipheriv("aes-256-gcm", encryptionKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString());
}

async function read(key: string): Promise<string | null> {
  const c = await db();
  const result = await c.execute({
    sql: "SELECT value FROM felix_kv WHERE key = ? AND expires_at > ?",
    args: ["felix:" + key, Date.now()],
  });
  return result.rows.length ? String(result.rows[0].value) : null;
}
async function write(key: string, value: string, ttlSeconds: number) {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO felix_kv(key, value, expires_at) VALUES(?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at`,
    args: ["felix:" + key, value, Date.now() + Math.max(1, ttlSeconds) * 1000],
  });
}
export async function get<T>(key: string) {
  const v = await read(key);
  return v === null ? null : (JSON.parse(v) as T);
}
export async function put(key: string, v: unknown, ttl = 3600) {
  await write(key, JSON.stringify(v), ttl);
}
export async function del(key: string) {
  const c = await db();
  await c.execute({ sql: "DELETE FROM felix_kv WHERE key = ?", args: ["felix:" + key] });
}
export async function saveSession(sid: string, s: Session) {
  await write("session:" + hash(sid), seal(s), Math.max(1, Math.ceil((s.expiresAt - Date.now()) / 1000)));
}
export async function session(sid: string) {
  if (!/^[a-f0-9]{64}$/.test(sid))
    throw new AppError(401, "SESSION_EXPIRED", "Sesi berakhir. Hubungkan panel kembali.");
  const v = await read("session:" + hash(sid));
  if (!v) throw new AppError(401, "SESSION_EXPIRED", "Sesi berakhir. Hubungkan panel kembali.");
  const s = unseal<Session>(v);
  if (s.expiresAt < Date.now()) throw new AppError(401, "SESSION_EXPIRED", "Sesi berakhir.");
  return s;
}

// One atomic UPSERT; reliable across Vercel function instances and requests.
export async function rate(key: string, limit: number, seconds = 60) {
  const c = await db();
  const now = Date.now();
  const result = await c.execute({
    sql: `INSERT INTO felix_rates(key, hits, expires_at) VALUES(?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        hits = CASE WHEN felix_rates.expires_at <= ? THEN 1 ELSE felix_rates.hits + 1 END,
        expires_at = CASE WHEN felix_rates.expires_at <= ? THEN excluded.expires_at ELSE felix_rates.expires_at END
      RETURNING hits, expires_at`,
    args: ["felix:rate:" + hash(key), now + seconds * 1000, now, now],
  });
  const row = result.rows[0];
  if (Number(row.hits) > limit)
    throw new AppError(429, "RATE_LIMIT", "Terlalu banyak permintaan. Tunggu sebentar.", Math.max(1, Math.ceil((Number(row.expires_at) - now) / 1000)));
}
export const panelKey = (s: Session) => hash(s.domain);
export const scope = (sid: string) => hash(sid);
export async function audit(s: Session, action: string, outcome: string, target?: number) {
  const c = await db();
  const panel = panelKey(s);
  const item: Audit = { at: new Date().toISOString(), action, outcome, target };
  // Keep at most 1000 entries per panel; exclude events older than 30 days.
  await c.batch([
    { sql: "INSERT INTO felix_audit(panel, created_at, value) VALUES(?, ?, ?)", args: [panel, Date.now(), JSON.stringify(item)] },
    { sql: `DELETE FROM felix_audit WHERE panel = ? AND
       (created_at < ? OR id NOT IN (SELECT id FROM felix_audit WHERE panel = ? ORDER BY id DESC LIMIT 1000))`,
      args: [panel, Date.now() - 30 * 86400_000, panel] },
  ], "write");
}
export async function logs(s: Session) {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT value FROM felix_audit WHERE panel = ? AND created_at >= ? ORDER BY id DESC LIMIT 1000",
    args: [panelKey(s), Date.now() - 30 * 86400_000],
  });
  return r.rows.map(row => JSON.parse(String(row.value)) as Audit);
}
export async function protectedIds(s: Session) {
  const c = await db();
  const r = await c.execute({sql: "SELECT server_id FROM felix_protected WHERE panel = ?", args: [panelKey(s)]});
  return r.rows.map(row => Number(row.server_id));
}
export async function protect(s: Session, id: number, on: boolean) {
  const c = await db();
  if (on) await c.execute({
    sql: "INSERT INTO felix_protected(panel, server_id) VALUES(?, ?) ON CONFLICT DO NOTHING",
    args: [panelKey(s), id],
  });
  else await c.execute({sql: "DELETE FROM felix_protected WHERE panel = ? AND server_id = ?", args: [panelKey(s), id]});
}

// Compare-and-set lease: only its owner can renew or release it.
// Every destructive step calls assertHeld before making a Pterodactyl mutation.
export async function locked<T>(key: string, fn: (assertHeld: () => Promise<void>) => Promise<T>) {
  const c = await db();
  const k = "felix:lock:" + key;
  const owner = token();
  const now = Date.now();
  const leaseMs = 120000;
  const acquired = await c.execute({
    sql: `INSERT INTO felix_locks(key, owner, expires_at) VALUES(?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
      WHERE felix_locks.expires_at <= ?`,
    args: [k, owner, now + leaseMs, now],
  });
  if (acquired.rowsAffected !== 1)
    throw new AppError(409, "BUSY", "Operasi lain sedang berjalan. Coba lagi.");
  let lost = false;
  let renewing = false;
  const renew = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void c.execute({
      sql: "UPDATE felix_locks SET expires_at = ? WHERE key = ? AND owner = ? AND expires_at > ?",
      args: [Date.now() + leaseMs, k, owner, Date.now()],
    }).then(r => { if (r.rowsAffected !== 1) lost = true; })
      .catch(() => { lost = true; })
      .finally(() => { renewing = false; });
  }, 20000);
  renew.unref();
  const assertHeld = async () => {
    if (lost) throw new AppError(409, "LOCK_LOST", "Kunci operasi terputus. Tidak melanjutkan mutasi.");
    const r = await c.execute({
      sql: "SELECT owner FROM felix_locks WHERE key = ? AND owner = ? AND expires_at > ?",
      args: [k, owner, Date.now()],
    });
    if (!r.rows.length) throw new AppError(409, "LOCK_LOST", "Kunci operasi terputus. Tidak melanjutkan mutasi.");
  };
  try { return await fn(assertHeld); }
  finally {
    clearInterval(renew);
    await c.execute({ sql: "DELETE FROM felix_locks WHERE key = ? AND owner = ?", args: [k, owner] });
  }
}
