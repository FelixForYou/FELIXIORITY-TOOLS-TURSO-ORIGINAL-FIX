import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "./errors";
export const token = () => randomBytes(32).toString("hex");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function publicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function panelURL(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new AppError(
      400,
      "INVALID_DOMAIN",
      "Masukkan domain HTTPS yang valid.",
    );
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    (u.pathname !== "/" && u.pathname !== "") ||
    (u.port && u.port !== "443")
  )
    throw new AppError(
      400,
      "INVALID_DOMAIN",
      "Gunakan origin HTTPS tanpa path, port khusus, kredensial, atau query.",
    );
  const host = u.hostname.replace(/\.$/, "").toLowerCase();
  if (host !== u.hostname || !host.includes(".") || host === "localhost")
    throw new AppError(
      400,
      "INVALID_DOMAIN",
      "Gunakan hostname publik yang valid.",
    );
  const allow = (process.env.PANEL_ALLOWED_HOSTS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (allow.length && !allow.includes(host))
    throw new AppError(
      403,
      "HOST_BLOCKED",
      "Domain tidak masuk daftar panel yang diizinkan.",
    );
  return u.origin;
}
export async function resolvePublic(host: string) {
  const list = await dns
    .lookup(host, { all: true, verbatim: true })
    .catch(() => {
      throw new AppError(
        502,
        "DNS_FAILED",
        "Domain panel tidak dapat ditemukan.",
      );
    });
  if (!list.length || list.some((x) => !publicAddress(x.address)))
    throw new AppError(
      400,
      "SSRF_BLOCKED",
      "Target harus memakai alamat IP publik. Alamat internal diblokir.",
    );
  return list.find((item) => item.family === 4) || list[0];
}
export function checkOrigin(req: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin)
    throw new AppError(503, "CONFIG", "APP_ORIGIN belum dikonfigurasi.");
  if (
    req.headers.get("origin") !== origin ||
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AppError(
      403,
      "CSRF",
      "Asal permintaan ditolak. Muat ulang halaman.",
    );
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "CONTENT_TYPE", "Gunakan application/json.");
}
