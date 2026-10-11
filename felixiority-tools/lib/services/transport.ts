import https from "node:https";
import { z } from "zod";
import { resolvePublic } from "../security";
import { AppError } from "../errors";
import type { Session } from "../model";
export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function request(
  s: Session,
  path: string,
  method = "GET",
  body?: unknown,
  client = false,
): Promise<unknown> {
  const u = new URL(s.domain);
  const addr = await resolvePublic(u.hostname);
  const key = client ? s.clientKey : s.key;
  if (!key)
    throw new AppError(409, "RUNTIME_UNAVAILABLE", "Client API belum diatur.");
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await new Promise<{
      status: number;
      body: string;
      retry: number;
    }>((resolve, reject) => {
      const req = https.request(
        {
          hostname: u.hostname,
          port: 443,
          family: addr.family,
          path,
          method,
          servername: u.hostname,
          agent: false,
          lookup: (_h, _o, cb) => cb(null, addr.address, addr.family),
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: "Application/vnd.pterodactyl.v1+json",
            "Content-Type": "application/json",
            "User-Agent": "FelixiorityTools/1.0",
          },
        },
        (r) => {
          const chunks: Buffer[] = [];
          let bytes = 0;
          r.on("data", (b: Buffer) => {
            chunks.push(b);
            bytes += b.byteLength;
            if (bytes > 8_000_000) {
              req.destroy();
              reject(
                new AppError(
                  502,
                  "RESPONSE_TOO_LARGE",
                  "Respons panel terlalu besar.",
                ),
              );
            }
          });
          r.on("end", () =>
            resolve({
              status: r.statusCode || 502,
              body: Buffer.concat(chunks).toString("utf8"),
              retry: Math.min(
                60,
                Math.max(1, Number(r.headers["retry-after"]) || 15),
              ),
            }),
          );
          r.on("error", () =>
            reject(
              new AppError(502, "PANEL_UNREACHABLE", "Respons panel terputus."),
            ),
          );
        },
      );
      req.setTimeout(12000, () => req.destroy());
      const deadline = setTimeout(() => req.destroy(), 15000);
      req.once("close", () => clearTimeout(deadline));
      req.on("error", () =>
        reject(
          new AppError(
            502,
            "PANEL_UNREACHABLE",
            "Panel tidak dapat dihubungi atau TLS gagal. Periksa panel dan sertifikat.",
          ),
        ),
      );
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
    if (res.status >= 200 && res.status < 300) {
      if (!res.body) return null;
      try {
        return JSON.parse(res.body);
      } catch {
        throw new AppError(
          502,
          "INVALID_RESPONSE",
          "Panel tidak mengirim JSON API yang valid.",
        );
      }
    }
    if (
      method === "GET" &&
      [502, 503, 504].includes(res.status) &&
      attempt < 2
    ) {
      await pause(300 * (attempt + 1));
      continue;
    }
    const messages: Record<number, string> = {
      401: "API key tidak valid atau dicabut.",
      403: "API key tidak memiliki izin untuk operasi ini.",
      404: "Resource atau endpoint tidak ditemukan.",
      422: "Panel menolak data. Periksa resource dan relasinya.",
      429: "Batas request panel tercapai. Tunggu sebelum mencoba lagi.",
      500: "Panel mengalami kesalahan internal.",
      502: "Panel atau node tidak dapat dihubungi.",
      503: "Layanan panel sedang tidak tersedia.",
    };
    throw new AppError(
      res.status === 401 ? 403 : res.status >= 500 ? 502 : res.status,
      "PANEL_" + res.status,
      messages[res.status] ||
        "Respons panel ditolak. Periksa kompatibilitas Pterodactyl 1.x.",
      res.status === 429 ? res.retry : undefined,
    );
  }
  throw new AppError(502, "PANEL_FAILED", "Permintaan panel gagal.");
}
export async function allPages<T extends { id: number }>(
  s: Session,
  resource: string,
  schema: z.ZodType<T>,
) {
  const out = new Map<number, T>();
  let total: number | undefined, pages: number | undefined;
  for (let page = 1; page <= 10000; page++) {
    const raw = await request(
      s,
      `/api/application/${resource}?per_page=100&page=${page}`,
    );
    const parsed = z
      .object({
        data: z.array(z.object({ attributes: schema })),
        meta: z.object({
          pagination: z.object({
            total: z.number().int().nonnegative(),
            current_page: z.number().int(),
            total_pages: z.number().int().nonnegative(),
          }),
        }),
      })
      .safeParse(raw);
    if (!parsed.success)
      throw new AppError(
        502,
        "INVALID_RESPONSE",
        "Format data panel tidak sesuai kontrak API 1.x.",
      );
    const p = parsed.data.meta.pagination;
    if (
      p.current_page !== page ||
      (total !== undefined && p.total !== total) ||
      (pages !== undefined && p.total_pages !== pages)
    )
      throw new AppError(
        409,
        "PARTIAL_SYNC",
        "Data berubah saat sinkronisasi. Ulangi untuk mendapatkan daftar lengkap.",
      );
    total = p.total;
    pages = p.total_pages;
    for (const { attributes: a } of parsed.data.data) {
      if (out.has(a.id))
        throw new AppError(
          409,
          "PARTIAL_SYNC",
          "ID duplikat selama pagination. Sinkronisasi ulang.",
        );
      out.set(a.id, a);
    }
    if (page >= pages) {
      if (out.size !== total)
        throw new AppError(
          409,
          "PARTIAL_SYNC",
          "Jumlah data tidak cocok dengan metadata panel.",
        );
      return { items: [...out.values()], total };
    }
  }
  throw new AppError(
    413,
    "TOO_MANY_PAGES",
    "Panel melebihi batas 10.000 halaman.",
  );
}
export async function single<T>(
  s: Session,
  resource: string,
  id: number,
  schema: z.ZodType<T>,
) {
  const p = z
    .object({ attributes: schema })
    .safeParse(await request(s, `/api/application/${resource}/${id}`));
  if (!p.success)
    throw new AppError(
      502,
      "INVALID_RESPONSE",
      "Respons detail panel tidak valid.",
    );
  return p.data.attributes;
}
