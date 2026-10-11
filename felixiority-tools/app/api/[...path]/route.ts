import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorMessage } from "@/lib/errors";
import { checkOrigin, panelURL, token } from "@/lib/security";
import {
  session,
  saveSession,
  rate,
  scope,
  del,
  get,
  put,
  logs,
  audit,
  protectedIds,
  protect,
  locked,
  panelKey,
} from "@/lib/store";
import { id, type Session, type Runtime } from "@/lib/model";
import { sync } from "@/lib/services/sync";
import { users } from "@/lib/services/users";
import { servers } from "@/lib/services/servers";
import { request, allPages } from "@/lib/services/transport";
import { createJob, getJob, stepJob } from "@/lib/jobs";
import { refreshRuntime } from "@/lib/services/runtime-sync";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const cookie = "felix_session";
async function body(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 100000)
    throw new AppError(413, "BODY", "Permintaan terlalu besar.");
  const reader = req.body?.getReader();
  if (!reader) throw new AppError(400, "JSON", "Body wajib diisi.");
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 100000) {
      await reader.cancel();
      throw new AppError(413, "BODY", "Permintaan terlalu besar.");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.length > 100000)
    throw new AppError(413, "BODY", "Permintaan terlalu besar.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, "JSON", "JSON tidak valid.");
  }
}
function response(v: unknown) {
  return NextResponse.json(v, { headers: { "Cache-Control": "no-store" } });
}
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  let active: Session | undefined;
  try {
    const path = (await params).path.join("/");
    const mut = req.method !== "GET";
    if (mut) checkOrigin(req);
    const sid = req.cookies.get(cookie)?.value || "";
    if (path === "connect" && req.method === "POST") {
      await rate(
        "connect:" +
          (process.env.TRUST_PROXY === "true"
            ? req.headers.get("x-real-ip") || "anonymous"
            : "shared"),
        10,
      );
      const b = z
        .object({
          domain: z.string().max(253),
          key: z.string().regex(/^ptla_[a-zA-Z0-9]{16,256}$/),
        })
        .parse(await body(req));
      const secure = !(
        process.env.NODE_ENV !== "production" &&
        process.env.ALLOW_INSECURE_DEV === "true"
      );
      if (secure && !process.env.APP_ORIGIN?.startsWith("https://"))
        throw new AppError(
          503,
          "HTTPS_REQUIRED",
          "Produksi memerlukan APP_ORIGIN HTTPS.",
        );
      const s: Session = {
        domain: panelURL(b.domain),
        key: b.key,
        csrf: token(),
        expiresAt:
          Date.now() +
          Math.min(
            86400,
            Math.max(300, Number(process.env.SESSION_TTL_SECONDS) || 3600),
          ) *
            1000,
        settings: { checks: 2, interval: 2, minStopped: 3, dryRun: false },
      };
      await Promise.all([users.all(s), servers.all(s)]);
      const newId = token();
      await saveSession(newId, s);
      if (sid) await del("session:" + scope(sid));
      await audit(s, "connect", "success");
      const r = response({ ok: true });
      r.cookies.set(cookie, newId, {
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/",
        maxAge: Math.floor((s.expiresAt - Date.now()) / 1000),
      });
      return r;
    }
    active = await session(sid);
    const s = active;
    await rate("session:" + scope(sid), 180);
    if (mut && req.headers.get("x-csrf-token") !== s.csrf)
      throw new AppError(
        403,
        "CSRF",
        "Token sesi tidak valid. Muat ulang halaman.",
      );
    if (path === "session" && req.method === "GET")
      return response({
        domain: s.domain,
        csrf: s.csrf,
        expiresAt: s.expiresAt,
        settings: s.settings,
        hasRuntime: !!s.clientKey,
        protectedIds: await protectedIds(s),
        bulkDelete: process.env.ENABLE_BULK_DELETE === "true",
        apiVersion:
          "Pterodactyl 1.x (kontrak API; versi instalasi tidak dideteksi)",
      });
    if (path === "snapshot" && req.method === "GET")
      return response(
        await sync(s, sid, req.nextUrl.searchParams.get("force") === "1"),
      );
    if (path === "runtime" && req.method === "GET")
      return response(await refreshRuntime(s, sid));
    if (path === "logs" && req.method === "GET") return response(await logs(s));
    if (path === "disconnect" && req.method === "POST") {
      await audit(s, "disconnect", "success");
      await del("session:" + scope(sid));
      await del("snapshot:" + scope(sid));
      await del("runtime:" + scope(sid));
      await del("runtime-round:" + scope(sid));
      const r = response({ ok: true });
      r.cookies.delete(cookie);
      return r;
    }
    if (path === "settings" && req.method === "POST") {
      const b = z
        .object({
          clientKey: z
            .string()
            .regex(/^ptlc_[a-zA-Z0-9]{16,256}$/)
            .optional(),
          removeRuntime: z.boolean().optional(),
          checks: z.number().int().min(1).max(5),
          interval: z.number().int().min(1).max(5),
          minStopped: z.number().int().min(0).max(20),
          dryRun: z.boolean(),
        })
        .parse(await body(req));
      if (b.clientKey) {
        const temp = { ...s, clientKey: b.clientKey };
        const account = await request(
          temp,
          "/api/client/account",
          "GET",
          undefined,
          true,
        );
        if (
          !z
            .object({
              attributes: z.object({ id: z.number(), username: z.string() }),
            })
            .safeParse(account).success
        )
          throw new AppError(
            502,
            "INVALID_RESPONSE",
            "Respons akun Client API tidak valid.",
          );
        s.clientKey = b.clientKey;
      }
      if (b.removeRuntime) delete s.clientKey;
      s.settings = {
        checks: b.checks,
        interval: b.interval,
        minStopped: b.minStopped,
        dryRun: b.dryRun,
      };
      await saveSession(sid, s);
      await del("runtime:" + scope(sid));
      await del("runtime-round:" + scope(sid));
      return response({ ok: true });
    }
    if (path === "protect" && req.method === "POST") {
      const b = z.object({ id, protected: z.boolean() }).parse(await body(req));
      await locked("panel:" + panelKey(s), async (assertHeld) => {
        await servers.get(s, b.id);
        await assertHeld();
        await protect(s, b.id, b.protected);
        await audit(s, "protect", b.protected ? "enabled" : "disabled", b.id);
      });
      return response({ ok: true });
    }
    if (path === "rename" && req.method === "POST") {
      const b = z
        .object({ id, name: z.string().trim().min(1).max(191) })
        .parse(await body(req));
      await locked("panel:" + panelKey(s), async (assertHeld) => {
        const current = await servers.get(s, b.id);
        await assertHeld();
        await servers.rename(s, current, b.name);
        await audit(s, "rename", "success", b.id);
      });
      await del("snapshot:" + scope(sid));
      return response({ ok: true });
    }
    if (path === "details" && req.method === "GET") {
      const target = id.parse(Number(req.nextUrl.searchParams.get("id"))),
        srv = await servers.get(s, target);
      let allocation: unknown = null,
        egg: unknown = null;
      const notices: string[] = [];
      await Promise.all([
        allPages(
          s,
          `nodes/${srv.node}/allocations`,
          z.object({ id, ip: z.string(), port: z.number().int() }),
        )
          .then((x) => {
            allocation = x.items.find((a) => a.id === srv.allocation) || null;
          })
          .catch((e) => notices.push(errorMessage(e))),
        request(s, `/api/application/nests/${srv.nest}/eggs/${srv.egg}`)
          .then((x) => {
            const p = z
              .object({ attributes: z.object({ id, name: z.string() }) })
              .safeParse(x);
            egg = p.success ? p.data.attributes : null;
          })
          .catch((e) => notices.push(errorMessage(e))),
      ]);
      return response({ server: srv, allocation, egg, notices });
    }
    if (path === "jobs" && req.method === "POST")
      return response(await createJob(s, sid, await body(req)));
    if (path.startsWith("jobs/") && req.method === "GET")
      return response(await getJob(sid, path.slice(5)));
    if (path.startsWith("jobs/") && req.method === "POST") {
      const b = z
        .object({
          phrase: z.string().optional(),
          cancel: z.boolean().optional(),
        })
        .parse(await body(req));
      return response(await stepJob(s, sid, path.slice(5), b.phrase, b.cancel));
    }
    throw new AppError(404, "NOT_FOUND", "Endpoint tidak ditemukan.");
  } catch (e) {
    if (active) await audit(active, "request", "failed").catch(() => {});
    const status =
      e instanceof AppError ? e.status : e instanceof z.ZodError ? 400 : 503;
    const r = response({
      error: {
        code:
          e instanceof AppError
            ? e.code
            : e instanceof z.ZodError
              ? "VALIDATION"
              : "SERVICE_UNAVAILABLE",
        message:
          e instanceof z.ZodError
            ? "Format input tidak valid. Periksa isian."
            : errorMessage(e),
        retryAfter: e instanceof AppError ? e.retryAfter : undefined,
      },
    });
    r.headers.set("Cache-Control", "no-store");
    if (e instanceof AppError && e.retryAfter)
      r.headers.set("Retry-After", String(e.retryAfter));
    return new NextResponse(r.body, { status, headers: r.headers });
  }
}
export const GET = handler;
export const POST = handler;
